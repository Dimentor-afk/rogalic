/**
 * Гравець — лицар. Рух: біг, стрибок зі змінною висотою, «час койота», буфер стрибка, зістрибування з дошок,
 * присід і підкат, висіння на краю уступу й видирання. Бій: прийоми меча, удар з присіду, пікірування в стрибку,
 * перекат з невразливістю, блок/паріру, фляги «Енергетик», стаміна «Нерви».
 *
 * Стан — простий скінченний автомат:
 *   move   — звичайний рух; блок тримається як «модифікатор» цього стану;
 *   crouch — присів: тіло нижче, удар з присіду; slide — підкат на бігу (теж низько);
 *   attack — фази windup → active → recovery (за конфігом прийому);
 *   plunge — пікірування: зависання → падіння вістрям униз → приземлення з ударною хвилею;
 *   hang / climb — висить на краю уступу / видирається нагору;
 *   roll — ривок з i-frames; heal — п'є флягу (вразливий); hurt — відкидання після удару;
 *   pray — молиться перед автоматом у хабі; dead.
 * Кожен стан показує свою анімацію з паку. Часто анімацію «розтягуємо» на тривалість стану
 * (кадр = частка часу, що минула), щоб важливий кадр (удар, ковток) збігався з моментом у логіці.
 * Анімації блоку в паку немає — тримаємо кадр стійки з мечем угорі й підфарбовуємо.
 */
import Phaser from 'phaser';
import { GAME } from '../config/game';
import { CROUCH, LEDGE, PLAYER_MOVE as M, PRAY, SLIDE } from '../config/player';
import { AIR_ATTACK, BLOCK, FLASK, HIT_FEEL, PLAYER_COMBAT, ROLL } from '../config/combat';
import { CROUCH_ATTACK, WEAPONS, type AttackMove, type WeaponDef, type WeaponId } from '../config/weapons';
import { ARMOR_DAMAGE_REDUCTION } from '../config/economy';
import { PLAYER_SPRITE } from '../config/assets';
import { animKey, type BodyDef } from '../core/assets/manifest';
import type { InputMap } from '../core/input/InputMap';
import type { Grid } from '../core/level/grid';
import { canAct, createStamina, drain, spend, tick, type Stamina } from '../core/combat/stamina';
import { resolveHit, type DefenseOutcome } from '../core/combat/defense';
import type { Rect, Vec } from '../core/combat/geometry';
import { findLedge, rectFree, type Ledge } from '../core/combat/ledge';
import type { Fx } from '../core/fx/Fx';
import { ManifestSprite } from './ManifestSprite';
import { sfx } from '../core/audio/Sfx';

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

/** Зона і сила одного удару гравця: дуга (або коло, якщо arcDeg = 360) від точки origin. */
export interface MeleeSwing {
  origin: Vec;
  range: number;
  arcDeg: number;
  facing: 1 | -1;
  damage: number;
  knockback: number;
  heavy?: boolean;
  /** Відкидати від точки удару в обидва боки (ударна хвиля), а не туди, куди дивиться гравець. */
  radial?: boolean;
}

/** Через ці колбеки гравець «повідомляє» бойову систему сцени про удари і смерть та питає про рівень. */
export interface PlayerHooks {
  /** Активна фаза ближнього удару (викликається щокадру, поки фаза триває). */
  onMeleeActive(player: Player, swing: MeleeSwing, swingId: number): void;
  onShoot(player: Player, move: AttackMove): void;
  onDefense(player: Player, outcome: DefenseOutcome, attacker: unknown): void;
  onDeath(player: Player): void;
  /** Сітка рівня — щоб перевірити, чи є де встати з присіду і чи є за що вхопитися. */
  level(): { grid: Grid; tileSize: number };
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

type State = 'move' | 'crouch' | 'slide' | 'attack' | 'plunge' | 'hang' | 'climb' | 'roll' | 'heal' | 'hurt' | 'pray' | 'dead';
type AttackPhase = 'windup' | 'active' | 'recovery';
type PlungePhase = 'hover' | 'dive' | 'land';

const BLOCK_TINT = 0x9fc8ff;
/** Поза блоку: кадр, де лицар тримає меч горизонтально над собою (кінець атаки attack_sword). */
const BLOCK_POSE = { anim: 'attack_sword', frame: 5 };
/** Після падіння з такою швидкістю (px/с) з-під ніг злітає пил. */
const HARD_LANDING_SPEED = 330;

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
  /** Скільки мс у повітрі (для кадру відштовхування) і найбільша швидкість падіння (для пилу при приземленні). */
  private airMs = 0;
  private fallSpeed = 0;
  /** Час (scene.time.now) останнього дотику до дошки — ставить сцена в колбеку колізії. */
  oneWayContactAt = -Infinity;
  private dropUntil = -Infinity;
  /** Стоїть чи «низько» (присід, підкат, перекат): від цього залежить хітбокс. */
  private pose: 'stand' | 'low' = 'stand';
  /** Уступ, на якому висимо / на який видираємось, і звідки почали видиратися. */
  private ledge: Ledge | null = null;
  private climbFromY = 0;
  private regrabAt = -Infinity;

  // --- бій ---
  private mode: State = 'move';
  private stateMs = 0;
  private hurtMs = 0;
  /** Поточний удар: прийом зброї або удар з присіду. */
  private move: AttackMove = WEAPONS.sword;
  private attackPhase: AttackPhase = 'windup';
  private plungePhase: PlungePhase = 'hover';
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
    super(scene, x, y, PLAYER_SPRITE);
    this.loadout = { ...loadout };
    this.hp = loadout.maxHp;
    this.flasks = loadout.flasks;
    this.stamina = createStamina(loadout.maxStamina);
    this.body.setMaxVelocity(1000, M.maxFallSpeed);
    this.playAnim('idle');
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

  /** Назва стану (для дебаг-тексту). */
  get stateName(): string {
    return this.mode;
  }

  /** Хітбокс тіла у світових координатах. */
  hitRect(): Rect {
    const b = this.body;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  /** Точка, з якої «б'є» зброя: по центру тіла на висоті heightAboveFeet над ногами. */
  attackOrigin(heightAboveFeet = this.move.originHeight): Vec {
    return { x: this.body.center.x, y: this.body.bottom - heightAboveFeet };
  }

  /** Зброя (прийом) і рівень броні. Спрайт лицаря один — броня впливає лише на шкоду. */
  setLoadout(weapon: WeaponId, armor: number): void {
    this.loadout.weapon = weapon;
    this.loadout.armor = armor;
  }

  /** Нові характеристики (після прокачки в хабі) + повне відновлення. */
  applyLoadout(l: PlayerLoadout): void {
    Object.assign(this.loadout, l);
    this.stamina.max = l.maxStamina;
    this.setLoadout(l.weapon, l.armor);
    this.restore();
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
    this.setPose('stand');
    this.setAlpha(1).clearTint();
    this.playAnim('idle', false);
  }

  /**
   * Стати на коліно й помолитися (перед автоматом у хабі). Керування на цей час вимкнене.
   * Повертає тривалість молитви, мс (0 — зараз не можна: у повітрі, в ударі тощо).
   */
  pray(): number {
    if (this.mode !== 'move' || !this.body.blocked.down) return 0;
    this.enter('pray');
    this.body.setVelocityX(0);
    return PRAY.durationMs;
  }

  // =====================================================================
  update(dtMs: number): void {
    const now = this.scene.time.now;
    this.stateMs += dtMs;
    const busy = this.mode === 'attack' || this.mode === 'plunge' || this.mode === 'roll' || this.mode === 'slide' || this.blocking;
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
      case 'crouch':
        this.updateCrouch(dtMs);
        break;
      case 'slide':
        this.updateSlide(dtMs);
        break;
      case 'attack':
        this.updateAttack(dtMs);
        break;
      case 'plunge':
        this.updatePlunge();
        break;
      case 'hang':
        this.updateHang();
        break;
      case 'climb':
        this.updateClimb();
        break;
      case 'roll':
        this.updateRoll(dtMs);
        break;
      case 'heal':
        this.updateHeal(dtMs);
        break;
      case 'hurt':
        this.applyGravityShape(this.body.blocked.down);
        this.showProgress('hurt', this.stateMs / this.hurtMs);
        if (this.stateMs >= this.hurtMs) this.enter('move');
        break;
      case 'pray':
        this.brake(dtMs, M.decelGround);
        this.applyGravityShape(this.body.blocked.down);
        this.showProgress('pray', this.stateMs / PRAY.durationMs);
        if (this.stateMs >= PRAY.durationMs) this.enter('move');
        break;
    }
  }

  private enter(state: State): void {
    const prev = this.mode;
    this.mode = state;
    this.stateMs = 0;
    if (state !== 'move') this.blocking = false;
    if (this.tintTopLeft === BLOCK_TINT) this.clearTint();
    // вийшли з висіння/видирання/пікірування — повертаємо тілу звичайну фізику
    if ((prev === 'hang' || prev === 'climb') && state !== 'climb') this.freezeBody(false);
    if (prev === 'plunge') {
      this.body.setAllowGravity(true);
      this.body.setMaxVelocityY(M.maxFallSpeed);
    }
  }

  // ---------------- кадри анімацій ----------------

  /** Показати кадр анімації за прогресом t ∈ [0, 1]: анімація «розтягується» на тривалість стану. */
  private showProgress(anim: string, t: number): void {
    const n = this.scene.anims.get(animKey(this.key, anim))?.frames.length ?? 1;
    this.holdFrame(anim, Phaser.Math.Clamp(Math.floor(t * n), 0, n - 1));
  }

  /** Те саме, але з вибраних кадрів (фаза удару показує лише свої кадри). */
  private showFrames(anim: string, frames: readonly number[], t: number): void {
    const i = Phaser.Math.Clamp(Math.floor(t * frames.length), 0, frames.length - 1);
    this.holdFrame(anim, frames[i]!);
  }

  // ---------------- тіло: присід, заморожування ----------------

  /** Хітбокс для ManifestSprite: у присіді, підкаті й перекаті — нижчий (і переживає розворот, бо береться звідси щоразу). */
  protected override currentBody(): BodyDef {
    return this.pose === 'low' ? CROUCH.body : super.currentBody();
  }

  private setPose(pose: 'stand' | 'low'): void {
    if (this.pose === pose) return;
    this.pose = pose;
    this.applyBody();
  }

  /** Чи є над головою місце встати на весь зріст. */
  private canStand(): boolean {
    const b = this.body;
    const h = this.spriteDef.body.h;
    const { grid, tileSize } = this.hooks.level();
    return rectFree(grid, tileSize, { x: b.x, y: b.bottom - h, w: b.width, h });
  }

  /** Встати, якщо є куди. Повертає true, якщо тепер стоїмо. */
  private tryStand(): boolean {
    if (this.pose === 'stand') return true;
    if (!this.canStand()) return false;
    this.setPose('stand');
    return true;
  }

  /** Висіння і видирання: тіло не рухається фізикою і ні з чим не стикається — позицію ставимо самі. */
  private freezeBody(frozen: boolean): void {
    this.body.moves = !frozen;
    this.body.checkCollision.none = frozen;
    this.body.setVelocity(0, 0);
  }

  /** Переставити гравця (ноги в x, y) разом з тілом — так, щоб фізика наприкінці кадру не «доганяла» спрайт. */
  private teleport(x: number, y: number): void {
    this.setPosition(x, y);
    const b = this.body;
    b.updateFromGameObject();
    b.prev.copy(b.position);
    b.prevFrame.copy(b.position);
  }

  /** x спрайта, за якого лівий край хітбокса буде в bodyX. */
  private spriteXFor(bodyX: number): number {
    return bodyX - (this.body.offset.x - this.displayOriginX) * this.scaleX;
  }

  // ---------------- рух ----------------

  private updateMove(dtMs: number): void {
    const onGround = this.body.blocked.down;
    const now = this.scene.time.now;
    const c = this.controls;
    const locked = this.inputLocked;

    // присів під низькою стелею (напр. відкинуло ударом) — встати нікуди, лишаємось у присіді
    if (!this.tryStand()) return this.startCrouch();

    // блок: тримаємо кнопку; момент натискання запам'ятовуємо для паріру
    if (!locked && c.justPressed('block')) this.blockPressedAt = now;
    this.blocking = !locked && c.isDown('block');

    // дії, що переривають рух (пріоритет: перекат > атака > фляга > підкат > присід)
    if (!locked) {
      if (this.rollBufferMs > 0 && onGround && canAct(this.stamina)) return this.startRoll();
      if (this.attackBufferMs > 0 && canAct(this.stamina)) return onGround ? this.startAttack(this.weapon) : this.startPlunge();
      if (c.justPressed('heal') && this.flasks > 0 && onGround) return this.startHeal();
      if (this.wantsSlide()) return this.startSlide();
      if (this.wantsCrouch()) return this.startCrouch();
    }

    this.moveHorizontal(dtMs, this.blocking ? BLOCK.moveMultiplier : 1, !this.blocking);
    this.handleJump(dtMs, onGround, now);
    this.applyGravityShape(onGround);
    if (!onGround && !this.blocking && this.tryGrabLedge()) return;
    this.trackAir(dtMs, onGround);
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

  /** Плавно загальмувати по горизонталі. */
  private brake(dtMs: number, decel: number): void {
    this.body.setVelocityX(approach(this.body.velocity.x, 0, (decel * dtMs) / 1000));
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

  /** Час у повітрі і жорстке приземлення (пил з-під ніг). */
  private trackAir(dtMs: number, onGround: boolean): void {
    if (!onGround) {
      this.airMs += dtMs;
      this.fallSpeed = Math.max(this.fallSpeed, this.body.velocity.y);
      return;
    }
    if (this.airMs > 0 && this.fallSpeed >= HARD_LANDING_SPEED) this.dust(6);
    this.airMs = 0;
    this.fallSpeed = 0;
  }

  /** Пил з-під ніг (жорстке приземлення, пікірування). */
  private dust(count: number): void {
    this.fx.burst(this.body.center.x, this.body.bottom - 2, 0xb9b0a4, count, 110, 320, 260);
  }

  private updateMoveAnimation(onGround: boolean): void {
    if (this.blocking) {
      // анімації блоку в паку немає → тримаємо стійку з мечем угорі + синій відтінок «щита»
      this.holdFrame(BLOCK_POSE.anim, BLOCK_POSE.frame);
      this.setTint(BLOCK_TINT);
      return;
    }
    if (this.tintTopLeft === BLOCK_TINT) this.clearTint();
    if (onGround) {
      this.playAnim(Math.abs(this.body.velocity.x) > 10 ? 'walk' : 'idle');
      return;
    }
    // угору — кадр стрибка за швидкістю (відштовхнувся → летить → вершина), униз — цикл падіння
    const vy = this.body.velocity.y;
    if (vy < 0) this.holdFrame('jump', this.airMs < 60 ? 0 : vy < -200 ? 1 : vy < -80 ? 2 : 3);
    else this.playAnim('fall');
  }

  // ---------------- присід ----------------

  /** Тримає «вниз» на землі і не стрибає (вниз+стрибок — зістрибнути з дошки) і не блокує. */
  private wantsCrouch(): boolean {
    const c = this.controls;
    return !this.inputLocked && this.body.blocked.down && c.isDown('down') && !c.isDown('jump') && !c.isDown('block');
  }

  private startCrouch(): void {
    this.enter('crouch');
    this.setPose('low');
    this.playAnim('crouch', false);
  }

  private updateCrouch(dtMs: number): void {
    // відпустив «вниз» (або натиснув стрибок) — встаємо і в цьому ж кадрі рухаємось (щоб стрибок не загубився)
    if (!this.wantsCrouch() && this.tryStand()) {
      this.enter('move');
      return this.updateMove(dtMs);
    }
    if (!this.inputLocked) {
      if (this.attackBufferMs > 0 && canAct(this.stamina)) return this.startAttack(CROUCH_ATTACK);
      if (this.rollBufferMs > 0 && canAct(this.stamina)) return this.startRoll();
    }
    // у присіді лише повземо — повільно (окремої анімації немає, тож швидко «їхати» в присіді було б дивно)
    const dir = this.inputLocked ? 0 : this.controls.axisX();
    if (dir !== 0) this.face(dir as 1 | -1);
    this.body.setVelocityX(approach(this.body.velocity.x, dir * CROUCH.crawlSpeed, (M.decelGround * dtMs) / 1000));
    this.applyGravityShape(this.body.blocked.down);
    this.playAnim('crouch');
  }

  // ---------------- підкат ----------------

  /** На бігу щойно натиснув «вниз» (без стрибка — то зістрибування з дошки). */
  private wantsSlide(): boolean {
    const c = this.controls;
    const running = Math.abs(this.body.velocity.x) >= M.runSpeed * SLIDE.minRunShare;
    return this.body.blocked.down && running && c.justPressed('down') && !c.isDown('jump') && !this.blocking && canAct(this.stamina);
  }

  private startSlide(): void {
    spend(this.stamina, SLIDE.staminaCost, this.scene.time.now);
    this.face(this.body.velocity.x > 0 ? 1 : -1);
    this.enter('slide');
    this.setPose('low');
    this.dust(6);
    sfx.play('roll');
  }

  /** Ковзаємо, сповільнюючись; наприкінці — присід, якщо «вниз» досі тримають (або встати нікуди). */
  private updateSlide(dtMs: number): void {
    const t = Math.min(1, this.stateMs / SLIDE.durationMs);
    this.body.setVelocityX(this.facing * Phaser.Math.Linear(SLIDE.startSpeed, SLIDE.endSpeed, t));
    this.applyGravityShape(this.body.blocked.down);
    this.showFrames('slide', SLIDE.frames, t);
    // стрибок з підкату (або з'їхав з краю) — встаємо і рухаємось уже цього кадру
    const jump = !this.inputLocked && this.controls.justPressed('jump');
    if ((jump || !this.body.blocked.down) && this.tryStand()) {
      this.enter('move');
      return this.updateMove(dtMs);
    }
    if (t < 1) return;
    if (this.wantsCrouch() || !this.tryStand()) this.startCrouch();
    else this.enter('move');
  }

  // ---------------- уступи ----------------

  /** У стрибку, тиснучи до стіни: якщо край на висоті рук — хапаємось. */
  private tryGrabLedge(): boolean {
    const c = this.controls;
    const dir = c.axisX();
    if (this.inputLocked || dir === 0 || c.isDown('down') || this.isDroppingThrough()) return false;
    if (this.scene.time.now < this.regrabAt || this.body.velocity.y < -LEDGE.maxRiseSpeed) return false;
    const { grid, tileSize } = this.hooks.level();
    const ledge = findLedge(grid, tileSize, {
      body: this.hitRect(),
      dir: dir as 1 | -1,
      handAboveFeet: LEDGE.handAboveFeet,
      tolerance: LEDGE.grabTolerance,
      reach: LEDGE.reach,
    });
    if (!ledge) return false;

    this.face(dir as 1 | -1);
    this.ledge = ledge;
    this.enter('hang');
    this.freezeBody(true);
    // руки — на самому краї: ноги на handAboveFeet нижче верху уступу
    this.teleport(this.spriteXFor(ledge.hangX), ledge.top + LEDGE.handAboveFeet);
    this.jumping = false;
    this.airMs = 0;
    this.fallSpeed = 0;
    this.playAnim('hang', false);
    return true;
  }

  private updateHang(): void {
    const c = this.controls;
    this.playAnim('hang');
    if (this.inputLocked) return;
    if (c.justPressed('jump') || c.justPressed('up')) {
      this.enter('climb');
      this.climbFromY = this.y;
      return;
    }
    // «вниз» або від стіни — відпускаємо
    if (c.isDown('down') || c.axisX() === -this.facing) {
      this.regrabAt = this.scene.time.now + LEDGE.regrabMs;
      this.enter('move');
    }
  }

  /**
   * Видирання: спершу вгору через край (ноги до верху уступу, спрайт посунутий на сам край — лізе по ньому),
   * потім крок на уступ. Тіло заморожене, тож позицію спрайта ставимо напряму.
   */
  private updateClimb(): void {
    const ledge = this.ledge!;
    const t = Math.min(1, this.stateMs / LEDGE.climbMs);
    const rise = Phaser.Math.Easing.Sine.Out(Math.min(1, t / (1 - LEDGE.climbStepShare)));
    const step = Math.max(0, (t - (1 - LEDGE.climbStepShare)) / LEDGE.climbStepShare);
    const fromX = this.spriteXFor(ledge.hangX);
    const toX = this.spriteXFor(ledge.standX);
    const x = step > 0 ? Phaser.Math.Linear(ledge.wallX, toX, step) : Phaser.Math.Linear(fromX, ledge.wallX, rise);
    this.setPosition(x, Phaser.Math.Linear(this.climbFromY, ledge.top, rise));
    this.showProgress('climb', t);
    if (t >= 1) {
      this.enter('move');
      this.teleport(toX, ledge.top);
      this.ledge = null;
      this.playAnim('idle', false);
    }
  }

  // ---------------- атака ----------------

  private startAttack(move: AttackMove): void {
    this.attackBufferMs = 0;
    spend(this.stamina, move.staminaCost, this.scene.time.now);
    this.move = move;
    this.enter('attack');
    this.attackPhase = 'windup';
    this.swingId++;
    sfx.play('swing');
    this.showAttackFrame();
  }

  private updateAttack(dtMs: number): void {
    const w = this.move;
    const body = this.body;
    // під час удару майже стоїмо (плавне гальмування)
    this.brake(dtMs, 900);
    this.applyGravityShape(body.blocked.down);

    if (this.attackPhase === 'windup' && this.stateMs >= w.windupMs) {
      this.attackPhase = 'active';
      if (w.lunge) body.setVelocityX(this.facing * w.lunge);
      if (w.projectile) this.hooks.onShoot(this, w);
    }
    if (this.attackPhase === 'active') {
      if (!w.projectile) this.hooks.onMeleeActive(this, this.swingOf(w), this.swingId);
      if (this.stateMs >= w.windupMs + w.activeMs) this.attackPhase = 'recovery';
    }
    if (this.attackPhase === 'recovery' && this.stateMs >= w.windupMs + w.activeMs + w.recoveryMs) {
      // після удару з присіду лишаємось у присіді, якщо «вниз» досі тримають
      if (this.pose === 'low' && (this.wantsCrouch() || !this.tryStand())) this.startCrouch();
      else this.enter('move');
      return;
    }
    this.showAttackFrame();
  }

  /** Кадр анімації за фазою удару: кожна фаза рівномірно показує свої кадри за свою тривалість. */
  private showAttackFrame(): void {
    const w = this.move;
    const t = this.stateMs;
    if (this.attackPhase === 'windup') this.showFrames(w.anim, w.frames.windup, t / w.windupMs);
    else if (this.attackPhase === 'active') this.showFrames(w.anim, w.frames.active, (t - w.windupMs) / w.activeMs);
    else this.showFrames(w.anim, w.frames.recovery, (t - w.windupMs - w.activeMs) / w.recoveryMs);
  }

  private swingOf(w: AttackMove): MeleeSwing {
    return {
      origin: this.attackOrigin(w.originHeight),
      range: w.range,
      arcDeg: w.arcDeg,
      facing: this.facing,
      damage: w.damage,
      knockback: w.knockback,
      heavy: w.heavy,
    };
  }

  // ---------------- пікірування ----------------

  private startPlunge(): void {
    this.attackBufferMs = 0;
    spend(this.stamina, AIR_ATTACK.staminaCost, this.scene.time.now);
    this.enter('plunge');
    this.plungePhase = 'hover';
    this.swingId++;
    this.body.setVelocity(0, 0);
    this.body.setAllowGravity(false);
    sfx.play('swing');
    this.showFrames('air_attack', AIR_ATTACK.frames.hover, 0);
  }

  private updatePlunge(): void {
    const A = AIR_ATTACK;
    const body = this.body;
    if (this.plungePhase === 'hover') {
      body.setVelocity(0, 0);
      if (this.stateMs >= A.hoverMs) {
        this.plungePhase = 'dive';
        this.stateMs = 0;
        body.setAllowGravity(true);
        body.setMaxVelocityY(A.diveSpeed);
      }
      this.showFrames('air_attack', A.frames.hover, 0);
      return;
    }
    if (this.plungePhase === 'dive') {
      body.setVelocity(0, A.diveSpeed);
      // вістря меча — біля ніг: б'ємо всіх, крізь кого пролітаємо
      this.hooks.onMeleeActive(this, this.plungeSwing(A.diveRadius, A.diveDamage, A.diveKnockback, 4), this.swingId);
      if (body.blocked.down) return this.landPlunge();
      const frames = A.frames.dive;
      this.holdFrame('air_attack', frames[Math.floor(this.stateMs / A.diveFrameMs) % frames.length]!);
      return;
    }
    // приземлення: стоїмо, доки не відіграє ударна хвиля
    body.setVelocityX(0);
    this.applyGravityShape(body.blocked.down);
    this.showFrames('air_attack', A.frames.land, this.stateMs / A.landRecoveryMs);
    if (this.stateMs >= A.landRecoveryMs) this.enter('move');
  }

  /** Удар об землю: окремий «замах» (той, кого щойно проткнули, отримує ще й хвилю), тряска, пил. */
  private landPlunge(): void {
    const A = AIR_ATTACK;
    this.plungePhase = 'land';
    this.stateMs = 0;
    this.body.setMaxVelocityY(M.maxFallSpeed);
    this.swingId++;
    this.hooks.onMeleeActive(this, this.plungeSwing(A.landRadius, A.landDamage, A.landKnockback, 2), this.swingId);
    this.fx.shake(HIT_FEEL.shakeMs * 1.4, HIT_FEEL.heavyShakeIntensity);
    this.dust(16);
    sfx.play('hit');
    this.airMs = 0;
    this.fallSpeed = 0;
  }

  /** Коло удару біля ніг (пікірування й ударна хвиля б'ють навколо, відкидаючи в боки). */
  private plungeSwing(radius: number, damage: number, knockback: number, height: number): MeleeSwing {
    return { origin: this.attackOrigin(height), range: radius, arcDeg: 360, facing: this.facing, damage, knockback, radial: true };
  }

  // ---------------- перекат ----------------

  private startRoll(): void {
    this.rollBufferMs = 0;
    const now = this.scene.time.now;
    spend(this.stamina, ROLL.staminaCost, now);
    sfx.play('roll');
    const dir = this.controls.axisX();
    if (dir !== 0) this.face(dir as 1 | -1);
    this.enter('roll');
    this.setPose('low');
    this.invulnerableUntil = Math.max(this.invulnerableUntil, now + ROLL.iFramesMs);
    this.afterImageMs = 0;
    this.fx.playFx('smoke', this.x - this.facing * 6, this.y - 6, { scale: 0.6, depth: this.depth - 1 });
  }

  private updateRoll(dtMs: number): void {
    const now = this.scene.time.now;
    this.body.setVelocityX(this.facing * ROLL.speed);
    this.applyGravityShape(this.body.blocked.down);
    // анімація перекату на всю його тривалість + сліди + напівпрозорість на час i-frames
    this.showProgress('roll', this.stateMs / ROLL.durationMs);
    this.setAlpha(now < this.invulnerableUntil ? 0.6 : 1);
    this.afterImageMs -= dtMs;
    if (this.afterImageMs <= 0) {
      this.fx.afterImage(this);
      this.afterImageMs = ROLL.afterImageEveryMs;
    }
    if (this.stateMs >= ROLL.durationMs) {
      this.body.setVelocityX(this.facing * M.runSpeed * 0.6);
      this.setAlpha(1);
      // закотився в низький лаз — встати нікуди, лишаємось у присіді
      if (this.tryStand()) this.enter('move');
      else this.startCrouch();
    }
  }

  // ---------------- фляга ----------------

  private startHeal(): void {
    this.flasks--;
    this.flasksUsed++;
    this.healApplied = false;
    this.enter('heal');
    this.fx.floatText(this.x, this.y - 50, 'ковток…', '#9fe0a0');
  }

  private updateHeal(dtMs: number): void {
    // п'є на місці (анімації ходьби з флягою немає) і вразливий до ковтка
    this.brake(dtMs, M.decelGround);
    this.applyGravityShape(this.body.blocked.down);
    this.showProgress('heal', this.stateMs / FLASK.drinkMs);
    if (!this.healApplied && this.stateMs >= FLASK.gulpAtMs) {
      this.healApplied = true;
      const before = this.hp;
      this.hp = Math.min(this.loadout.maxHp, this.hp + this.loadout.flaskHeal);
      this.fx.playFx('heal', this.x, this.y - 22, { depth: this.depth + 1 });
      sfx.play('heal');
      this.fx.floatText(this.x, this.y - 50, `+${this.hp - before}`, '#7dff9a');
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
    this.fx.playFx('splatter', this.body.center.x, this.body.center.y, { flipX: fromSide > 0, scale: 0.8 });
    sfx.play('hurt');

    // збило з уступу / з видирання / з присіду чи перекату (якщо є де встати)
    this.ledge = null;
    this.tryStand();
    if (this.hp <= 0) {
      this.die();
      return res.outcome;
    }
    // якщо пив флягу і ще не ковтнув — лікування пропало (стан heal перериваємо)
    this.invulnerableUntil = now + PLAYER_COMBAT.hurtIFramesMs;
    const kb = a.knockback ?? 1;
    this.enter('hurt');
    this.body.setVelocity(-fromSide * PLAYER_COMBAT.hurtKnockbackX * kb, PLAYER_COMBAT.hurtKnockbackY * kb);
    this.hurtMs = res.outcome === 'guardBreak' ? BLOCK.guardBreakStunMs : PLAYER_COMBAT.hurtStunMs;
    this.showProgress('hurt', 0);
    return res.outcome;
  }

  /** Здатися (з меню паузи): одразу смерть, як від смертельного удару. */
  forfeit(): void {
    if (this.mode === 'dead') return;
    this.hp = 0;
    this.die();
  }

  private die(): void {
    sfx.play('death');
    this.enter('dead');
    this.setAlpha(1);
    this.body.setVelocityY(-80);
    if (!this.playAnim('death', false)) this.fx.disintegrate(this);
    this.hooks.onDeath(this);
  }
}
