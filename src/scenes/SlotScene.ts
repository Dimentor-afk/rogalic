/**
 * ЕКРАН СЛОТА. Гравець підходить до автомата в хабі — відкривається цей екран.
 * Результат спіна рахується логікою (src/core/slot) ДО анімації; тут лише показ:
 * барабани, лінії, виграш, звук (навіть на мінімальних сумах), near-miss, гарант, «Купити бонус».
 * Автоспін і турбо теж лише керують показом: ставка, RNG і виплати ті самі, що й при ручному спіні.
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
import { grantTestChips } from '../core/state/GameState';
import { Fx } from '../core/fx/Fx';
import { AutoPicker } from '../ui/slot/AutoPicker';
import { autoSpinsToRun, autoStopNote, autoStopReason, type AutoStop } from '../ui/slot/autospin';
import { ReelView } from '../ui/slot/ReelView';
import { SlotButton } from '../ui/slot/SlotButton';
import { countUpMs, slotTempo, type SlotTempo } from '../ui/slot/tempo';
import { COLORS, txt } from '../ui/text';
import type { BossFightStart } from './BossArenaScene';
import type { HubArrival } from './DungeonScene';
import { SCENES } from './keys';

/** Символи для «стрічки» прокрутки (без множників). */
const FILLER = SYMBOLS.filter((s) => s.kind !== 'multiplier' && s.kind !== 'scatter').map((s) => s.id);

/** Нижній рядок підказок: звичайний, під час автоспіну і у вікні вибору автоспіну. */
const HELP = {
  main: 'Space крутити  A/D ставка  B купити бонус  T автоспін  U турбо  M звук  Esc до хабу',
  auto: 'Space / T / Esc — зупинити автоспін    U турбо    M звук',
  picker: 'T або A/D — кількість    S — стоп на заносі    Space — старт    Esc — назад',
};

const STOP_COLOR: Record<AutoStop, string> = {
  bonus: COLORS.gold,
  bigWin: COLORS.gold,
  curse: COLORS.red,
  noFunds: COLORS.red,
  done: COLORS.dim,
  manual: COLORS.dim,
};

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
  /** Автоспін: скільки лишилось (разом із поточним; 0 — вимкнено, Infinity — без ліміту), скільки зроблено. */
  private autoLeft = 0;
  private autoTotal = 0;
  private autoDone = 0;
  private autoTimer?: Phaser.Time.TimerEvent;
  /** Чому автоспін зупинився востаннє (показуємо на лівій панелі). */
  private autoStop: AutoStop | null = null;
  private autoNote = '';
  private padPrev = { a: false, x: false, y: false };
  /** Геймпад: A затиснули в спокої — крутимо спін за спіном (як і було до автоспіну). */
  private padHoldSpins = false;
  private fx!: Fx;
  private balanceText!: Phaser.GameObjects.Text;
  private betText!: Phaser.GameObjects.Text;
  private winText!: Phaser.GameObjects.Text;
  private msgText!: Phaser.GameObjects.Text;
  private guaranteeG!: Phaser.GameObjects.Graphics;
  private guaranteeText!: Phaser.GameObjects.Text;
  private buyText!: Phaser.GameObjects.Text;
  private autoText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private buyBtn!: Phaser.GameObjects.Image;
  private autoBtn!: SlotButton;
  private turboBtn!: SlotButton;
  private picker!: AutoPicker;

  constructor() {
    super(SCENES.slot);
  }

  create(data: SlotReturn = {}): void {
    const s = gameState();
    this.rng = new SlotRng(s.slotSeed);
    this.busy = false;
    this.autoLeft = 0;
    this.autoDone = 0;
    this.autoTimer = undefined;
    this.autoStop = null;
    this.autoNote = '';
    this.padPrev = { a: false, x: false, y: false };
    this.padHoldSpins = false;
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
    this.button(lx, 116, '< менше', () => this.changeBet(-1), 50);
    this.button(lx + 54, 116, 'більше >', () => this.changeBet(1), 50);
    txt(this, lx, 136, 'ВИГРАШ', 8, COLORS.dim);
    this.winText = txt(this, lx, 146, '0', 8, COLORS.text);
    txt(this, lx, 162, 'АВТОСПІН', 8, COLORS.dim);
    this.autoText = txt(this, lx, 172, '', 8, COLORS.dim);

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

    // ряд під барабанами: [АВТО] [КРУТИТИ] [ТУРБО] — бічні кнопки по краях барабанів
    const rowY = 196;
    const spinBtn = this.add.image(width / 2, rowY, 'slotui/button').setScale(1.6, 1.3).setInteractive({ useHandCursor: true });
    spinBtn.on('pointerdown', () => this.primary());
    txt(this, width / 2, rowY, 'КРУТИТИ', 8, COLORS.white).setOrigin(0.5);
    this.autoBtn = new SlotButton(this, this.reels.x + 26, rowY, 52, 20, 'АВТО', () => this.onAutoButton(), 'slotui/ico_auto');
    this.turboBtn = new SlotButton(this, this.reels.x + this.reels.width - 26, rowY, 52, 20, 'ТУРБО', () => this.toggleTurbo(), 'slotui/ico_turbo');
    this.msgText = txt(this, width / 2, 216, '', 8, COLORS.gold, { align: 'center' }).setOrigin(0.5, 0);
    this.helpText = txt(this, width / 2, height - 12, '', 8, COLORS.dim).setOrigin(0.5, 0);

    // вікно вибору автоспіну — поверх барабанів
    this.picker = new AutoPicker(this, width / 2, this.reels.y + this.reels.height / 2, {
      onStart: (count, stopOnBigWin) => this.startAuto(count, stopOnBigWin),
      onChange: (count, stopOnBigWin) => {
        Object.assign(gameState().settings, { autoSpins: count, autoStopBigWin: stopOnBigWin });
        persist();
        sfx.play('click');
      },
      onClose: () => this.closePicker(),
    });

    const kb = this.input.keyboard!;
    for (const k of ['SPACE', 'E', 'J', 'ENTER']) kb.on(`keydown-${k}`, () => this.primary());
    for (const k of ['LEFT', 'A']) kb.on(`keydown-${k}`, () => (this.picker.isOpen ? this.picker.cycle(-1) : this.changeBet(-1)));
    for (const k of ['RIGHT', 'D']) kb.on(`keydown-${k}`, () => (this.picker.isOpen ? this.picker.cycle(1) : this.changeBet(1)));
    for (const k of ['S', 'DOWN']) kb.on(`keydown-${k}`, () => this.picker.isOpen && this.picker.toggleBigWin());
    kb.on('keydown-B', () => this.buyBonus());
    for (const k of ['ZERO', 'NUMPAD_ZERO']) kb.on(`keydown-${k}`, () => this.addTestChips());
    kb.on('keydown-T', () => this.onAutoKey());
    kb.on('keydown-U', () => this.toggleTurbo());
    kb.on('keydown-M', () => this.say(sfx.toggleMute() ? 'Звук вимкнено' : 'Звук увімкнено'));
    kb.on('keydown-ESC', () => this.back());

    if (data.message) this.say(data.message, data.color ?? COLORS.gold);
    else if (s.debt === 0) this.say(pick(TEXTS.debtPaid), COLORS.green);
    this.refresh();
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  update(_t: number, delta: number): void {
    this.fx.update(delta);
    this.pollGamepad();
  }

  /** Геймпад: A — крутити (під час автоспіну — стоп), X — автоспін з останньою кількістю або стоп, Y — турбо. */
  private pollGamepad(): void {
    const pad = this.input.gamepad?.getPad(0);
    if (!pad) return;
    const now = { a: pad.A, x: pad.X, y: pad.Y };
    const idle = this.autoLeft === 0 && !this.picker.isOpen;
    if (now.a && !this.padPrev.a) {
      this.padHoldSpins = idle;
      if (!idle) this.primary();
    }
    if (now.a && this.padHoldSpins && idle && !this.busy) void this.doSpin();
    if (now.x && !this.padPrev.x && !this.picker.isOpen) {
      const st = gameState().settings;
      if (this.autoLeft > 0) this.finishAuto('manual');
      else if (!this.busy) this.startAuto(st.autoSpins, st.autoStopBigWin);
    }
    if (now.y && !this.padPrev.y) this.toggleTurbo();
    this.padPrev = now;
  }

  private button(x: number, y: number, label: string, fn: () => void, w = 64): void {
    const b = this.add.image(x, y, 'slotui/button').setOrigin(0, 0.5).setDisplaySize(w, 16).setInteractive({ useHandCursor: true });
    b.on('pointerdown', fn);
    txt(this, x + w / 2, y, label, 8, COLORS.text).setOrigin(0.5);
  }

  /** Тестові фішки (клавіша 0). Під час спіну баланс на екрані оновиться після його завершення. */
  private addTestChips(): void {
    const n = grantTestChips(gameState());
    persist();
    sfx.play('coin');
    if (!this.busy) this.refresh();
    this.say(`ТЕСТ: +${n} фішок`, COLORS.gold);
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

    // автоспін: на кнопці — скільки лишилось, на лівій панелі — прогрес або причина зупинки
    const auto = this.autoLeft > 0;
    const endless = this.autoLeft === Infinity;
    this.autoBtn.setLit(auto).setLabel(auto && !endless ? `АВТО ${this.autoLeft}` : 'АВТО', auto && endless);
    if (auto) {
      const n = this.autoDone + 1;
      this.autoText.setText(this.autoTotal === Infinity ? `спін ${n}, без ліміту` : `спін ${n} із ${this.autoTotal}`).setColor(COLORS.text);
    } else {
      this.autoText.setText(this.autoStop ? this.autoNote : 'вимкнено').setColor(this.autoStop ? STOP_COLOR[this.autoStop] : COLORS.dim);
    }
    this.turboBtn.setLit(s.settings.slotTurbo);
    this.helpText.setText(this.picker.isOpen ? HELP.picker : auto ? HELP.auto : HELP.main);
  }

  private say(text: string, color: string = COLORS.gold): void {
    this.msgText.setText(text).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.msgText);
    this.tweens.add({ targets: this.msgText, alpha: 0.85, duration: 200 });
  }

  private changeBet(d: number): void {
    // під час автоспіну ставка зафіксована
    if (this.busy || this.autoLeft > 0) return;
    const s = gameState();
    const i = Math.max(0, Math.min(SLOT.bets.length - 1, SLOT.bets.indexOf(s.bet) + d));
    s.bet = SLOT.bets[i]!;
    sfx.play('click');
    this.refresh();
  }

  /** Space / E / Enter / кнопка КРУТИТИ: у вікні вибору — старт, під час автоспіну — стоп, інакше — спін. */
  private primary(): void {
    if (this.picker.isOpen) this.picker.confirm();
    else if (this.autoLeft > 0) this.finishAuto('manual');
    else void this.doSpin();
  }

  /** Esc: закрити вибір → зупинити автоспін → піти до хабу. */
  private back(): void {
    if (this.picker.isOpen) this.closePicker();
    else if (this.autoLeft > 0) this.finishAuto('manual');
    else this.leave();
  }

  /** T: відкрити вибір; у виборі — наступна кількість; під час автоспіну — стоп. */
  private onAutoKey(): void {
    if (this.autoLeft > 0) this.finishAuto('manual');
    else if (this.picker.isOpen) this.picker.cycle(1);
    else this.openPicker();
  }

  /** Кнопка АВТО (коли вікно відкрите, клік ловить його підкладка і закриває вікно). */
  private onAutoButton(): void {
    if (this.autoLeft > 0) this.finishAuto('manual');
    else this.openPicker();
  }

  private openPicker(): void {
    if (this.busy) return;
    const s = gameState();
    this.picker.open(s.settings.autoSpins, s.settings.autoStopBigWin, s.bet);
    sfx.play('click');
    this.refresh();
  }

  private closePicker(): void {
    this.picker.close();
    this.refresh();
  }

  private startAuto(count: number, stopOnBigWin: boolean): void {
    const s = gameState();
    Object.assign(s.settings, { autoSpins: count, autoStopBigWin: stopOnBigWin });
    persist();
    this.picker.close();
    this.autoLeft = this.autoTotal = autoSpinsToRun(count);
    this.autoDone = 0;
    this.autoStop = null;
    this.refresh();
    void this.doSpin();
  }

  /** Зупинити автоспін. Спін, що вже крутиться, докручується (його результат пораховано заздалегідь). */
  private finishAuto(reason: AutoStop, win = 0): void {
    this.autoTimer?.remove();
    this.autoTimer = undefined;
    this.autoLeft = 0;
    this.autoStop = reason;
    this.autoNote = autoStopNote(reason, this.autoDone, win, gameState().bet);
    if (reason === 'manual') sfx.play('click');
    this.refresh();
  }

  private toggleTurbo(): void {
    const st = gameState().settings;
    st.slotTurbo = !st.slotTurbo;
    persist();
    sfx.play('click');
    this.refresh();
  }

  private async doSpin(): Promise<void> {
    if (this.busy || this.picker.isOpen) return;
    const s = gameState();
    if (s.balance < s.bet) {
      if (this.autoLeft > 0) this.finishAuto('noFunds');
      this.say('Не вистачає фішок. Підземелля чекає', COLORS.red);
      this.cameras.main.shake(100, 0.004);
      return;
    }
    this.busy = true;
    const t = slotTempo(s.settings.slotTurbo);
    // 1) ставку списуємо, результат рахуємо одразу (до анімації) і зберігаємо стан RNG
    chargeSpin(s, s.bet);
    const r = spin({ bet: s.bet, availableBosses: availableBosses(s), guaranteeFull: s.guarantee >= SLOT.guarantee.max, rng: this.rng });
    const outcome = settleSpin(s, r, this.rng);
    s.slotSeed = this.rng.state;
    persist();
    this.winText.setText('...');
    this.say('');
    this.refreshBalanceDuringSpin(s.balance - r.win);

    // 2) анімація (темп звичайний або турбо — на результат не впливає)
    await this.reels.spinTo(r.grid, { fillerIds: FILLER, nearMiss: true, baseMs: t.reelMs, staggerMs: t.staggerMs, nearMissMs: t.nearMissMs });

    // 3) показ результату
    this.present(r, outcome.curse, t);
    if (this.autoLeft > 0) this.continueAuto(r, outcome.curse !== null, t);
    this.refresh();
    if (r.bonusBoss) {
      // busy лишається true: до переходу в бонуску ні спіна, ні виходу
      this.time.delayedCall(t.bonusDelayMs, () => this.startBonus(r.bonusBoss!, false));
      return;
    }
    this.busy = false;
  }

  /** Після спіна автоспіну: зупинитись (бонуска, прокляття, занос, гроші, ліміт) або запланувати наступний. */
  private continueAuto(r: SpinResult, curse: boolean, t: SlotTempo): void {
    const s = gameState();
    this.autoLeft--;
    this.autoDone++;
    const reason = autoStopReason({
      win: r.win,
      bet: s.bet,
      balance: s.balance,
      bonus: r.bonusBoss !== null,
      curse,
      left: this.autoLeft,
      stopOnBigWin: s.settings.autoStopBigWin,
    });
    if (reason) {
      this.finishAuto(reason, r.win);
      if (reason === 'noFunds') this.say('Автоспін зупинено: не вистачає фішок на ставку', COLORS.red);
      return;
    }
    const pause = r.win >= s.bet * 10 ? t.autoPauseBigMs : r.win > 0 ? t.autoPauseWinMs : t.autoPauseMs;
    this.autoTimer = this.time.delayedCall(pause, () => void this.doSpin());
  }

  private refreshBalanceDuringSpin(balance: number): void {
    this.balanceText.setText(`${balance}`);
  }

  private present(r: SpinResult, curse: string | null, t: SlotTempo): void {
    const s = gameState();
    if (r.lineWins.length) this.reels.highlight(r.lineWins);
    if (r.win > 0) {
      const big = r.win >= s.bet * 10;
      sfx.play(big ? 'winBig' : 'winSmall');
      this.countUp(r.win, countUpMs(t, r.win));
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
      this.time.delayedCall(r.bonusBoss ? 0 : t.curseMsgMs, () => this.say(`ПРОКЛЯТТЯ на наступний спуск: ${CURSES[curse]!.name}`, COLORS.red));
      this.cameras.main.flash(250, 120, 60, 200);
    } else if (r.win === 0 && !r.bonusBoss && s.debt === 0 && Math.random() < 0.3) {
      this.say(pick(TEXTS.debtPaid), COLORS.green);
    }
  }

  private countUp(target: number, duration: number): void {
    const o = { v: 0 };
    this.tweens.add({ targets: o, v: target, duration, onUpdate: () => this.winText.setText(`${Math.round(o.v)}`) });
  }

  private buyBonus(): void {
    if (this.busy || this.picker.isOpen) return;
    if (this.autoLeft > 0) {
      this.say('Автоспін бонус не купує — спершу зупини його', COLORS.dim);
      return;
    }
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
    persist();
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.hub, { kind: 'slot' } satisfies HubArrival));
  }
}
