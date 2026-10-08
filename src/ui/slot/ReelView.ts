/**
 * Барабани слота 5×3. Результат уже відомий (рахується до анімації) — тут лише показуємо його.
 *
 * Анімація барабана: колонка — це «стрічка» символів [фінальні 3 зверху, випадкові нижче].
 * Стартуємо, показуючи випадкову нижню частину, і твінимо стрічку вниз до фінальних символів —
 * виходить прокрутка вниз з плавною зупинкою. Барабани зупиняються зліва направо;
 * near-miss (2 скатери вже видно) — решта барабанів крутиться довше, рамка «напружено» блимає.
 */
import Phaser from 'phaser';
import { SLOT } from '../../config/slot';
import { slotSymbolKey, SLOT_SYMBOL_SIZE } from '../../core/assets/placeholders';
import { isScatter, type Grid, type LineWin } from '../../core/slot/slot';
import { sfx } from '../../core/audio/Sfx';

export const CELL = SLOT_SYMBOL_SIZE + 4;

export interface SpinAnimOptions {
  /** Тривалість першого барабана, мс. */
  baseMs?: number;
  /** Затримка зупинки кожного наступного барабана, мс. */
  staggerMs?: number;
  /** Символи для «стрічки» прокрутки. */
  fillerIds: string[];
  /** Чи робити near-miss (для фріспінів — ні). */
  nearMiss?: boolean;
  /** Скільки довше крутиться кожен барабан після near-miss, мс (турбо — коротше). */
  nearMissMs?: number;
  onReelStop?: (col: number) => void;
}

export class ReelView {
  readonly width = SLOT.cols * CELL - 4;
  readonly height = SLOT.rows * CELL - 4;
  private columns: Phaser.GameObjects.Container[] = [];
  private finalImages: Phaser.GameObjects.Image[][] = [];
  private overlay: Phaser.GameObjects.Graphics;
  private frame: Phaser.GameObjects.Graphics;
  private pulses: Phaser.Tweens.Tween[] = [];
  private grid: Grid = [];

  constructor(
    private scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    initial: Grid,
  ) {
    this.frame = scene.add.graphics().setDepth(5);
    this.drawFrame(0xd4a35a);
    const maskShape = scene.make.graphics({ x: 0, y: 0 }, false);
    maskShape.fillStyle(0xffffff).fillRect(x, y, this.width, this.height);
    const mask = maskShape.createGeometryMask();
    for (let c = 0; c < SLOT.cols; c++) {
      const col = scene.add.container(x + c * CELL, y).setDepth(6).setMask(mask);
      this.columns.push(col);
    }
    this.overlay = scene.add.graphics().setDepth(8);
    this.show(initial);
  }

  private drawFrame(color: number): void {
    const g = this.frame;
    g.clear();
    g.fillStyle(0x0a0608, 1).fillRect(this.x - 6, this.y - 6, this.width + 12, this.height + 12);
    g.lineStyle(2, color, 1).strokeRect(this.x - 5, this.y - 5, this.width + 10, this.height + 10);
    g.lineStyle(1, 0x5a3a1a, 1).strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
    for (let c = 1; c < SLOT.cols; c++) g.fillStyle(0x2a1810, 1).fillRect(this.x + c * CELL - 3, this.y, 2, this.height);
  }

  private makeImage(id: string, yIndex: number): Phaser.GameObjects.Image {
    const k = slotSymbolKey(this.scene, id);
    return this.scene.add.image(SLOT_SYMBOL_SIZE / 2, yIndex * CELL + SLOT_SYMBOL_SIZE / 2, k.key, k.frame);
  }

  /** Миттєво показати сітку (без анімації). */
  show(grid: Grid): void {
    this.grid = grid;
    this.finalImages = [];
    this.columns.forEach((col, c) => {
      col.removeAll(true);
      col.y = this.y;
      const imgs = grid[c]!.map((id, r) => this.makeImage(id, r));
      col.add(imgs);
      this.finalImages.push(imgs);
    });
  }

  /** Прокрутити до сітки. Повертає Promise, що виконується після зупинки всіх барабанів. */
  spinTo(grid: Grid, o: SpinAnimOptions): Promise<void> {
    this.clearHighlight();
    this.grid = grid;
    const base = o.baseMs ?? 700;
    const stagger = o.staggerMs ?? 180;
    const nearMissMs = o.nearMissMs ?? SLOT.nearMiss.extraMs;
    // near-miss: результат відомий наперед — рахуємо, після якого барабана вже видно 2 скатери
    let extraFrom = SLOT.cols;
    if (o.nearMiss) {
      let seen = 0;
      for (let c = 0; c < SLOT.cols - 1; c++) {
        seen += grid[c]!.filter(isScatter).length;
        if (seen >= SLOT.nearMiss.scatters) {
          extraFrom = c + 1;
          break;
        }
      }
    }
    sfx.play('spin');
    const promises = this.columns.map((col, c) => {
      const extra = c >= extraFrom ? (c - extraFrom + 1) * nearMissMs : 0;
      const duration = base + c * stagger + extra;
      const stripLen = 3 + Math.round(duration / 45);
      col.removeAll(true);
      const imgs: Phaser.GameObjects.Image[] = [];
      for (let i = 0; i < stripLen; i++) {
        const id = i < 3 ? grid[c]![i]! : o.fillerIds[Math.floor(Math.random() * o.fillerIds.length)]!;
        imgs.push(this.makeImage(id, i));
      }
      col.add(imgs);
      this.finalImages[c] = imgs.slice(0, 3);
      col.y = this.y - (stripLen - 3) * CELL;
      return new Promise<void>((resolve) => {
        if (c === extraFrom) {
          // на зупинці барабана перед near-miss — «напруга»
          this.scene.time.delayedCall(base + (c - 1) * stagger, () => this.startTension());
        }
        this.scene.tweens.add({
          targets: col,
          y: this.y,
          duration,
          ease: 'Back.easeOut',
          easeParams: [0.6],
          onComplete: () => {
            sfx.play('reelStop');
            if (grid[c]!.some(isScatter)) sfx.play('scatter');
            o.onReelStop?.(c);
            if (c === SLOT.cols - 1) this.stopTension();
            resolve();
          },
        });
      });
    });
    return Promise.all(promises).then(() => undefined);
  }

  private tensionTween?: Phaser.Tweens.Tween;

  private startTension(): void {
    sfx.tension(true);
    let on = false;
    this.tensionTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 120,
      repeat: -1,
      onRepeat: () => {
        on = !on;
        this.drawFrame(on ? 0xff3a3a : 0xffd25a);
      },
    });
  }

  private stopTension(): void {
    sfx.tension(false);
    this.tensionTween?.stop();
    this.tensionTween = undefined;
    this.drawFrame(0xd4a35a);
  }

  cellCenter(col: number, row: number): { x: number; y: number } {
    return { x: this.x + col * CELL + SLOT_SYMBOL_SIZE / 2, y: this.y + row * CELL + SLOT_SYMBOL_SIZE / 2 };
  }

  /** Підсвітити виграшні лінії і «пульсувати» символами, що зіграли. */
  highlight(wins: LineWin[]): void {
    const g = this.overlay;
    g.clear();
    const colors = [0xffd25a, 0xff5a8a, 0x5affc8, 0x5ab4ff, 0xff9a3a, 0xc85aff];
    const cells = new Set<string>();
    wins.forEach((w, i) => {
      const line = SLOT.paylines[w.line]!;
      g.lineStyle(2, colors[i % colors.length]!, 0.9);
      g.beginPath();
      line.forEach((row, col) => {
        const p = this.cellCenter(col, row);
        if (col === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      });
      g.strokePath();
      for (let col = 0; col < w.count; col++) cells.add(`${col},${line[col]}`);
    });
    for (const key of cells) {
      const [c, r] = key.split(',').map(Number) as [number, number];
      const img = this.finalImages[c]?.[r];
      if (img) this.pulses.push(this.scene.tweens.add({ targets: img, scale: 1.12, yoyo: true, repeat: -1, duration: 260 }));
    }
  }

  /** Пульсувати конкретними клітинками (скатери, множники). */
  pulseWhere(pred: (id: string) => boolean): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    this.grid.forEach((col, c) =>
      col.forEach((id, r) => {
        if (!pred(id)) return;
        const img = this.finalImages[c]?.[r];
        if (img) this.pulses.push(this.scene.tweens.add({ targets: img, scale: 1.2, yoyo: true, repeat: -1, duration: 200 }));
        pts.push(this.cellCenter(c, r));
      }),
    );
    return pts;
  }

  clearHighlight(): void {
    this.overlay.clear();
    for (const t of this.pulses) t.stop();
    this.pulses = [];
    for (const col of this.finalImages) for (const img of col) img.setScale(1);
  }
}
