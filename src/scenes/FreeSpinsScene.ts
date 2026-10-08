/**
 * ФРІСПІНИ після перемоги над босом: 10 спінів без ставки.
 * Уся серія рахується логікою наперед (runFreeSpins) і одразу зараховується на баланс —
 * тут лише показ спін за спіном. Символи-множники додаються до загального множника серії,
 * і всі виграші серії множаться на нього (лічильник «ВИГРАШ СЕРІЇ» перераховується наживо).
 */
import Phaser from 'phaser';
import { CAVE_PARALLAX } from '../config/game';
import { BOSSES } from '../config/bosses';
import { MULTIPLIER_VALUE, SLOT, SYMBOLS } from '../config/slot';
import { TEXTS, pick } from '../config/texts';
import { createSlotPlaceholders } from '../core/assets/placeholders';
import { sfx } from '../core/audio/Sfx';
import { Fx } from '../core/fx/Fx';
import { settleFreeSpins } from '../core/slot/session';
import { SlotRng, runFreeSpins, unitsToChips, type FreeSpinSeries } from '../core/slot/slot';
import { gameState, persist } from '../core/state/store';
import { ReelView } from '../ui/slot/ReelView';
import { COLORS, txt } from '../ui/text';
import { allSlotSymbolLooks, type SlotReturn } from './SlotScene';
import { SCENES } from './keys';

export interface FreeSpinsStart {
  bossId: string;
  bet: number;
  startMultiplier: number;
  newBoss: boolean;
}

const isMultiplier = (id: string) => id in MULTIPLIER_VALUE;

export class FreeSpinsScene extends Phaser.Scene {
  private reels!: ReelView;
  private fx!: Fx;
  private series!: FreeSpinSeries;
  private start!: FreeSpinsStart;
  private turbo = false;
  private finished = false;
  private left = false;
  private spinText!: Phaser.GameObjects.Text;
  private multText!: Phaser.GameObjects.Text;
  private totalText!: Phaser.GameObjects.Text;
  private msgText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.freeSpins);
  }

  create(data: FreeSpinsStart): void {
    this.start = data;
    this.turbo = false;
    this.finished = false;
    this.left = false;
    const s = gameState();
    const boss = BOSSES[data.bossId]!;
    createSlotPlaceholders(this, allSlotSymbolLooks());
    this.fx = new Fx(this);

    // 1) результат — одразу і повністю (той самий seed-RNG слота), зараховуємо до анімації
    const rng = new SlotRng(s.slotSeed);
    this.series = runFreeSpins(boss.freeSpins, data.bet, data.startMultiplier, rng);
    s.slotSeed = rng.state;
    settleFreeSpins(s, this.series.win);
    persist();

    // 2) екран
    const { width, height } = this.scale;
    for (const l of CAVE_PARALLAX) if (this.textures.exists(l.key)) this.add.tileSprite(0, 0, width, height, l.key).setOrigin(0, 0).setTilePosition(320, 140);
    this.add.rectangle(0, 0, width, height, 0x14040a, 0.75).setOrigin(0, 0);
    const title = txt(this, width / 2, 8, `ФРІСПІНИ: ${boss.freeSpins.name.toUpperCase()}`, 16, COLORS.gold, { stroke: '#2a1000', strokeThickness: 3 }).setOrigin(0.5, 0);
    this.tweens.add({ targets: title, scale: { from: 1, to: 1.05 }, yoyo: true, repeat: -1, duration: 500 });
    const odds = Object.entries(boss.freeSpins.multipliers)
      .map(([v]) => `x${v}`)
      .join(' ');
    txt(this, width / 2, 28, `Множники ${odds} додаються до загального • бос: ${boss.name}`, 8, COLORS.dim).setOrigin(0.5, 0);

    const fillers = SYMBOLS.filter((x) => x.kind !== 'scatter' && x.kind !== 'curse' && (x.kind !== 'multiplier' || `${MULTIPLIER_VALUE[x.id]}` in boss.freeSpins.multipliers)).map((x) => x.id);
    const initial = Array.from({ length: SLOT.cols }, () => Array.from({ length: SLOT.rows }, () => fillers[Math.floor(Math.random() * fillers.length)]!));
    this.reels = new ReelView(this, Math.round((width - (SLOT.cols * 44 - 4)) / 2), 46, initial);

    const lx = 12;
    txt(this, lx, 60, 'СПІН', 8, COLORS.dim);
    this.spinText = txt(this, lx, 70, '', 8, COLORS.text);
    txt(this, lx, 92, 'МНОЖНИК', 8, COLORS.dim);
    this.multText = txt(this, lx + 30, 112, `x${data.startMultiplier}`, 16, COLORS.gold, { stroke: '#000000', strokeThickness: 2 }).setOrigin(0.5);
    const rx = width - 104;
    txt(this, rx, 60, 'ВИГРАШ СЕРІЇ', 8, COLORS.dim);
    this.totalText = txt(this, rx, 72, '0', 16, COLORS.gold, { stroke: '#000000', strokeThickness: 2 });
    txt(this, rx, 96, `ставка ${data.bet}`, 8, COLORS.dim);
    this.msgText = txt(this, width / 2, 200, data.newBoss ? 'Новий бос у колекції!' : '', 8, COLORS.green, { align: 'center' }).setOrigin(0.5, 0);
    txt(this, width / 2, height - 12, 'пробіл — швидше', 8, COLORS.dim).setOrigin(0.5, 0);

    const kb = this.input.keyboard!;
    for (const k of ['SPACE', 'E', 'ENTER', 'J']) kb.on(`keydown-${k}`, () => (this.finished ? this.leave() : (this.turbo = true)));
    this.input.on('pointerdown', () => (this.finished ? this.leave() : (this.turbo = true)));

    this.cameras.main.fadeIn(400, 0, 0, 0);
    this.time.delayedCall(700, () => void this.play());
  }

  update(_t: number, delta: number): void {
    this.fx.update(delta);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.time.delayedCall(this.turbo ? ms * 0.35 : ms, r));
  }

  /** Показ серії: кожен спін → лінії → множники «летять» у лічильник → загальна сума перераховується. */
  private async play(): Promise<void> {
    const { bet } = this.start;
    const fillers = [...new Set(this.series.spins.flatMap((s) => s.grid.flat()))];
    let units = 0;
    let mult = this.series.startMultiplier;
    let shownTotal = 0;
    for (let i = 0; i < this.series.spins.length; i++) {
      const sp = this.series.spins[i]!;
      this.spinText.setText(`${i + 1} / ${this.series.spins.length}`);
      await this.reels.spinTo(sp.grid, { fillerIds: fillers, nearMiss: false, baseMs: this.turbo ? 260 : 520, staggerMs: this.turbo ? 50 : 110 });
      if (sp.lineWins.length) {
        this.reels.highlight(sp.lineWins);
        units += sp.units;
        sfx.play('winSmall');
      }
      if (sp.multipliers.length) {
        const pts = this.reels.pulseWhere(isMultiplier);
        sfx.play('scatter');
        await this.wait(300);
        for (let k = 0; k < sp.multipliers.length; k++) {
          const m = sp.multipliers[k]!;
          const from = pts[k] ?? { x: this.scale.width / 2, y: 100 };
          await this.flyMultiplier(from.x, from.y, m);
          mult += m;
          this.multText.setText(`x${mult}`);
          this.tweens.add({ targets: this.multText, scale: { from: 1.6, to: 1 }, duration: 260, ease: 'Back.easeOut' });
          sfx.play('coin');
        }
      }
      // загальний виграш = усі лінії серії × поточний множник (як і в логіці)
      const total = unitsToChips(units, bet, mult);
      if (total !== shownTotal) {
        this.countTo(shownTotal, total);
        shownTotal = total;
      }
      await this.wait(sp.lineWins.length || sp.multipliers.length ? 750 : 320);
      this.reels.clearHighlight();
    }
    this.finish();
  }

  private flyMultiplier(x: number, y: number, m: number): Promise<void> {
    const t = txt(this, x, y, `+x${m}`, 16, COLORS.gold, { stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(50);
    return new Promise((resolve) => {
      this.tweens.add({
        targets: t,
        x: this.multText.x,
        y: this.multText.y,
        scale: { from: 1.3, to: 0.7 },
        duration: this.turbo ? 220 : 480,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          t.destroy();
          resolve();
        },
      });
    });
  }

  private countTo(from: number, to: number): void {
    const o = { v: from };
    this.tweens.add({ targets: o, v: to, duration: 500, onUpdate: () => this.totalText.setText(`${Math.round(o.v)}`) });
  }

  private finish(): void {
    this.finished = true;
    const win = this.series.win;
    this.totalText.setText(`${win}`);
    const bets = win / this.start.bet;
    const { width } = this.scale;
    const big = bets >= 20;
    sfx.play(big ? 'winBig' : win > 0 ? 'winSmall' : 'reelStop');
    if (win > 0) {
      this.fx.playFx('firework', width / 2, 110, { scale: big ? 2 : 1.2, depth: 60 });
      if (big) this.cameras.main.shake(300, 0.006);
    }
    const head = win > 0 ? (big ? 'ЗАНОС!' : pick(TEXTS.smallWin)) : 'Майже!';
    this.msgText
      .setText(`${head}  +${win} фішок (${bets.toFixed(1)} ставки, множник x${this.series.totalMultiplier})\nE / пробіл — назад до автомата`)
      .setColor(COLORS.gold);
  }

  private leave(): void {
    if (!this.finished || this.left) return;
    this.left = true;
    const back: SlotReturn = { message: `Фріспіни: +${this.series.win} фішок`, color: COLORS.gold };
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.slot, back));
  }
}
