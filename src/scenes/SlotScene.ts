/**
 * ЕКРАН СЛОТА. Гравець підходить до автомата в хабі — відкривається цей екран.
 * Результат спіна рахується логікою (src/core/slot) ДО анімації; тут лише показ:
 * барабани, лінії, виграш, звук (навіть на мінімальних сумах), near-miss, гарант, «Купити бонус».
 */
import Phaser from 'phaser';
import { CAVE_PARALLAX } from '../config/game';
import { SLOT, SYMBOLS } from '../config/slot';
import { BOSSES } from '../config/bosses';
import { CURSES } from '../config/curses';
import { TEXTS, pick } from '../config/texts';
import { createSlotPlaceholders } from '../core/assets/placeholders';
import { sfx } from '../core/audio/Sfx';
import { SlotRng, isScatter, spin, type Grid, type SpinResult } from '../core/slot/slot';
import { availableBosses, buyBonusCost, chargeBuyBonus, chargeSpin, settleSpin } from '../core/slot/session';
import { gameState, persist } from '../core/state/store';
import { Fx } from '../core/fx/Fx';
import { ReelView } from '../ui/slot/ReelView';
import { COLORS, txt } from '../ui/text';
import type { BossFightStart } from './BossArenaScene';
import type { HubArrival } from './DungeonScene';
import { SCENES } from './keys';

/** Символи для «стрічки» прокрутки (без множників). */
const FILLER = SYMBOLS.filter((s) => s.kind !== 'multiplier' && s.kind !== 'scatter').map((s) => s.id);

/** Повернення до автомата з повідомленням (після фріспінів). */
export interface SlotReturn {
  message?: string;
  color?: string;
}

export function allSlotSymbolLooks() {
  const looks = SYMBOLS.filter((s) => s.kind !== 'scatter').map((s) => ({ id: s.id, label: s.label, kind: s.kind, color: s.color }));
  for (const b of Object.values(BOSSES)) looks.push({ id: `sc:${b.id}`, label: b.scatter.label, kind: 'scatter', color: b.scatter.color });
  return looks;
}

export class SlotScene extends Phaser.Scene {
  private reels!: ReelView;
  private rng!: SlotRng;
  private busy = false;
  private autoLeft = 0;
  private fx!: Fx;
  private balanceText!: Phaser.GameObjects.Text;
  private betText!: Phaser.GameObjects.Text;
  private winText!: Phaser.GameObjects.Text;
  private msgText!: Phaser.GameObjects.Text;
  private guaranteeG!: Phaser.GameObjects.Graphics;
  private guaranteeText!: Phaser.GameObjects.Text;
  private buyText!: Phaser.GameObjects.Text;
  private autoText!: Phaser.GameObjects.Text;
  private buyBtn!: Phaser.GameObjects.Image;

  constructor() {
    super(SCENES.slot);
  }

  create(data: SlotReturn = {}): void {
    const s = gameState();
    this.rng = new SlotRng(s.slotSeed);
    this.busy = false;
    this.autoLeft = 0;
    if (!SLOT.bets.includes(s.bet)) s.bet = SLOT.bets[0]!;
    createSlotPlaceholders(this, allSlotSymbolLooks());
    this.fx = new Fx(this);

    const { width, height } = this.scale;
    // печерний фон за автоматом (казино всередині скелі)
    for (const l of CAVE_PARALLAX) if (this.textures.exists(l.key)) this.add.tileSprite(0, 0, width, height, l.key).setOrigin(0, 0).setTilePosition(200, 110);
    this.add.rectangle(0, 0, width, height, 0x050306, 0.72).setOrigin(0, 0);

    const title = txt(this, width / 2, 8, 'ДОДЕП-777', 16, '#ff5a8a', { stroke: '#2a0010', strokeThickness: 3 }).setOrigin(0.5, 0);
    this.tweens.add({ targets: title, alpha: { from: 1, to: 0.6 }, yoyo: true, repeat: -1, duration: 700 });
    txt(this, width / 2, 28, `${SLOT.paylines.length} ліній • 3 скатери боса = бонуска • 3 прокляття = прокляття`, 8, COLORS.dim).setOrigin(0.5, 0);

    // барабани
    const initial: Grid = Array.from({ length: SLOT.cols }, () => Array.from({ length: SLOT.rows }, () => FILLER[Math.floor(Math.random() * FILLER.length)]!));
    this.reels = new ReelView(this, Math.round((width - (SLOT.cols * 44 - 4)) / 2), 46, initial);

    // ліва панель
    const lx = 12;
    txt(this, lx, 60, 'БАЛАНС', 8, COLORS.dim);
    this.balanceText = txt(this, lx, 70, '', 8, COLORS.gold);
    txt(this, lx, 88, 'СТАВКА', 8, COLORS.dim);
    this.betText = txt(this, lx, 98, '', 8, COLORS.text);
    this.button(lx, 112, '< менше', () => this.changeBet(-1), 50);
    this.button(lx + 54, 112, 'більше >', () => this.changeBet(1), 50);
    txt(this, lx, 136, 'ВИГРАШ', 8, COLORS.dim);
    this.winText = txt(this, lx, 146, '0', 8, COLORS.text);
    this.autoText = txt(this, lx, 166, '', 8, COLORS.dim);

    // права панель: гарант + купити бонус
    const rx = width - 104;
    txt(this, rx, 52, 'ШКАЛА ГАРАНТУ', 8, COLORS.dim);
    this.guaranteeG = this.add.graphics();
    this.guaranteeText = txt(this, rx, 74, '', 8, COLORS.text);
    this.buyBtn = this.add.image(rx + 46, 112, 'slotui/buy').setInteractive({ useHandCursor: true });
    this.buyBtn.on('pointerdown', () => this.buyBonus());
    this.buyText = txt(this, rx + 46, 112, '', 8, '#2a1000', { align: 'center' }).setOrigin(0.5);
    // велика золота кнопка, що блимає
    this.tweens.add({ targets: [this.buyBtn], scale: { from: 1, to: 1.08 }, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: [this.buyBtn], alpha: { from: 1, to: 0.75 }, yoyo: true, repeat: -1, duration: 210 });

    // кнопка спіна
    const spinBtn = this.add.image(width / 2, 196, 'slotui/button').setScale(1.6, 1.3).setInteractive({ useHandCursor: true });
    spinBtn.on('pointerdown', () => this.doSpin());
    txt(this, width / 2, 196, 'КРУТИТИ', 8, COLORS.white).setOrigin(0.5);
    this.msgText = txt(this, width / 2, 216, '', 8, COLORS.gold, { align: 'center' }).setOrigin(0.5, 0);
    txt(this, width / 2, height - 12, 'Space крутити  A/D ставка  B купити бонус  T автоспін  M звук  Esc до хабу', 8, COLORS.dim).setOrigin(0.5, 0);

    const kb = this.input.keyboard!;
    for (const k of ['SPACE', 'E', 'J', 'ENTER']) kb.on(`keydown-${k}`, () => this.doSpin());
    for (const k of ['LEFT', 'A']) kb.on(`keydown-${k}`, () => this.changeBet(-1));
    for (const k of ['RIGHT', 'D']) kb.on(`keydown-${k}`, () => this.changeBet(1));
    kb.on('keydown-B', () => this.buyBonus());
    kb.on('keydown-T', () => this.toggleAuto());
    kb.on('keydown-M', () => this.say(sfx.toggleMute() ? 'Звук вимкнено' : 'Звук увімкнено'));
    kb.on('keydown-ESC', () => this.leave());

    if (data.message) this.say(data.message, data.color ?? COLORS.gold);
    else if (s.debt === 0) this.say(pick(TEXTS.debtPaid), COLORS.green);
    this.refresh();
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  update(_t: number, delta: number): void {
    this.fx.update(delta);
    const pad = this.input.gamepad?.getPad(0);
    if (pad && !this.busy && pad.A) this.doSpin();
  }

  private button(x: number, y: number, label: string, fn: () => void, w = 64): void {
    const b = this.add.image(x, y, 'slotui/button').setOrigin(0, 0.5).setDisplaySize(w, 16).setInteractive({ useHandCursor: true });
    b.on('pointerdown', fn);
    txt(this, x + w / 2, y, label, 8, COLORS.text).setOrigin(0.5);
  }

  private refresh(): void {
    const s = gameState();
    this.balanceText.setText(`${s.balance}`);
    this.betText.setText(`${s.bet} фішок`);
    const rx = this.scale.width - 104;
    const g = this.guaranteeG;
    g.clear();
    g.fillStyle(0x000000, 0.7).fillRect(rx, 63, 92, 8);
    g.fillStyle(s.guarantee >= 100 ? 0xffd25a : 0xc08a3a, 1).fillRect(rx + 1, 64, Math.round((s.guarantee / 100) * 90), 6);
    this.guaranteeText.setText(s.guarantee >= 100 ? 'наступний — БОНУСКА!' : `${Math.floor(s.guarantee)}%  (кожен скатер +${SLOT.guarantee.perScatter}%)`);
    const cost = buyBonusCost(s.bet);
    this.buyText.setText(`КУПИТИ БОНУС\n${cost}`).setColor(s.balance >= cost ? '#2a1000' : '#7a5020');
    this.autoText.setText(this.autoLeft > 0 ? `автоспін: ${this.autoLeft}` : '');
  }

  private say(text: string, color: string = COLORS.gold): void {
    this.msgText.setText(text).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.msgText);
    this.tweens.add({ targets: this.msgText, alpha: 0.85, duration: 200 });
  }

  private changeBet(d: number): void {
    if (this.busy) return;
    const s = gameState();
    const i = Math.max(0, Math.min(SLOT.bets.length - 1, SLOT.bets.indexOf(s.bet) + d));
    s.bet = SLOT.bets[i]!;
    sfx.play('click');
    this.refresh();
  }

  private toggleAuto(): void {
    this.autoLeft = this.autoLeft > 0 ? 0 : 10;
    this.refresh();
    if (this.autoLeft > 0 && !this.busy) this.doSpin();
  }

  private async doSpin(): Promise<void> {
    if (this.busy) return;
    const s = gameState();
    if (s.balance < s.bet) {
      this.autoLeft = 0;
      this.say('Не вистачає фішок. Підземелля чекає', COLORS.red);
      this.cameras.main.shake(100, 0.004);
      return;
    }
    this.busy = true;
    // 1) ставку списуємо, результат рахуємо одразу (до анімації) і зберігаємо стан RNG
    chargeSpin(s, s.bet);
    const r = spin({ bet: s.bet, availableBosses: availableBosses(s), guaranteeFull: s.guarantee >= SLOT.guarantee.max, rng: this.rng });
    const outcome = settleSpin(s, r, this.rng);
    s.slotSeed = this.rng.state;
    persist();
    this.winText.setText('...');
    this.say('');
    this.refreshBalanceDuringSpin(s.balance - r.win);

    // 2) анімація
    await this.reels.spinTo(r.grid, { fillerIds: FILLER, nearMiss: true });

    // 3) показ результату
    this.present(r, outcome.curse);
    this.refresh();
    this.busy = false;
    if (r.bonusBoss) {
      this.autoLeft = 0;
      this.time.delayedCall(1600, () => this.startBonus(r.bonusBoss!, false));
      return;
    }
    if (this.autoLeft > 0) {
      this.autoLeft--;
      this.refresh();
      if (this.autoLeft > 0) this.time.delayedCall(r.win > 0 ? 900 : 350, () => this.doSpin());
    }
  }

  private refreshBalanceDuringSpin(balance: number): void {
    this.balanceText.setText(`${balance}`);
  }

  private present(r: SpinResult, curse: string | null): void {
    const s = gameState();
    if (r.lineWins.length) this.reels.highlight(r.lineWins);
    if (r.win > 0) {
      const big = r.win >= s.bet * 10;
      sfx.play(big ? 'winBig' : 'winSmall');
      this.countUp(r.win);
      // виграш менший за ставку — все одно «ВИГРАШ!» (так задумано)
      const label = r.win < s.bet ? `${pick(TEXTS.smallWin)} (+${r.win}, ставка ${s.bet})` : big ? `ВЕЛИКИЙ ВИГРАШ! +${r.win}` : `${pick(TEXTS.smallWin)} +${r.win}`;
      this.say(label, big ? COLORS.gold : COLORS.text);
      const c = this.reels.cellCenter(2, 1);
      this.fx.playFx(big ? 'firework' : 'coins', c.x, c.y, { scale: big ? 1.4 : 0.7, depth: 20 });
      if (big) this.cameras.main.shake(250, 0.006);
    } else {
      this.winText.setText('0');
      if (Math.random() < 0.35) this.say(pick(TEXTS.noWin), COLORS.dim);
    }
    if (r.totalScatters > 0) this.reels.pulseWhere(isScatter);
    if (r.bonusBoss) {
      sfx.play('bonus');
      const boss = BOSSES[r.bonusBoss]!;
      this.say(`${r.guaranteed ? 'ГАРАНТ! ' : ''}БОНУСКА! Бос: ${boss.name}`, COLORS.gold);
      this.cameras.main.flash(300, 255, 210, 90);
    }
    if (curse) {
      sfx.play('curse');
      this.time.delayedCall(r.bonusBoss ? 0 : 400, () => this.say(`ПРОКЛЯТТЯ на наступний спуск: ${CURSES[curse]!.name}`, COLORS.red));
      this.cameras.main.flash(250, 120, 60, 200);
    } else if (r.win === 0 && !r.bonusBoss && s.debt === 0 && Math.random() < 0.3) {
      this.say(pick(TEXTS.debtPaid), COLORS.green);
    }
  }

  private countUp(target: number): void {
    const o = { v: 0 };
    this.tweens.add({ targets: o, v: target, duration: Math.min(1200, 200 + target * 4), onUpdate: () => this.winText.setText(`${Math.round(o.v)}`) });
  }

  private buyBonus(): void {
    if (this.busy) return;
    const s = gameState();
    const boss = availableBosses(s);
    if (!chargeBuyBonus(s, s.bet)) {
      this.say(`Купити бонус коштує ${buyBonusCost(s.bet)}. Зменш ставку або спустись у підземелля`, COLORS.red);
      return;
    }
    // бос купленої бонуски — випадковий з доступних (тим самим RNG слота)
    const id = boss[Math.floor(this.rng.next() * boss.length)]!;
    s.slotSeed = this.rng.state;
    persist();
    sfx.play('bonus');
    this.say(`Куплено! Бос: ${BOSSES[id]!.name}`, COLORS.gold);
    this.refresh();
    this.busy = true;
    this.time.delayedCall(900, () => this.startBonus(id, true));
  }

  /** Бонуска = бій з босом → (перемога) 10 фріспінів. */
  private startBonus(bossId: string, bought: boolean): void {
    const s = gameState();
    const data: BossFightStart = { bossId, bet: s.bet, bought };
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.bossArena, data));
  }

  private leave(): void {
    if (this.busy) return;
    this.autoLeft = 0;
    persist();
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.hub, { kind: 'slot' } satisfies HubArrival));
  }
}
