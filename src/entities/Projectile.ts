/**
 * Снаряд (скіпетр гравця, вогняна куля демона, снаряди босів).
 * Рухається вручну, без фізичного тіла: так дешевше і простіше пояснити. Зіткнення зі скелею —
 * перевірка клітинки сітки під центром; з цілями — перетин прямокутників (робить CombatSystem).
 */
import Phaser from 'phaser';
import type { Rect } from '../core/combat/geometry';

export type ProjectileOwner = 'player' | 'enemy';

export interface ProjectileOptions {
  owner: ProjectileOwner;
  vx: number;
  vy: number;
  damage: number;
  size: number;
  lifetimeMs: number;
  blockable: boolean;
  impactFx?: string;
  pierce?: boolean;
  knockback?: number;
  /** Кадри снаряда намальовані «носом» вліво. */
  artFacesLeft?: boolean;
  /** Прискорення вниз, px/с² (дощ з неба, кинуті камені). */
  gravity?: number;
  tint?: number;
  /** Хто випустив (ворог) — для оглушення при паріру. */
  source?: unknown;
}

export class Projectile extends Phaser.GameObjects.Sprite {
  opts: ProjectileOptions;
  lifeMs: number;
  /** Кого вже вдарив (для pierce: кожну ціль — один раз). */
  readonly hitSet = new Set<unknown>();

  constructor(scene: Phaser.Scene, x: number, y: number, fxName: string, opts: ProjectileOptions) {
    super(scene, x, y, '__DEFAULT');
    this.opts = { ...opts };
    this.lifeMs = opts.lifetimeMs;
    scene.add.existing(this);
    const key = `fx:${fxName}`;
    if (scene.anims.exists(key)) this.play({ key, repeat: -1 });
    if (opts.tint !== undefined) this.setTint(opts.tint);
    this.setDepth(30);
    this.orient();
  }

  rect(): Rect {
    const s = this.opts.size;
    return { x: this.x - s / 2, y: this.y - s / 2, w: s, h: s };
  }

  /** Розвернути снаряд за напрямком руху. */
  orient(): void {
    const { vx, vy } = this.opts;
    this.setRotation(Math.atan2(vy, vx) + (this.opts.artFacesLeft ? Math.PI : 0));
  }

  /** Відбити (паріру): тепер снаряд належить іншій стороні і летить назад. */
  reflect(newOwner: ProjectileOwner): void {
    this.opts.owner = newOwner;
    this.opts.vx *= -1.2;
    this.opts.vy *= -1.2;
    this.lifeMs = this.opts.lifetimeMs;
    this.hitSet.clear();
    this.orient();
    this.setTint(0x9fd0ff);
  }

  step(dtMs: number): void {
    const dt = dtMs / 1000;
    if (this.opts.gravity) {
      this.opts.vy += this.opts.gravity * dt;
      this.orient();
    }
    this.x += this.opts.vx * dt;
    this.y += this.opts.vy * dt;
    this.lifeMs -= dtMs;
  }
}
