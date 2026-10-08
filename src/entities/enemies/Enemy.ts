/**
 * Ворог: спрайт з маніфесту + параметри з конфігу + набір компонентів поведінки.
 *
 * Спільний автомат станів:
 *   idle (патруль) → chase (бачить гравця) → windup (телеграф) → active (удар) → recovery → chase …
 *   + hurt (збитий з замаху), stunned (паріровано: наступний удар гравця — критичний), flee (злодій), dead.
 * Що саме робить ворог у кожному стані, вирішують компоненти (src/entities/enemies/components.ts),
 * які збираються з архетипу в конфігу. Логіка не знає конкретних ворогів — лише архетипи.
 */
import Phaser from 'phaser';
import { BLOCK, HIT_FEEL } from '../../config/combat';
import { DEPTH_SCALING, depthMultiplier, type EnemyDef } from '../../config/enemies';
import type { DefenseOutcome } from '../../core/combat/defense';
import type { Rect } from '../../core/combat/geometry';
import type { Fx } from '../../core/fx/Fx';
import type { Player } from '../Player';
import { ManifestSprite } from '../ManifestSprite';
import { buildComponents } from './components';
import { sfx } from '../../core/audio/Sfx';

export type EnemyState = 'idle' | 'chase' | 'windup' | 'active' | 'recovery' | 'hurt' | 'stunned' | 'flee' | 'dead';

/** Удар гравця по ворогу. */
export interface PlayerHit {
  damage: number;
  knockback: number;
  dir: 1 | -1;
  heavy?: boolean;
  /** Точка влучання (для іскор). */
  x: number;
  y: number;
}

/** Що ворог може запитати/зробити у світі. Реалізує CombatSystem. */
export interface EnemyWorld {
  readonly player: Player;
  readonly fx: Fx;
  now(): number;
  canSee(ax: number, ay: number, bx: number, by: number): boolean;
  isSolidAt(px: number, py: number): boolean;
  /** Тверда клітинка або дошка (можна стояти). */
  isFloorAt(px: number, py: number): boolean;
  /** Перевіряє влучання зони удару по гравцю; null — не дістав. */
  hitPlayer(enemy: Enemy, rect: Rect, damage: number, blockable: boolean): DefenseOutcome | null;
  spawnEnemyProjectile(enemy: Enemy, x: number, y: number, vx: number, vy: number): void;
  spawnEnemy(id: string, x: number, y: number, depth: number): Enemy | undefined;
  /** Скільки фішок зараз у гравця за забіг. */
  runChips(): number;
  /** Забрати фішки забігу; повертає, скільки реально забрали. */
  stealChips(amount: number): number;
  returnChips(amount: number, x: number, y: number): void;
  onEnemyKilled(enemy: Enemy): void;
}

export interface EnemyComponent {
  update?(e: Enemy, w: EnemyWorld, dtMs: number): void;
  onHurt?(e: Enemy, w: EnemyWorld, hit: PlayerHit): void;
  onAttackLanded?(e: Enemy, w: EnemyWorld, outcome: DefenseOutcome): void;
  onDeath?(e: Enemy, w: EnemyWorld): void;
}

/** Параметри ворога з урахуванням глибини. */
export function scaleForDepth(def: EnemyDef, depth: number): EnemyDef {
  const hp = Math.round(def.hp * depthMultiplier(DEPTH_SCALING.hp, depth));
  const dmg = (d: number) => Math.max(d > 0 ? 1 : 0, Math.round(d * depthMultiplier(DEPTH_SCALING.damage, depth)));
  const sp = depthMultiplier(DEPTH_SCALING.speed, depth);
  const ch = depthMultiplier(DEPTH_SCALING.chips, depth);
  return {
    ...def,
    hp,
    speed: def.speed * sp,
    chips: [Math.round(def.chips[0] * ch), Math.round(def.chips[1] * ch)],
    attack: { ...def.attack, damage: dmg(def.attack.damage) },
    ranged: def.ranged ? { ...def.ranged, projectile: { ...def.ranged.projectile, damage: dmg(def.ranged.projectile.damage) } } : undefined,
  };
}

export class Enemy extends ManifestSprite {
  readonly def: EnemyDef;
  readonly depthLevel: number;
  hp: number;
  readonly maxHp: number;
  facing: 1 | -1 = 1;
  state: EnemyState = 'idle';
  stateMs = 0;
  aggro = false;
  /** Час, до якого не можна знову атакувати. */
  cooldownUntil = 0;
  /** Після паріру — наступний удар гравця критичний. */
  critReady = false;
  /** Номер замаху гравця, яким цього ворога вже вдарили (щоб один замах бив раз). */
  lastSwingHit = -1;
  /** Чи вже влучив поточною атакою. */
  attackLanded = false;
  stolenChips = 0;
  /** Пам'ять компонентів поведінки (таймери патруля тощо). */
  readonly memory: Record<string, number> = {};
  private components: EnemyComponent[];
  private stopTelegraph?: () => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    baseDef: EnemyDef,
    depth: number,
    readonly world: EnemyWorld,
  ) {
    super(scene, x, y, baseDef.sprite);
    this.def = scaleForDepth(baseDef, depth);
    this.depthLevel = depth;
    this.hp = this.maxHp = this.def.hp;
    if (this.def.scale) this.setScale(this.def.scale);
    if (this.def.tint) this.setTint(this.def.tint);
    if (this.def.flying) this.body.setAllowGravity(false);
    this.components = buildComponents(this.def);
    this.facing = Math.random() < 0.5 ? 1 : -1;
    this.setFacing(this.facing);
    this.playIdle();
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  hitRect(): Rect {
    const b = this.body;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  enter(state: EnemyState): void {
    if (this.state === 'windup' && state !== 'windup') this.stopTelegraph?.();
    this.state = state;
    this.stateMs = 0;
  }

  face(dir: 1 | -1): void {
    this.facing = dir;
    this.setFacing(dir);
  }

  facePlayer(): void {
    this.face(this.world.player.body.center.x >= this.body.center.x ? 1 : -1);
  }

  /** idle-анімація, або перший кадр ходьби, якщо idle в паку немає. */
  playIdle(): void {
    if (!this.playAnim('idle')) this.holdFrame('walk', 0);
  }

  /**
   * Почати замах. Є анімація атаки — граємо її (розтягнуту на windup+active);
   * немає — fallback: зупинка + біле блимання + тремтіння.
   */
  beginWindup(): void {
    this.enter('windup');
    this.attackLanded = false;
    this.body.setVelocityX(0);
    this.facePlayer();
    const a = this.def.attack;
    if (this.hasAnim('attack')) {
      this.play({ key: `${this.key}:attack`, duration: a.windupMs + a.activeMs, repeat: 0 });
      // довгий замах важких ворогів додатково підсвічуємо «!» — щоб було чесно
      if (a.windupMs >= 450) this.world.fx.playFx('alert', this.x, this.y - this.displayHeight + 4, { scale: 0.6 });
    } else {
      this.holdFrame('walk', 1);
      this.stopTelegraph = this.world.fx.telegraph(this, a.windupMs);
    }
  }

  /** Зона удару перед ворогом. */
  attackRect(): Rect {
    const b = this.body;
    const a = this.def.attack;
    return {
      x: this.facing > 0 ? b.right : b.x - a.reach,
      y: b.bottom - a.height,
      w: a.reach,
      h: a.height,
    };
  }

  stun(ms: number): void {
    if (!this.alive) return;
    this.enter('stunned');
    this.critReady = true;
    this.body.setVelocityX(-this.facing * 80);
    this.stateMs = -ms; // stateMs рахує від -ms до 0
    this.holdFrame('walk', 0);
    this.world.fx.floatText(this.x, this.y - this.displayHeight, 'ОГЛУШЕНО', '#9fd0ff');
  }

  update(dtMs: number): void {
    if (!this.active) return;
    this.stateMs += dtMs;
    if (this.state === 'dead') return;
    if (this.state === 'stunned') {
      // тремтить і блимає блакитним, поки не прийде до тями
      this.setTint(Math.floor(this.stateMs / 90) % 2 ? 0x9fd0ff : 0xffffff);
      this.body.setVelocityX(this.body.velocity.x * 0.9);
      if (this.stateMs >= 0) {
        this.critReady = false;
        this.clearTint();
        if (this.def.tint) this.setTint(this.def.tint);
        this.enter('chase');
      }
      return;
    }
    if (this.state === 'hurt') {
      if (this.stateMs >= 220) this.enter(this.aggro ? 'chase' : 'idle');
      return;
    }
    for (const c of this.components) {
      if (!this.active) return; // компонент міг прибрати ворога (злодій втік)
      c.update?.(this, this.world, dtMs);
    }
  }

  notifyAttackLanded(outcome: DefenseOutcome): void {
    for (const c of this.components) c.onAttackLanded?.(this, this.world, outcome);
  }

  /** Повертає true, якщо удар добив ворога. */
  takeHit(hit: PlayerHit): boolean {
    if (!this.alive) return false;
    const crit = this.critReady;
    const dmg = Math.round(hit.damage * (crit ? BLOCK.critMultiplier : 1));
    this.hp -= dmg;
    this.aggro = true;
    sfx.play('hit');
    if (crit) {
      this.critReady = false;
      this.clearTint();
    }

    const fx = this.world.fx;
    fx.flash(this, 0xff5555, HIT_FEEL.flashMs);
    fx.playFx(crit ? 'impactCrit' : 'impact', hit.x, hit.y, { scale: crit ? 1 : 0.7, flipX: hit.dir < 0 });
    fx.burst(hit.x, hit.y, 0xffe08a, crit ? 14 : 6, 110, 320);
    fx.floatText(this.x, this.y - this.displayHeight, crit ? `КРИТ ${dmg}` : `${dmg}`, crit ? '#ffd25a' : '#ffffff');
    fx.hitstop(crit ? HIT_FEEL.critHitstopMs : hit.heavy ? HIT_FEEL.heavyHitstopMs : HIT_FEEL.hitstopMs);
    fx.shake(HIT_FEEL.shakeMs, crit || hit.heavy ? HIT_FEEL.heavyShakeIntensity : HIT_FEEL.shakeIntensity);

    const resist = this.def.knockbackResist ?? 0;
    this.body.setVelocityX(hit.dir * hit.knockback * (1 - resist));
    if (!this.def.flying && resist < 0.9) this.body.setVelocityY(-60 * (1 - resist));

    for (const c of this.components) c.onHurt?.(this, this.world, hit);

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    // важкі вороги не збиваються з замаху («гіпер-броня»); інші — збиваються
    const superArmor = this.def.archetype === 'heavy' && (this.state === 'windup' || this.state === 'active');
    if (!superArmor && this.state !== 'flee' && this.state !== 'stunned') {
      this.enter('hurt');
      if (!this.playAnim('hurt', false)) this.holdFrame('walk', 0);
    }
    return false;
  }

  die(): void {
    this.enter('dead');
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    for (const c of this.components) c.onDeath?.(this, this.world);
    this.world.onEnemyKilled(this);
    if (this.playAnim('death', false)) {
      this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.scene.tweens.add({ targets: this, alpha: 0, duration: 400, delay: 300, onComplete: () => this.destroy() });
      });
    } else {
      // анімації смерті немає → fallback: розпад на частинки
      this.world.fx.disintegrate(this);
      this.destroy();
    }
  }
}
