/**
 * Шар абстракції над клавіатурою і геймпадом: гра питає не «чи натиснуто SPACE»,
 * а «чи натиснуто jump». Розкладка — у src/config/input.ts.
 *
 * update() треба викликати раз на кадр (на початку update сцени):
 * він запам'ятовує стан дій, щоб рахувати justPressed / justReleased однаково для клавіатури й геймпада.
 * Крім опитування стану слухаємо події натискання: тап коротший за кадр (down і up між двома кадрами)
 * інакше загубився б — а так він засчитується як натискання рівно на один кадр.
 */
import Phaser from 'phaser';
import { INPUT_BINDINGS, STICK_DEADZONE, type Action } from '../../config/input';

const ACTIONS = Object.keys(INPUT_BINDINGS) as Action[];

export class InputMap {
  private keys = new Map<Action, Phaser.Input.Keyboard.Key[]>();
  private now = new Set<Action>();
  private prev = new Set<Action>();
  /** Дії, клавішу яких натиснули після попереднього update(). */
  private tapped = new Set<Action>();
  /** До цього часу (performance.now) натискання не рахуються як «нові» (після закриття меню). */
  private ignoreUntil = 0;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) throw new Error('Keyboard plugin вимкнено');
    for (const action of ACTIONS) {
      const list = INPUT_BINDINGS[action].keys.map((name) => {
        const code = Phaser.Input.Keyboard.KeyCodes[name as keyof typeof Phaser.Input.Keyboard.KeyCodes];
        if (code === undefined) throw new Error(`Невідома клавіша "${name}" для дії ${action}`);
        // enableCapture=true: стрілки/пробіл не скролять сторінку
        const key = kb.addKey(code, true);
        key.on('down', () => this.tapped.add(action));
        return key;
      });
      this.keys.set(action, list);
    }
  }

  update(): void {
    [this.prev, this.now] = [this.now, this.prev];
    this.now.clear();
    const pad = this.pad();
    for (const action of ACTIONS) {
      if (this.rawDown(action, pad) || this.tapped.has(action)) this.now.add(action);
    }
    this.tapped.clear();
    // клавіша, якою закрили меню, ще може бути натиснута — не вважаємо її новим натисканням
    if (performance.now() < this.ignoreUntil) for (const a of this.now) this.prev.add(a);
  }

  /** Ігнорувати нові натискання ms мілісекунд (викликати при поверненні з меню/паузи). */
  suppress(ms = 150): void {
    this.ignoreUntil = performance.now() + ms;
    this.tapped.clear();
  }

  isDown(action: Action): boolean {
    return this.now.has(action);
  }

  justPressed(action: Action): boolean {
    return this.now.has(action) && !this.prev.has(action);
  }

  justReleased(action: Action): boolean {
    return !this.now.has(action) && this.prev.has(action);
  }

  /** Горизонтальний напрям: -1, 0 або 1. */
  axisX(): number {
    return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
  }

  private pad(): Phaser.Input.Gamepad.Gamepad | undefined {
    const gp = this.scene.input.gamepad;
    if (!gp || gp.total === 0) return undefined;
    return gp.getPad(0) ?? undefined;
  }

  private rawDown(action: Action, pad: Phaser.Input.Gamepad.Gamepad | undefined): boolean {
    if (this.keys.get(action)!.some((k) => k.isDown)) return true;
    if (!pad) return false;
    if (INPUT_BINDINGS[action].pad.some((i) => pad.buttons[i]?.pressed)) return true;
    // лівий стік дублює хрестовину
    const sx = pad.leftStick.x;
    const sy = pad.leftStick.y;
    if (action === 'left') return sx < -STICK_DEADZONE;
    if (action === 'right') return sx > STICK_DEADZONE;
    if (action === 'up') return sy < -STICK_DEADZONE;
    if (action === 'down') return sy > STICK_DEADZONE;
    return false;
  }
}
