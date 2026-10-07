/**
 * Гравець: рух (біг, стрибок зі змінною висотою, «час койота», буфер стрибка, зістрибування з дошок)
 * і бій (атака за мувсетом зброї, перекат з невразливістю, блок/паріру, фляги «Енергетик», стаміна «Нерви»).
 *
 * Стан — простий скінченний автомат:
 *   move   — звичайний рух; блок тримається як «модифікатор» цього стану;
 *   attack — фази windup → active → recovery (за конфігом зброї);
 *   roll   — ривок з i-frames; heal — п'є флягу (вразливий); hurt — відкидання після удару; dead.
 */
import Phaser from 'phaser';
import { GAME } from '../config/game';
import { PLAYER_MOVE as M } from '../config/player';
import { BLOCK, FLASK, HIT_FEEL, PLAYER_COMBAT, ROLL } from '../config/combat';
import { WEAPONS, type WeaponDef, type WeaponId } from '../config/weapons';
import { ARMOR_DAMAGE_REDUCTION } from '../config/economy';
import { playerSpriteKey } from '../config/assets';
import type { InputMap } from '../core/input/InputMap';
import { canAct, createStamina, drain, spend, tick, type Stamina } from '../core/combat/stamina';
import { resolveHit, type DefenseOutcome } from '../core/combat/defense';
import type { Rect } from '../core/combat/geometry';
import type { Fx } from '../core/fx/Fx';
import { ManifestSprite } from './ManifestSprite';

/** Що з прокачки/інвентаря визначає гравця на початку забігу. */
export interface PlayerLoadout {
  weapon: WeaponId;
  armor: number;
  maxHp: number;
  maxStamina: number;
  flasks: number;
  flaskHeal: number;
}

export const DEFAULT_LOADOUT: PlayerLoadout = {
  weapon: 'sword',
  armor: 0,
  maxHp: PLAYER_COMBAT.maxHp,
  maxStamina: PLAYER_COMBAT.maxStamina,
  flasks: FLASK.count,
  flaskHeal: FLASK.heal,
};

/** Через ці колбеки гравець «повідомляє» бойову систему сцени про удари і смерть. */
export interface PlayerHooks {
  /** Активна фаза ближнього удару (викликається щокадру, поки фаза триває). */
  onMeleeActive(player: Player, weapon: WeaponDef, swingId: number): void;
  onShoot(player: Player, weapon: WeaponDef): void;
  onDefense(player: Player, outcome: DefenseOutcome, attacker: unknown): void;
  onDeath(player: Player): void;
}

export interface IncomingAttack {
  damage: number;
  /** x атакувального (щоб знати, з якого боку прилетіло). */
  fromX: number;
  blockable: boolean;
  /** Хто бив — передається назад в onDefense (для оглушення паріруванням). */
  attacker?: unknown;
  /** Множник відкидання. */
  knockback?: number;
}

type State = 'move' | 'attack' | 'roll' | 'heal' | 'hurt' | 'dead';
type AttackPhase = 'windup' | 'active' | 'recovery';

const BLOCK_TINT = 0x9fc8ff;

function approach(value: number, target: number, delta: number): number {
  return value < target ? Math.min(value + delta, target) : Math.max(value - delta, target);
}

export class Player extends ManifestSprite {
  readonly loadout: PlayerLoadout;
  hp: number;
  flasks: number;
  readonly stamina: Stamina;
  facing: 1 | -1 = 1;
  /** Статистика бою (для стартового множника фріспінів). */
  damageTaken = 0;
  flasksUsed = 0;
  /** Вимкнути керування (кат-сцени, діалоги). */
  inputLocked = false;

  // --- рух ---
  private coyoteMs = 0;
  private jumpBufferMs = 0;
  private jumping = false;
  /** Час (scene.time.now) останнього дотику до дошки — ставить сцена в колбеку колізії. */
  oneWayContactAt = -Infinity;
  private dropUntil = -Infinity;

  // --- бій ---
  private mode: State = 'move';
  private stateMs = 0;
  private hurtMs = 0;
  private attackPhase: AttackPhase = 'windup';
  private swingId = 0;
  private blocking = false;
  private blockPressedAt = -Infinity;
  private invulnerableUntil = -Infinity;
  private healApplied = false;
  private afterImageMs = 0;
  /** Буфер дій: натиснув атаку/перекат трохи раніше, ніж можна (під час удару, відкидання) — спрацює, щойно стане можливо. */
  private attackBufferMs = 0;
  private rollBufferMs = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private controls: InputMap,
    private fx: Fx,
    private hooks: PlayerHooks,
    loadout: PlayerLoadout = DEFAULT_LOADOUT,
  ) {
    super(scene, x, y, Player.spriteFor(loadout.weapon, loadout.armor));
    this.loadout = { ...loadout };
    this.hp = loadout.maxHp;
    this.flasks = loadout.flasks;
    this.stamina = createStamina(loadout.maxStamina);
    this.body.setMaxVelocity(1000, M.maxFallSpeed);
    this.playAnim('idle');
  }

  static spriteFor(weapon: WeaponId, armor: number): string {
    const s = WEAPONS[weapon].sprite;
    return s === 'special' ? 'player.special' : playerSpriteKey(s, armor);
  }

  get weapon(): WeaponDef {
    return WEAPONS[this.loadout.weapon];
  }

  get alive(): boolean {
    return this.mode !== 'dead';
  }

  get isBlocking(): boolean {
    return this.blocking && this.mode === 'move';
  }

  get isRolling(): boolean {
    return this.mode === 'roll';
  }

  get isHealing(): boolean {
    return this.mode === 'heal';
  }

  get attackActive(): boolean {
    return this.mode === 'attack' && this.attackPhase === 'active';
  }

  /** Хітбокс тіла у світових координатах. */
  hitRect(): Rect {
    const b = this.body;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  /** Точка, з якої «б'є» зброя: на рівні плечей. */
  attackOrigin(): { x: number; y: number } {
    return { x: this.body.center.x, y: this.body.y + this.body.height * 0.4 };
  }

  setLoadout(weapon: WeaponId, armor: number): void {
    this.loadout.weapon = weapon;
    this.loadout.armor = armor;
    this.setSpriteKey(Player.spriteFor(weapon, armor));
  }

  isDroppingThrough(): boolean {
    return this.scene.time.now < this.dropUntil;
  }

  /** Повне відновлення (респаун у тестовій печері). */
  restore(): void {
    this.hp = this.loadout.maxHp;
    this.flasks = this.loadout.flasks;
    this.stamina.value = this.stamina.max;
    this.enter('move');
    this.setAlpha(1).clearTint();
    this.playAnim('idle', false);
  }

  // =====================================================================
  update(dtMs: number): void {
    const now = this.scene.time.now;
    this.stateMs += dtMs;
    const busy = this.mode === 'attack' || this.mode === 'roll' || this.blocking;
    tick(this.stamina, { regenPerSec: PLAYER_COMBAT.staminaRegenPerSec, regenDelayMs: PLAYER_COMBAT.staminaRegenDelayMs }, dtMs, now, busy);

    if (this.mode === 'dead') {
      this.body.setVelocityX(approach(this.body.velocity.x, 0, (900 * dtMs) / 1000));
      return;
    }

    if (!this.inputLocked) {
      this.attackBufferMs = this.controls.justPressed('attack') ? M.actionBufferMs : this.attackBufferMs - dtMs;
      this.rollBufferMs = this.controls.justPressed('roll') ? M.actionBufferMs : this.rollBufferMs - dtMs;
    }

    // блимання під час невразливості після удару (у перекаті — своя напівпрозорість)
    if (this.mode !== 'roll') this.setAlpha(now < this.invulnerableUntil && Math.floor(now / 70) % 2 ? 0.35 : 1);

    switch (this.mode) {
      case 'move':
        this.updateMove(dtMs);
        break;
      case 'attack':
        this.updateAttack(dtMs);
        break;
      case 'roll':
        this.updateRoll(dtMs);
        break;
      case 'heal':
        this.updateHeal(dtMs);
        break;
      case 'hurt':
        this.applyGravityShape(this.body.blocked.down);
        if (this.stateMs >= this.hurtMs) this.enter('move');
        break;
    }
  }

  private enter(state: State): void {
    this.mode = state;
    this.stateMs = 0;
    if (state !== 'move') this.blocking = false;
    if (this.tintTopLeft === BLOCK_TINT) this.clearTint();
  }

  // ---------------- рух ----------------

  private updateMove(dtMs: number): void {
    const onGround = this.body.blocked.down;
    const now = this.scene.time.now;
    const c = this.controls;
    const locked = this.inputLocked;

    // блок: тримаємо кнопку; момент натискання запам'ятовуємо для паріру
    if (!locked && c.justPressed('block')) this.blockPressedAt = now;
    this.blocking = !locked && c.isDown('block');

    // дії, що перериваютъ рух (пріоритет: перекат > атака > фляга)
    if (!locked) {
      if (this.rollBufferMs > 0 && onGround && canAct(this.stamina)) return this.startRoll();
      if (this.attackBufferMs > 0 && canAct(this.stamina)) return this.startAttack();
      if (c.justPressed('heal') && this.flasks > 0 && onGround) return this.startHeal();
    }

    this.moveHorizontal(dtMs, this.blocking ? BLOCK.moveMultiplier : 1, !this.blocking);
    this.handleJump(dtMs, onGround, now);
    this.applyGravityShape(onGround);
    this.updateMoveAnimation(onGround);
  }

  /** Горизонтальний рух з прискоренням. turn=false — не розвертатися (щит дивиться в той самий бік). */
  private moveHorizontal(dtMs: number, mult: number, turn: boolean): void {
    const onGround = this.body.blocked.down;
    const dir = this.inputLocked ? 0 : this.controls.axisX();
    const accel = dir !== 0 ? (onGround ? M.accelGround : M.accelAir) : onGround ? M.decelGround : M.decelAir;
    this.body.setVelocityX(approach(this.body.velocity.x, dir * M.runSpeed * mult, (accel * dtMs) / 1000));
    if (dir !== 0 && turn) this.face(dir as 1 | -1);
  }

  face(dir: 1 | -1): void {
    this.facing = dir;
    this.setFacing(dir);
  }

  private handleJump(dtMs: number, onGround: boolean, now: number): void {
    const body = this.body;
    const c = this.controls;
    if (onGround) {
      this.coyoteMs = M.coyoteMs;
      if (body.velocity.y >= 0) this.jumping = false;
    } else {
      this.coyoteMs -= dtMs;
    }
    this.jumpBufferMs = !this.inputLocked && c.justPressed('jump') ? M.jumpBufferMs : this.jumpBufferMs - dtMs;

    const onPlank = onGround && now - this.oneWayContactAt < 80;
    if (onPlank && c.isDown('down') && this.jumpBufferMs > 0) {
      this.dropUntil = now + M.dropThroughMs;
      this.jumpBufferMs = 0;
      this.coyoteMs = 0;
      body.setVelocityY(M.dropThroughPush);
    }
    if (this.jumpBufferMs > 0 && this.coyoteMs > 0) {
      body.setVelocityY(-M.jumpVelocity);
      this.jumpBufferMs = 0;
      this.coyoteMs = 0;
      this.jumping = true;
    }
    if (this.jumping && c.justReleased('jump') && body.velocity.y < 0) {
      body.setVelocityY(body.velocity.y * M.jumpCutMultiplier);
    }
  }

  /** М'якша вершина стрибка і швидше падіння (через додаткову гравітацію тіла). */
  private applyGravityShape(onGround: boolean): void {
    let g = 1;
    if (!onGround) {
      if (Math.abs(this.body.velocity.y) < M.apexThreshold && this.controls.isDown('jump')) g = M.apexGravityMultiplier;
      else if (this.body.velocity.y > 0) g = M.fallGravityMultiplier;
    }
    this.body.setGravityY(GAME.gravity * (g - 1));
  }

  private updateMoveAnimation(onGround: boolean): void {
    if (this.blocking) {
      // анімації блоку в паку немає → fallback: стійка (перший кадр idle) + синій відтінок «щита»
      this.holdFrame('idle', 0);
      this.setTint(BLOCK_TINT);
      return;
    }
    if (this.tintTopLeft === BLOCK_TINT) this.clearTint();
    if (onGround) {
      this.playAnim(Math.abs(this.body.velocity.x) > 10 ? 'walk' : 'idle');
      return;
    }
    // анімацій стрибка/падіння в паку немає → тримаємо «кроковий» кадр ходьби
    if (!this.playAnim(this.body.velocity.y < 0 ? 'jump' : 'fall')) this.holdFrame('walk', 0);
  }

  // ---------------- атака ----------------

  private startAttack(): void {
    this.attackBufferMs = 0;
    const w = this.weapon;
    spend(this.stamina, w.staminaCost, this.scene.time.now);
    this.enter('attack');
    this.attackPhase = 'windup';
    this.swingId++;
    // Анімація паку: кадри 0–1 — замах, 2 — удар, 3 — відновлення. Підганяємо тривалість під фази зброї.
    if (this.hasAnim('attack')) this.play({ key: `${this.key}:attack`, duration: w.windupMs * 2, repeat: 0 });
  }

  private updateAttack(dtMs: number): void {
    const w = this.weapon;
    const body = this.body;
    // під час удару майже стоїмо (плавне гальмування)
    body.setVelocityX(approach(body.velocity.x, 0, (900 * dtMs) / 1000));
    this.applyGravityShape(body.blocked.down);

    if (this.attackPhase === 'windup' && this.stateMs >= w.windupMs) {
      this.attackPhase = 'active';
      if (w.lunge) body.setVelocityX(this.facing * w.lunge);
      if (w.projectile) this.hooks.onShoot(this, w);
    }
    if (this.attackPhase === 'active') {
      if (!w.projectile) this.hooks.onMeleeActive(this, w, this.swingId);
      if (this.stateMs >= w.windupMs + w.activeMs) this.attackPhase = 'recovery';
    }
    if (this.attackPhase === 'recovery' && this.stateMs >= w.windupMs + w.activeMs + w.recoveryMs) this.enter('move');
  }

  // ---------------- перекат ----------------

  private startRoll(): void {
    this.rollBufferMs = 0;
    const now = this.scene.time.now;
    spend(this.stamina, ROLL.staminaCost, now);
    const dir = this.controls.axisX();
    if (dir !== 0) this.face(dir as 1 | -1);
    this.enter('roll');
    this.invulnerableUntil = Math.max(this.invulnerableUntil, now + ROLL.iFramesMs);
    this.afterImageMs = 0;
    this.fx.playFx('smoke', this.x - this.facing * 6, this.y - 6, { scale: 0.6, depth: this.depth - 1 });
  }

  private updateRoll(dtMs: number): void {
    const now = this.scene.time.now;
    this.body.setVelocityX(this.facing * ROLL.speed);
    this.applyGravityShape(this.body.blocked.down);
    // анімації перекату немає → fallback: ривок + сліди + напівпрозорість на час i-frames
    if (!this.playAnim('roll')) this.holdFrame('walk', 0);
    this.setAlpha(now < this.invulnerableUntil ? 0.5 : 1);
    this.afterImageMs -= dtMs;
    if (this.afterImageMs <= 0) {
      this.fx.afterImage(this);
      this.afterImageMs = ROLL.afterImageEveryMs;
    }
    if (this.stateMs >= ROLL.durationMs) {
      this.body.setVelocityX(this.facing * M.runSpeed * 0.6);
      this.setAlpha(1);
      this.enter('move');
    }
  }

  // ---------------- фляга ----------------

  private startHeal(): void {
    this.flasks--;
    this.flasksUsed++;
    this.healApplied = false;
    this.enter('heal');
    this.fx.floatText(this.x, this.y - 34, 'ковток…', '#9fe0a0');
  }

  private updateHeal(dtMs: number): void {
    // вразливий і повільний; анімації пиття немає → fallback: стійка з легким «киванням»
    this.moveHorizontal(dtMs, FLASK.moveMultiplier, true);
    this.applyGravityShape(this.body.blocked.down);
    this.holdFrame('idle', Math.floor(this.stateMs / 150) % 2);
    if (!this.healApplied && this.stateMs >= FLASK.gulpAtMs) {
      this.healApplied = true;
      const before = this.hp;
      this.hp = Math.min(this.loadout.maxHp, this.hp + this.loadout.flaskHeal);
      this.fx.playFx('heal', this.x, this.y - 16, { depth: this.depth + 1 });
      this.fx.floatText(this.x, this.y - 34, `+${this.hp - before}`, '#7dff9a');
    }
    if (this.stateMs >= FLASK.drinkMs) this.enter('move');
  }

  // ---------------- отримання удару ----------------

  /** Повертає результат захисту (атакувальник дізнається, чи його паріровано). */
  receiveHit(a: IncomingAttack): DefenseOutcome {
    if (this.mode === 'dead') return 'dodged';
    const now = this.scene.time.now;
    const fromSide: 1 | -1 = a.fromX >= this.body.center.x ? 1 : -1;
    const res = resolveHit(
      { now, damage: a.damage, blockable: a.blockable, fromSide },
      {
        invulnerable: now < this.invulnerableUntil,
        blockHeld: this.isBlocking,
        blockPressedAt: this.mode === 'move' ? this.blockPressedAt : -Infinity,
        facing: this.facing,
        stamina: this.stamina.value,
      },
      { parryWindowMs: BLOCK.parryWindowMs, staminaPerDamage: BLOCK.staminaPerDamage },
    );
    if (res.staminaCost > 0) drain(this.stamina, res.staminaCost, now);
    this.hooks.onDefense(this, res.outcome, a.attacker);

    if (res.outcome === 'blocked') {
      this.body.setVelocityX(-fromSide * 60);
      return res.outcome;
    }
    if (res.outcome === 'dodged' || res.outcome === 'parried') return res.outcome;

    // броня зменшує шкоду (мінімум 1)
    const reduction = ARMOR_DAMAGE_REDUCTION[this.loadout.armor] ?? 0;
    const dmg = Math.max(1, Math.round(res.damageTaken * (1 - reduction)));
    this.hp = Math.max(0, this.hp - dmg);
    this.damageTaken += dmg;

    // отримання удару: червоне блимання + відкидання + коротка заморозка кадру
    this.fx.flash(this, 0xff3b3b, HIT_FEEL.flashMs);
    this.fx.hitstop(HIT_FEEL.playerHurtHitstopMs);
    this.fx.shake(HIT_FEEL.shakeMs * 1.5, HIT_FEEL.heavyShakeIntensity);
    this.fx.playFx('splatter', this.x, this.y - 16, { flipX: fromSide > 0, scale: 0.8 });

    if (this.hp <= 0) {
      this.die();
      return res.outcome;
    }
    // якщо пив флягу і ще не ковтнув — лікування пропало (стан heal перериваємо)
    this.invulnerableUntil = now + PLAYER_COMBAT.hurtIFramesMs;
    const kb = a.knockback ?? 1;
    this.body.setVelocity(-fromSide * PLAYER_COMBAT.hurtKnockbackX * kb, PLAYER_COMBAT.hurtKnockbackY * kb);
    this.enter('hurt');
    this.hurtMs = res.outcome === 'guardBreak' ? BLOCK.guardBreakStunMs : PLAYER_COMBAT.hurtStunMs;
    this.holdFrame('idle', 0);
    return res.outcome;
  }

  private die(): void {
    this.enter('dead');
    this.setAlpha(1);
    this.body.setVelocityY(-80);
    if (!this.playAnim('death', false)) this.fx.disintegrate(this);
    this.hooks.onDeath(this);
  }
}
