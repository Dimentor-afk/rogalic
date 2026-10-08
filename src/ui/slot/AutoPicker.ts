/**
 * Вікно вибору автоспіну поверх барабанів: кількість (10 / 25 / 50 / 100 / ∞), «стоп на заносі» і СТАРТ.
 * Вікно модальне: темна підкладка ловить кліки повз нього (закриває), кнопки під нею недоступні.
 */
import Phaser from 'phaser';
import { COLORS, txt } from '../text';
import { AUTO_BIG_WIN_BETS, AUTO_COUNTS, autoCountIndex } from './autospin';
import { SlotButton } from './SlotButton';

export interface AutoPickerHandlers {
  /** Старт з вибраною кількістю (0 — ∞) і прапорцем «стоп на заносі». */
  onStart: (count: number, stopOnBigWin: boolean) => void;
  /** Гравець змінив вибір (щоб зберегти в налаштуваннях). */
  onChange: (count: number, stopOnBigWin: boolean) => void;
  onClose: () => void;
}

const DEPTH = 30;

type PanelPart = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.Depth;

export class AutoPicker {
  private objects: PanelPart[] = [];
  private chips: SlotButton[] = [];
  private start: SlotButton;
  private costText: Phaser.GameObjects.Text;
  private check: Phaser.GameObjects.Graphics;
  private boxX: number;
  private boxY: number;
  private index = 0;
  private stopOnBigWin = true;
  private bet = 0;
  isOpen = false;

  constructor(
    scene: Phaser.Scene,
    cx: number,
    cy: number,
    private h: AutoPickerHandlers,
  ) {
    const { width, height } = scene.scale;
    const pw = 208;
    const ph = 116;
    const top = cy - ph / 2;
    const backdrop = scene.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0, 0).setInteractive();
    backdrop.on('pointerdown', () => this.h.onClose());
    // сама панель теж інтерактивна — клік по ній не «провалюється» до підкладки
    const panel = scene.add.rectangle(cx, cy, pw, ph, 0x0a0608, 1).setInteractive();
    const frame = scene.add.graphics();
    frame.lineStyle(2, 0xd4a35a, 1).strokeRect(cx - pw / 2 + 1, top + 1, pw - 2, ph - 2);
    frame.lineStyle(1, 0x5a3a1a, 1).strokeRect(cx - pw / 2 + 4, top + 4, pw - 8, ph - 8);
    const title = txt(scene, cx, top + 9, 'АВТОСПІН', 8, COLORS.gold).setOrigin(0.5, 0);
    this.objects.push(backdrop, panel, frame, title);

    // ряд кількостей
    const cw = 34;
    const gap = 5;
    const left = cx - (AUTO_COUNTS.length * cw + (AUTO_COUNTS.length - 1) * gap) / 2;
    AUTO_COUNTS.forEach((n, i) => {
      const chip = new SlotButton(scene, left + i * (cw + gap) + cw / 2, top + 28, cw, 16, n ? `${n}` : '', () => this.select(i));
      if (!n) chip.setLabel('', true);
      this.chips.push(chip);
    });
    this.costText = txt(scene, cx, top + 40, '', 8, COLORS.dim).setOrigin(0.5, 0);

    // прапорець «стоп на заносі»: квадратик + підпис, клікабельні разом
    const rowY = top + 58;
    const label = txt(scene, cx + 6, rowY, `стоп на заносі (від x${AUTO_BIG_WIN_BETS} ставки)`, 8, COLORS.text).setOrigin(0.5);
    this.boxX = Math.round(label.x - label.width / 2 - 12);
    this.boxY = Math.round(rowY - 4);
    this.check = scene.add.graphics();
    const hit = scene.add.zone(cx, rowY, label.width + 24, 12).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.toggleBigWin());
    const always = txt(scene, cx, top + 68, 'завжди стоп: бонуска, прокляття, мало фішок', 8, COLORS.dim).setOrigin(0.5, 0);
    this.objects.push(this.costText, label, this.check, hit, always);

    this.start = new SlotButton(scene, cx, top + 96, 72, 18, 'СТАРТ', () => this.confirm(), 'slotui/ico_auto').setLit(true);

    for (const o of this.objects) o.setDepth(DEPTH);
    for (const c of this.chips) c.setDepth(DEPTH + 1);
    this.start.setDepth(DEPTH + 1);
    this.setVisible(false);
  }

  open(count: number, stopOnBigWin: boolean, bet: number): void {
    this.index = autoCountIndex(count);
    this.stopOnBigWin = stopOnBigWin;
    this.bet = bet;
    this.isOpen = true;
    this.setVisible(true);
    this.redraw();
  }

  close(): void {
    this.isOpen = false;
    this.setVisible(false);
  }

  /** Наступний / попередній варіант кількості (T, A/D). */
  cycle(d: number): void {
    const n = AUTO_COUNTS.length;
    this.select((this.index + d + n) % n);
  }

  toggleBigWin(): void {
    this.stopOnBigWin = !this.stopOnBigWin;
    this.changed();
  }

  confirm(): void {
    this.h.onStart(this.count(), this.stopOnBigWin);
  }

  private count(): number {
    return AUTO_COUNTS[this.index]!;
  }

  private select(i: number): void {
    this.index = i;
    this.changed();
  }

  private changed(): void {
    this.redraw();
    this.h.onChange(this.count(), this.stopOnBigWin);
  }

  private redraw(): void {
    this.chips.forEach((c, i) => c.setLit(i === this.index));
    const n = this.count();
    this.costText.setText(n ? `${n} спінів по ${this.bet} = до ${n * this.bet} фішок` : `по ${this.bet} фішок, поки не зупиниш`);
    // квадратик прапорця: рамка, темне поле, а якщо увімкнено — неонова «галочка»-квадрат
    const g = this.check;
    const x = this.boxX;
    const y = this.boxY;
    g.clear();
    g.fillStyle(0xd4a35a, 1).fillRect(x, y, 8, 8);
    g.fillStyle(0x0a0608, 1).fillRect(x + 1, y + 1, 6, 6);
    if (this.stopOnBigWin) g.fillStyle(0xff5a8a, 1).fillRect(x + 2, y + 2, 4, 4);
  }

  private setVisible(v: boolean): void {
    for (const o of this.objects) o.setVisible(v);
    for (const c of this.chips) c.setVisible(v);
    this.start.setVisible(v);
  }
}
