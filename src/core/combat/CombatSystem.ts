/**
 * Бойова система сцени: зв'язує гравця, ворогів, снаряди і рівень.
 * Одна на сцену (підземелля, арена боса, тестова печера). Реалізує EnemyWorld — «світ» для AI ворогів —
 * і PlayerHooks — колбеки, через які гравець повідомляє про свої удари.
 */
import Phaser from 'phaser';
import { BLOCK, HIT_FEEL } from '../../config/combat';
import { ENEMIES } from '../../config/enemies';
import { FX } from '../../config/assets';
import type { WeaponDef } from '../../config/weapons';
import { Enemy, type EnemyWorld } from '../../entities/enemies/Enemy';
import { Player, type PlayerHooks } from '../../entities/Player';
import { Projectile } from '../../entities/Projectile';
import type { Fx } from '../fx/Fx';
import { isOneWay, isSolid, type Grid } from '../level/grid';
import { hasLineOfSight } from '../level/los';
import type { LevelView } from '../level/LevelView';
import type { DefenseOutcome } from './defense';
import { rectsOverlap, sectorHitsRect, type Rect } from './geometry';

/** Події для сцени (HUD, мішок смерті, статистика). */
export interface CombatEvents {
  onRunChipsChanged?(chips: number): void;
  onPlayerDeath?(player: Player): void;
  onEnemyKilled?(enemy: Enemy): void;
}

/** Ціль, яку можна вдарити, крім ворогів (бочки, двері). */
export interface Breakable {
  readonly alive: boolean;
  hitRect(): Rect;
  hit(dir: 1 | -1, swingOrSource: unknown): void;
}

export class CombatSystem implements EnemyWorld {
  player!: Player;
  readonly enemies: Phaser.Physics.Arcade.Group;
  readonly projectiles: Projectile[] = [];
  readonly breakables: Breakable[] = [];
  /** Фішки, зібрані за забіг (ще не зараховані на баланс). */
  private chips = 0;
  /** Дебаг: малювати зони ударів. */
  debug = false;
  /** Множник швидкості ворогів (прокляття «на кофеїні»). */
  enemySpeedMultiplier = 1;
  private debugG: Phaser.GameObjects.Graphics;
  private lastBreakableSwing = new WeakMap<Breakable, number>();

  readonly playerHooks: PlayerHooks = {
    onMeleeActive: (p, w, swingId) => this.playerMelee(p, w, swingId),
    onShoot: (p, w) => this.playerShoot(p, w),
    onDefense: (p, outcome, attacker) => this.onDefense(p, outcome, attacker),
    onDeath: (p) => this.events.onPlayerDeath?.(p),
  };

  constructor(
    private scene: Phaser.Scene,
    level: LevelView,
    private grid: Grid,
    private tileSize: number,
    readonly fx: Fx,
    private events: CombatEvents = {},
  ) {
    this.enemies = scene.physics.add.group();
    scene.physics.add.collider(this.enemies, level.solid);
    scene.physics.add.collider(this.enemies, level.oneWay);
    this.debugG = scene.add.graphics().setDepth(900);
  }

  attachPlayer(player: Player): void {
    this.player = player;
  }

  // ======================= EnemyWorld =======================

  now(): number {
    return this.scene.time.now;
  }

  canSee(ax: number, ay: number, bx: number, by: number): boolean {
    return hasLineOfSight(this.grid, this.tileSize, ax, ay, bx, by);
  }

  isSolidAt(px: number, py: number): boolean {
    return isSolid(this.grid, Math.floor(px / this.tileSize), Math.floor(py / this.tileSize));
  }

  isFloorAt(px: number, py: number): boolean {
    const x = Math.floor(px / this.tileSize);
    const y = Math.floor(py / this.tileSize);
    return isSolid(this.grid, x, y) || isOneWay(this.grid, x, y);
  }

  hitPlayer(enemy: Enemy, rect: Rect, damage: number, blockable: boolean): DefenseOutcome | null {
    if (this.debug) this.debugG.lineStyle(1, 0xff3344, 1).strokeRect(rect.x, rect.y, rect.w, rect.h);
    if (!this.player.alive || !rectsOverlap(rect, this.player.hitRect())) return null;
    return this.player.receiveHit({ damage, fromX: enemy.body.center.x, blockable, attacker: enemy });
  }

  spawnEnemyProjectile(enemy: Enemy, x: number, y: number, vx: number, vy: number): void {
    const spec = enemy.def.ranged?.projectile;
    if (!spec) return;
    this.spawnProjectile(spec.fx, x, y, {
      owner: 'enemy',
      vx,
      vy,
      damage: spec.damage,
      size: spec.size,
      lifetimeMs: spec.lifetimeMs,
      blockable: spec.blockable,
      impactFx: 'explosion',
      source: enemy,
    });
  }

  spawnProjectile(fxName: string, x: number, y: number, opts: ConstructorParameters<typeof Projectile>[4]): Projectile {
    const p = new Projectile(this.scene, x, y, fxName, { artFacesLeft: FX[fxName]?.facesLeft, ...opts });
    this.projectiles.push(p);
    return p;
  }

  spawnEnemy(id: string, x: number, y: number, depth: number): Enemy | undefined {
    const def = ENEMIES[id];
    if (!def) {
      console.warn(`[combat] невідомий ворог "${id}"`);
      return undefined;
    }
    const e = new Enemy(this.scene, x, y, { ...def, speed: def.speed * this.enemySpeedMultiplier }, depth, this);
    e.setDepth(8);
    this.enemies.add(e);
    return e;
  }

  runChips(): number {
    return this.chips;
  }

  stealChips(amount: number): number {
    const got = Math.min(this.chips, Math.max(0, Math.floor(amount)));
    this.setChips(this.chips - got);
    return got;
  }

  returnChips(amount: number, x: number, y: number): void {
    this.addChips(amount, x, y, 'повернув ');
  }

  onEnemyKilled(enemy: Enemy): void {
    const [min, max] = enemy.def.chips;
    const reward = Phaser.Math.Between(min, max);
    if (reward > 0) this.addChips(reward, enemy.x, enemy.y - enemy.displayHeight / 2);
    this.events.onEnemyKilled?.(enemy);
  }

  // ======================= фішки забігу =======================

  setChips(n: number): void {
    this.chips = Math.max(0, n);
    this.events.onRunChipsChanged?.(this.chips);
  }

  addChips(n: number, x: number, y: number, prefix = '+'): void {
    if (n <= 0) return;
    this.setChips(this.chips + n);
    this.fx.playFx('coins', x, y, { scale: 0.45 });
    this.fx.floatText(x, y - 6, `${prefix}${n}`, '#ffd25a');
  }

  // ======================= удари гравця =======================

  private playerMelee(p: Player, w: WeaponDef, swingId: number): void {
    const origin = p.attackOrigin();
    if (this.debug) this.drawSector(origin.x, origin.y, p.facing, w.range, w.arcDeg);
    this.enemies.getChildren().forEach((obj) => {
      const e = obj as Enemy;
      if (!e.alive || e.lastSwingHit === swingId) return;
      if (!sectorHitsRect(origin, p.facing, w.range, w.arcDeg, e.hitRect())) return;
      e.lastSwingHit = swingId;
      const r = e.hitRect();
      e.takeHit({
        damage: w.damage,
        knockback: w.knockback,
        dir: p.facing,
        heavy: w.heavy,
        x: Phaser.Math.Clamp(origin.x + p.facing * w.range * 0.6, r.x, r.x + r.w),
        y: Phaser.Math.Clamp(origin.y, r.y, r.y + r.h),
      });
    });
    for (const b of this.breakables) {
      if (!b.alive || this.lastBreakableSwing.get(b) === swingId) continue;
      if (!sectorHitsRect(origin, p.facing, w.range, w.arcDeg, b.hitRect())) continue;
      this.lastBreakableSwing.set(b, swingId);
      b.hit(p.facing, swingId);
    }
  }

  private playerShoot(p: Player, w: WeaponDef): void {
    const spec = w.projectile!;
    const o = p.attackOrigin();
    this.spawnProjectile(spec.fx, o.x + p.facing * 12, o.y, {
      owner: 'player',
      vx: p.facing * spec.speed,
      vy: 0,
      damage: w.damage,
      size: spec.size,
      lifetimeMs: spec.lifetimeMs,
      blockable: false,
      impactFx: spec.impactFx,
      pierce: spec.pierce,
      knockback: w.knockback,
    });
  }

  /** Реакція світу на захист гравця: паріру оглушує атакувального. */
  private onDefense(p: Player, outcome: DefenseOutcome, attacker: unknown): void {
    const fx = this.fx;
    const cx = p.body.center.x + p.facing * 8;
    const cy = p.body.center.y - 4;
    if (outcome === 'parried') {
      fx.playFx('parry', cx, cy, { flipX: p.facing < 0 });
      fx.burst(cx, cy, 0x9fd0ff, 16, 140, 380);
      fx.hitstop(HIT_FEEL.parryHitstopMs);
      fx.shake(HIT_FEEL.shakeMs, HIT_FEEL.heavyShakeIntensity);
      fx.floatText(p.x, p.y - 36, 'ПАРІРУВАВ!', '#9fd0ff');
      if (attacker instanceof Enemy) attacker.stun(BLOCK.parryStunMs);
    } else if (outcome === 'blocked') {
      fx.burst(cx, cy, 0xd8e6ff, 8, 90, 260);
      fx.hitstop(HIT_FEEL.hitstopMs);
      fx.floatText(p.x, p.y - 36, 'блок', '#c8d8ff');
    } else if (outcome === 'guardBreak') {
      fx.floatText(p.x, p.y - 36, 'нерви здали', '#ff9a6a');
    } else if (outcome === 'dodged' && p.isRolling) {
      fx.floatText(p.x, p.y - 36, 'мимо', '#ffffff');
    }
  }

  // ======================= оновлення =======================

  /** Викликати на початку кадру сцени (до оновлення гравця): чистить дебаг-малюнок зон ударів. */
  beginFrame(): void {
    this.debugG.clear();
  }

  update(dtMs: number): void {
    this.enemies.getChildren().forEach((obj) => (obj as Enemy).update(dtMs));
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i]!;
      pr.step(dtMs);
      if (this.debug) {
        const r = pr.rect();
        this.debugG.lineStyle(1, 0xffff00, 1).strokeRect(r.x, r.y, r.w, r.h);
      }
      if (pr.lifeMs <= 0 || this.isSolidAt(pr.x, pr.y) || this.resolveProjectile(pr)) {
        if (pr.opts.impactFx && pr.lifeMs > 0) this.fx.playFx(pr.opts.impactFx, pr.x, pr.y, { scale: 0.5 });
        pr.destroy();
        this.projectiles.splice(i, 1);
      }
    }
  }

  /** Повертає true, якщо снаряд треба прибрати. */
  private resolveProjectile(pr: Projectile): boolean {
    const r = pr.rect();
    if (pr.opts.owner === 'player') {
      for (const obj of this.enemies.getChildren()) {
        const e = obj as Enemy;
        if (!e.alive || pr.hitSet.has(e) || !rectsOverlap(r, e.hitRect())) continue;
        pr.hitSet.add(e);
        const dir: 1 | -1 = pr.opts.vx >= 0 ? 1 : -1;
        e.takeHit({ damage: pr.opts.damage, knockback: pr.opts.knockback ?? 60, dir, x: pr.x, y: pr.y });
        if (!pr.opts.pierce) return true;
      }
      for (const b of this.breakables) {
        if (b.alive && !pr.hitSet.has(b) && rectsOverlap(r, b.hitRect())) {
          pr.hitSet.add(b);
          b.hit(pr.opts.vx >= 0 ? 1 : -1, pr);
          if (!pr.opts.pierce) return true;
        }
      }
      return false;
    }
    // ворожий снаряд
    const p = this.player;
    if (!p.alive || pr.hitSet.has(p) || !rectsOverlap(r, p.hitRect())) return false;
    pr.hitSet.add(p);
    const outcome = p.receiveHit({ damage: pr.opts.damage, fromX: pr.x - pr.opts.vx * 0.05, blockable: pr.opts.blockable, attacker: pr.opts.source });
    if (outcome === 'parried') {
      // паріру відбиває снаряд назад у ворога
      pr.reflect('player');
      return false;
    }
    return outcome !== 'dodged';
  }

  private drawSector(x: number, y: number, facing: 1 | -1, range: number, arcDeg: number): void {
    const g = this.debugG;
    const base = facing > 0 ? 0 : Math.PI;
    const half = Phaser.Math.DegToRad(arcDeg / 2);
    g.lineStyle(1, 0x55ff88, 1);
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, range, base - half, base + half, false);
    g.closePath();
    g.strokePath();
  }

  destroy(): void {
    for (const p of this.projectiles) p.destroy();
    this.projectiles.length = 0;
    this.debugG.destroy();
  }
}
