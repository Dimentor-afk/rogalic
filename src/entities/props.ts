/**
 * Об'єкти рівня: бочки з фішками, скрині, двері між зонами, ліфт нагору, двері глибше, мішок смерті.
 * Interactable — те, що вмикається кнопкою «взаємодія» (E / ↑), Breakable — те, що ламається ударом.
 */
import Phaser from 'phaser';
import type { Breakable, CombatSystem } from '../core/combat/CombatSystem';
import type { Rect } from '../core/combat/geometry';
import type { Fx } from '../core/fx/Fx';
import { sfx } from '../core/audio/Sfx';

export interface Interactable {
  readonly alive: boolean;
  readonly x: number;
  readonly y: number;
  /** Радіус, з якого можна взаємодіяти, px. */
  readonly range: number;
  prompt(): string;
  activate(): void;
}

/** Бочка: ламається ударом, висипає фішки. */
export class Barrel implements Breakable {
  alive = true;
  private sprite: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private chips: number,
    private combat: CombatSystem,
    private fx: Fx,
  ) {
    this.sprite = scene.add.image(x, y, 'props', 'barrel/0').setOrigin(0.5, 1).setDepth(4);
  }

  hitRect(): Rect {
    return { x: this.sprite.x - 10, y: this.sprite.y - 26, w: 20, h: 26 };
  }

  hit(): void {
    if (!this.alive) return;
    this.alive = false;
    this.sprite.setFrame('barrel/3').setAlpha(0.8);
    sfx.play('hit');
    this.fx.playFx('smoke', this.sprite.x, this.sprite.y - 12, { scale: 0.8 });
    this.fx.burst(this.sprite.x, this.sprite.y - 14, 0x8a5530, 10, 120, 400);
    this.combat.addChips(this.chips, this.sprite.x, this.sprite.y - 20);
  }
}

/** Скриня у скарбниці: відкривається взаємодією або ударом. */
export class Chest implements Interactable, Breakable {
  alive = true;
  readonly range = 26;
  private sprite: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private chips: number,
    private flask: boolean,
    private combat: CombatSystem,
    private fx: Fx,
    private onFlask: () => void,
  ) {
    this.sprite = scene.add.image(x, y, 'ph/chest_closed').setOrigin(0.5, 1).setDepth(4);
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  prompt(): string {
    return 'E — відкрити скриню';
  }

  hitRect(): Rect {
    return { x: this.sprite.x - 12, y: this.sprite.y - 18, w: 24, h: 18 };
  }

  hit(): void {
    this.activate();
  }

  activate(): void {
    if (!this.alive) return;
    this.alive = false;
    this.sprite.setTexture('ph/chest_open');
    sfx.play('bonus');
    this.fx.playFx('sparkle', this.sprite.x, this.sprite.y - 14);
    this.combat.addChips(this.chips, this.sprite.x, this.sprite.y - 22);
    if (this.flask) {
      this.onFlask();
      this.fx.floatText(this.sprite.x, this.sprite.y - 34, '+1 Енергетик', '#7dff9a');
    }
  }
}

/** Двері між зонами: блокують прохід, поки не відчиниш (взаємодія або удар). */
export class Door implements Interactable, Breakable {
  alive = true;
  readonly range = 30;
  readonly zone: Phaser.GameObjects.Zone;
  private sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, x: number, y: number, private fx: Fx) {
    // кадр дверей 80×80 (обрізаний), низ — на підлозі
    this.sprite = scene.add.sprite(x, y + 1, 'props', 'door/door/closed/0').setOrigin(0.5, 1).setDepth(3);
    if (scene.anims.exists('fx:doorClosed')) this.sprite.play('fx:doorClosed');
    this.zone = scene.add.zone(x, y - 32, 14, 64);
    scene.physics.add.existing(this.zone, true);
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  prompt(): string {
    return 'E — відчинити двері';
  }

  hitRect(): Rect {
    return { x: this.sprite.x - 8, y: this.sprite.y - 60, w: 16, h: 60 };
  }

  hit(): void {
    this.activate();
  }

  activate(): void {
    if (!this.alive) return;
    this.alive = false;
    this.sprite.stop().setFrame('door/door/open/0');
    sfx.play('door');
    (this.zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.fx.playFx('smoke', this.sprite.x, this.sprite.y - 10);
  }
}

/** Будь-що «натисни E — і щось станеться»: ліфт, двері глибше, автомат у хабі… */
export class Trigger implements Interactable {
  alive = true;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly range: number,
    private text: () => string,
    private action: () => void,
  ) {}

  prompt(): string {
    return this.text();
  }

  activate(): void {
    if (this.alive) this.action();
  }
}

/** Мішок смерті: підбирається дотиком. */
export class DeathBag {
  alive = true;
  private sprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly chips: number) {
    this.sprite = scene.add.image(x, y, 'ph/bag').setOrigin(0.5, 1).setDepth(6);
    scene.tweens.add({ targets: this.sprite, y: y - 3, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  pickUp(fx: Fx): void {
    this.alive = false;
    fx.playFx('coins', this.sprite.x, this.sprite.y - 10, { scale: 0.6 });
    this.sprite.destroy();
  }
}
