/**
 * БІБЛІОТЕКА ПАТЕРНІВ АТАК БОСІВ. Кожен патерн — переюзабельний модуль:
 *   телеграф (замах + чесна підказка, куди прилетить) → дія → відновлення.
 * Параметри (шкода, швидкість, кількість…) приходять з конфігу боса (src/config/bosses.ts).
 *
 * Патерни: melee, dash, shot (одиночні), fan (віяло), rain (дощ з неба), obstacles (перекриття арени),
 * summon (міньйони), grow (ріст), slam (стрибок + ударні хвилі), teleport.
 * RiggedPattern — обгортка фінального боса: телеграфує одну атаку, а в останній момент виконує іншу,
 * лишаючи чесне коротке вікно на реакцію.
 */
import Phaser from 'phaser';
import type { PatternDef } from '../../config/bosses';
import type { Hazard } from '../../core/combat/CombatSystem';
import { sfx } from '../../core/audio/Sfx';
import type { Boss, BossWorld } from './Boss';

export abstract class Pattern {
  protected t = 0;
  private acted = false;
  done = false;
  /** Тривалість телеграфу (можна змінити — так робить «підкручування»). */
  telegraphMs: number;
  protected activeMs = 0;
  protected recoverMs = 450;
  /** Індикатори телеграфу (лінії, мітки), щоб прибрати їх у будь-який момент. */
  protected marks: Phaser.GameObjects.GameObject[] = [];
  private stopBlink?: () => void;

  constructor(
    protected b: Boss,
    protected w: BossWorld,
    windupMs: number,
  ) {
    this.telegraphMs = windupMs;
  }

  /** Назва для «підкрученого» перемикання. */
  abstract readonly label: string;

  start(): void {
    this.b.facePlayer();
    // спільний телеграф: біле блимання + тремтіння боса + «!»
    this.stopBlink = this.w.fx.telegraph(this.b, this.telegraphMs, 1);
    this.w.fx.playFx('alert', this.b.x, this.b.y - this.b.displayHeight - 4, { scale: 0.7, depth: 60 });
    this.telegraph();
  }

  /** Особливий телеграф патерну (лінія ривку, мітки дощу…). */
  protected telegraph(): void {}
  protected abstract act(): void;
  protected tick(_dt: number): void {}

  clearMarks(): void {
    for (const m of this.marks) m.destroy();
    this.marks = [];
    this.stopBlink?.();
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.acted) {
      if (this.t >= this.telegraphMs) {
        this.clearMarks();
        this.acted = true;
        this.act();
      }
      return;
    }
    const after = this.t - this.telegraphMs;
    if (after < this.activeMs) this.tick(dt);
    else if (after >= this.activeMs + this.recoverMs) this.done = true;
  }

  /** Перервати (смерть/оглушення боса). */
  abort(): void {
    this.clearMarks();
    this.done = true;
  }

  // ---------- допоміжні для телеграфів ----------

  protected markRect(x: number, y: number, w: number, h: number, color = 0xff3344): void {
    const r = this.b.scene.add.rectangle(x, y, w, h, color, 0.18).setOrigin(0, 0).setStrokeStyle(1, color, 0.8).setDepth(25);
    this.b.scene.tweens.add({ targets: r, alpha: { from: 0.3, to: 1 }, yoyo: true, repeat: -1, duration: 120 });
    this.marks.push(r);
  }

  protected markLine(x1: number, y1: number, x2: number, y2: number, color = 0xff3344): void {
    const g = this.b.scene.add.graphics().setDepth(25);
    g.lineStyle(1, color, 0.7).lineBetween(x1, y1, x2, y2);
    this.b.scene.tweens.add({ targets: g, alpha: { from: 0.2, to: 1 }, yoyo: true, repeat: -1, duration: 100 });
    this.marks.push(g);
  }

  protected aimAngle(fromX: number, fromY: number): number {
    const p = this.w.player.body;
    return Math.atan2(p.center.y - fromY, p.center.x - fromX);
  }
}

// ======================= конкретні патерни =======================

class Melee extends Pattern {
  readonly label = 'удар';
  private hit = false;
  constructor(b: Boss, w: BossWorld, private p: Extract<PatternDef, { kind: 'melee' }>) {
    super(b, w, p.windupMs);
    this.activeMs = 180;
  }
  private zone() {
    const body = this.b.body;
    const reach = this.p.reach * this.b.growth;
    const h = this.p.height * this.b.growth;
    return { x: this.b.facing > 0 ? body.right - 6 : body.x - reach + 6, y: body.bottom - h, w: reach, h };
  }
  protected telegraph(): void {
    const z = this.zone();
    this.markRect(z.x, z.y, z.w, z.h);
  }
  protected act(): void {
    this.b.playAttackAnim(this.activeMs + 200);
    this.b.body.setVelocityX(this.b.facing * 90);
    sfx.play('swing');
  }
  protected tick(): void {
    if (this.hit) return;
    const out = this.w.combat.hitPlayerFrom(this.b, this.b.body.center.x, this.zone(), Math.round(this.p.damage * this.b.growth), true, 1.3);
    if (out) this.hit = true;
  }
}

class Dash extends Pattern {
  readonly label = 'ривок';
  private hit = false;
  /** Напрямок ривку (одиничний вектор). Наземний — горизонтально, літун — пікірує на гравця. */
  private dir = { x: 1, y: 0 };
  private travelled = 0;
  constructor(b: Boss, w: BossWorld, private p: Extract<PatternDef, { kind: 'dash' }>) {
    super(b, w, p.windupMs);
    this.activeMs = 1400;
    this.recoverMs = 500;
  }
  protected telegraph(): void {
    const body = this.b.body;
    const a = this.w.arena;
    if (this.b.flying) {
      // ціль фіксуємо зараз (чесно: лінія показує, куди саме полетить)
      const p = this.w.player.body.center;
      const len = Math.hypot(p.x - body.center.x, p.y - body.center.y) || 1;
      this.dir = { x: (p.x - body.center.x) / len, y: (p.y - body.center.y) / len };
      this.markLine(body.center.x, body.center.y, body.center.x + this.dir.x * 400, body.center.y + this.dir.y * 400);
      return;
    }
    const f = this.b.facing;
    this.dir = { x: f, y: 0 };
    const y = body.y + body.height / 2;
    this.markLine(f > 0 ? body.right : a.left, y, f > 0 ? a.right : body.x, y);
    this.markRect(f > 0 ? body.right : a.left, body.y + 4, f > 0 ? a.right - body.right : body.x - a.left, body.height - 8);
  }
  protected act(): void {
    if (this.b.flying) this.b.face(this.dir.x >= 0 ? 1 : -1);
    sfx.play('roll');
  }
  private stop(): void {
    this.b.body.setVelocity(0, 0);
    this.w.fx.shake(140, 0.006);
    this.t = this.telegraphMs + this.activeMs; // одразу у відновлення
  }
  protected tick(dt: number): void {
    const body = this.b.body;
    body.setVelocityX(this.dir.x * this.p.speed);
    if (this.b.flying) body.setVelocityY(this.dir.y * this.p.speed);
    this.travelled += (this.p.speed * dt) / 1000;
    if (this.t % 60 < 20) this.w.fx.afterImage(this.b, 0xff6a6a);
    if (!this.hit) {
      const out = this.w.combat.hitPlayerFrom(this.b, body.center.x - this.dir.x * 40, { x: body.x, y: body.y, w: body.width, h: body.height }, Math.round(this.p.damage * this.b.growth), true, 1.4);
      if (out) this.hit = true;
    }
    // уперся в стіну/підлогу — гальмуємо з трясінням
    const a = this.w.arena;
    const hitWall = (this.dir.x > 0 && body.blocked.right) || (this.dir.x < 0 && body.blocked.left) || body.x <= a.left + 2 || body.right >= a.right - 2;
    const hitFloor = this.b.flying && (body.blocked.down || body.bottom >= a.floorY - 1);
    if (hitWall || hitFloor || (this.b.flying && this.travelled > 420)) this.stop();
  }
}

class Shot extends Pattern {
  readonly label = 'постріл';
  private fired = 0;
  private nextAt = 0;
  constructor(b: Boss, w: BossWorld, private p: Extract<PatternDef, { kind: 'shot' }>) {
    super(b, w, p.windupMs);
    this.activeMs = (p.count - 1) * p.intervalMs + 1;
  }
  protected telegraph(): void {
    const o = this.b.handPoint();
    const p = this.w.player.body.center;
    this.markLine(o.x, o.y, p.x, p.y, 0xffaa33);
  }
  private fire(): void {
    const o = this.b.handPoint();
    const a = this.aimAngle(o.x, o.y);
    this.w.combat.spawnProjectile(this.p.fx, o.x, o.y, {
      owner: 'enemy',
      vx: Math.cos(a) * this.p.speed,
      vy: Math.sin(a) * this.p.speed,
      damage: this.p.damage,
      size: 10,
      lifetimeMs: 4000,
      blockable: true,
      impactFx: 'explosion',
      source: this.b,
    });
    this.b.playAttackAnim(250);
    sfx.play('swing');
    this.fired++;
  }
  protected act(): void {
    this.fire();
    this.nextAt = this.t + this.p.intervalMs;
  }
  protected tick(): void {
    if (this.fired < this.p.count && this.t >= this.nextAt) {
      this.b.facePlayer();
      this.fire();
      this.nextAt = this.t + this.p.intervalMs;
    }
  }
}

class Fan extends Pattern {
  readonly label = 'віяло';
  private waves = 0;
  private nextAt = 0;
  constructor(b: Boss, w: BossWorld, private p: Extract<PatternDef, { kind: 'fan' }>) {
    super(b, w, p.windupMs);
    this.activeMs = ((p.waves ?? 1) - 1) * 380 + 1;
  }
  protected telegraph(): void {
    const o = this.b.handPoint();
    const base = this.aimAngle(o.x, o.y);
    const spread = Phaser.Math.DegToRad(this.p.spreadDeg);
    for (let i = 0; i < this.p.count; i++) {
      const a = base - spread / 2 + (spread * i) / Math.max(1, this.p.count - 1);
      this.markLine(o.x, o.y, o.x + Math.cos(a) * 60, o.y + Math.sin(a) * 60, 0xffaa33);
    }
  }
  private wave(): void {
    const o = this.b.handPoint();
    const base = this.aimAngle(o.x, o.y) + (this.waves % 2 ? Phaser.Math.DegToRad(this.p.spreadDeg / this.p.count / 2) : 0);
    const spread = Phaser.Math.DegToRad(this.p.spreadDeg);
    for (let i = 0; i < this.p.count; i++) {
      const a = base - spread / 2 + (spread * i) / Math.max(1, this.p.count - 1);
      this.w.combat.spawnProjectile(this.p.fx, o.x, o.y, {
        owner: 'enemy',
        vx: Math.cos(a) * this.p.speed,
        vy: Math.sin(a) * this.p.speed,
        damage: this.p.damage,
        size: 9,
        lifetimeMs: 4000,
        blockable: true,
        impactFx: 'explosion',
        source: this.b,
      });
    }
    this.b.playAttackAnim(300);
    sfx.play('swing');
    this.waves++;
  }
  protected act(): void {
    this.wave();
    this.nextAt = this.t + 380;
  }
  protected tick(): void {
    if (this.waves < (this.p.waves ?? 1) && this.t >= this.nextAt) {
      this.wave();
      this.nextAt = this.t + 380;
    }
  }
}

class Rain extends Pattern {
  readonly label = 'дощ';
  private xs: number[] = [];
  constructor(b: Boss, w: BossWorld, private p: Extract<PatternDef, { kind: 'rain' }>) {
    super(b, w, p.windupMs);
    this.activeMs = 1;
    this.recoverMs = 700;
    // одна «крапля» — точно над гравцем, решта — рівномірно з випадковим зсувом
    const a = w.arena;
    this.xs = [w.player.x];
    const step = (a.right - a.left) / p.count;
    for (let i = 0; i < p.count - 1; i++) this.xs.push(a.left + step * (i + 0.5) + Phaser.Math.Between(-step / 3, step / 3));
  }
  protected telegraph(): void {
    const a = this.w.arena;
    for (const x of this.xs) {
      this.markRect(x - 5, a.floorY - 3, 10, 3);
      this.markLine(x, a.top + 2, x, a.top + 14);
    }
    this.b.playAttackAnim(this.telegraphMs);
  }
  protected act(): void {
    const a = this.w.arena;
    this.xs.forEach((x, i) => {
      this.w.combat.spawnProjectile(this.p.fx, x, a.top + 4 - i * 6, {
        owner: 'enemy',
        vx: 0,
        vy: 140,
        gravity: 420,
        damage: this.p.damage,
        size: 9,
        lifetimeMs: 3000,
        blockable: false,
        impactFx: 'explosion',
        source: this.b,
      });
    });
    sfx.play('boss');
  }
}

class Obstacles extends Pattern {
  readonly label = 'перешкоди';
  private xs: number[] = [];
  constructor(b: Boss, w: BossWorld, private p: Extract<PatternDef, { kind: 'obstacles' }>) {
    super(b, w, p.windupMs);
    this.activeMs = 1;
    const a = w.arena;
    // одна перешкода — під гравцем (змушує рухатись), решта — випадково, не впритул до боса
    this.xs = [Phaser.Math.Clamp(w.player.x, a.left + 20, a.right - 20)];
    for (let i = 0; i < p.count - 1; i++) {
      let x = 0;
      for (let k = 0; k < 10; k++) {
        x = Phaser.Math.Between(a.left + 24, a.right - 24);
        if (Math.abs(x - b.x) > 50 && this.xs.every((o) => Math.abs(o - x) > 36)) break;
      }
      this.xs.push(x);
    }
  }
  protected telegraph(): void {
    const zw = this.p.w ?? 24;
    for (const x of this.xs) this.markRect(x - zw / 2, this.w.arena.floorY - 6, zw, 6, 0xffaa33);
  }
  protected act(): void {
    const a = this.w.arena;
    const scene = this.b.scene;
    for (const x of this.xs) {
      const blocking = this.p.blocking;
      const s = scene.add.sprite(x, a.floorY, '__DEFAULT').setOrigin(0.5, 1).setDepth(7);
      s.setScale(this.p.scale ?? (blocking ? 1.6 : 1));
      if (scene.anims.exists(`fx:${this.p.frame}`)) s.play(`fx:${this.p.frame}`);
      else s.setTexture('ph/bone').setTint(0xffaa33); // немає анімації — заглушка
      // кадр обрізаний: опускаємо спрайт так, щоб видимий низ стояв на підлозі
      const fr = s.frame;
      s.y = a.floorY + (fr.realHeight - (fr.y + fr.cutHeight)) * s.scaleY;
      this.w.fx.playFx('smoke', x, a.floorY - 8);
      const h = this.p.h ?? (blocking ? 54 : 10);
      const zw = this.p.w ?? (blocking ? 22 : 24);
      const now = this.w.combat.now();
      let blocker: Phaser.GameObjects.Zone | undefined;
      if (blocking) blocker = this.w.addBlocker(x, a.floorY - h / 2, zw, h);
      // ерупція б'є одразу; калюжа (неблокуюча) — шкодить, поки існує
      const hz: Omit<Hazard, 'nextHitAt'> = {
        rect: () => ({ x: x - zw / 2, y: a.floorY - h, w: zw, h }),
        damage: this.p.damage,
        blockable: false,
        until: now + (blocking ? 450 : this.p.lifeMs),
        rehitMs: 700,
        fromX: () => x,
      };
      this.w.combat.addHazard(hz);
      scene.time.delayedCall(this.p.lifeMs, () => {
        blocker?.destroy();
        const death = `fx:${this.p.frame}Death`;
        if (scene.anims.exists(death)) {
          s.play(death);
          s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
        } else s.destroy();
      });
    }
    this.w.fx.shake(160, 0.005);
    sfx.play('door');
  }
}

class Summon extends Pattern {
  readonly label = 'міньйони';
  constructor(b: Boss, w: BossWorld, private p: Extract<PatternDef, { kind: 'summon' }>) {
    super(b, w, p.windupMs);
    this.activeMs = 1;
  }
  protected telegraph(): void {
    this.w.fx.playFx('sparkle', this.b.x, this.b.y - this.b.displayHeight / 2, { scale: 1.4, tint: 0xc08aff });
  }
  protected act(): void {
    const a = this.w.arena;
    for (let i = 0; i < this.p.count; i++) {
      const x = Phaser.Math.Clamp(this.b.x + (i % 2 ? 1 : -1) * (30 + i * 18), a.left + 16, a.right - 16);
      this.w.fx.playFx('smoke', x, a.floorY - 10);
      this.w.spawnMinion(this.p.enemy, x, a.floorY - 2);
    }
    sfx.play('boss');
  }
}

class Grow extends Pattern {
  readonly label = 'ріст';
  constructor(b: Boss, w: BossWorld, private p: Extract<PatternDef, { kind: 'grow' }>) {
    super(b, w, p.windupMs);
    this.activeMs = 1;
  }
  protected act(): void {
    this.b.grow(this.p.factor, this.p.max);
    this.w.fx.shake(300, 0.008);
    this.w.shout('Борг росте!');
    sfx.play('boss');
  }
}

class Slam extends Pattern {
  readonly label = 'удар об землю';
  private airborne = false;
  private landed = false;
  constructor(b: Boss, w: BossWorld, private p: Extract<PatternDef, { kind: 'slam' }>) {
    super(b, w, p.windupMs);
    this.activeMs = 1800;
    this.recoverMs = 500;
  }
  protected telegraph(): void {
    const a = this.w.arena;
    this.markRect(a.left, a.floorY - 14, a.right - a.left, 14, 0xffaa33);
  }
  protected act(): void {
    const dx = this.w.player.x - this.b.x;
    // літун не стрибає, а падає вниз
    this.b.body.setVelocity(Phaser.Math.Clamp(dx * 1.2, -200, 200), this.b.flying ? 320 : -360);
    sfx.play('roll');
  }
  protected tick(): void {
    const body = this.b.body;
    if (!body.blocked.down || this.b.flying) this.airborne = true;
    if (this.airborne && body.blocked.down && !this.landed) {
      this.landed = true;
      body.setVelocityX(0);
      this.shockwaves();
      this.t = this.telegraphMs + this.activeMs; // у відновлення
    }
  }
  /** Дві ударні хвилі по підлозі в обидва боки. Перестрибни! */
  private shockwaves(): void {
    const a = this.w.arena;
    const scene = this.b.scene;
    const now = this.w.combat.now();
    this.w.fx.shake(260, 0.01);
    this.w.fx.playFx('explosion', this.b.x, a.floorY - 10, { scale: 1.6 });
    sfx.play('hit');
    for (const dir of [-1, 1] as const) {
      const wave = { x: this.b.x };
      // хвиля = напівпрозорий «гребінь» + шлейф пилу (кадри диму) по підлозі
      const sprite = scene.add.rectangle(wave.x, a.floorY - 6, 14, 12, 0xffd08a, 0.45).setDepth(26);
      const life = ((dir > 0 ? a.right - wave.x : wave.x - a.left) / this.p.shockSpeed) * 1000;
      let lastPuff = wave.x;
      scene.tweens.add({
        targets: [wave, sprite],
        x: dir > 0 ? a.right : a.left,
        duration: life,
        onUpdate: () => {
          if (Math.abs(wave.x - lastPuff) < 12) return;
          lastPuff = wave.x;
          this.w.fx.playFx('smoke', wave.x, a.floorY - 6, { scale: 0.45, flipX: dir < 0 });
        },
        onComplete: () => sprite.destroy(),
      });
      this.w.combat.addHazard({
        rect: () => ({ x: wave.x - 7, y: a.floorY - 12, w: 14, h: 12 }),
        damage: this.p.damage,
        blockable: true,
        until: now + life,
        rehitMs: 1000,
        fromX: () => wave.x - dir * 10,
      });
    }
  }
}

class Teleport extends Pattern {
  readonly label = 'телепорт';
  private dest = 0;
  constructor(b: Boss, w: BossWorld, windupMs: number) {
    super(b, w, windupMs);
    this.activeMs = 1;
    this.recoverMs = 300;
    const a = w.arena;
    // далі від гравця: на протилежний бік арени
    const far = w.player.x < (a.left + a.right) / 2 ? a.right - 50 : a.left + 50;
    this.dest = Phaser.Math.Clamp(far + Phaser.Math.Between(-30, 30), a.left + 30, a.right - 30);
  }
  protected telegraph(): void {
    this.markRect(this.dest - 14, this.w.arena.floorY - 4, 28, 4, 0xc08aff);
    const c = this.b.body.center;
    this.w.fx.playFx('portalBurst', c.x, c.y, { scale: 0.8 });
    this.b.scene.tweens.add({ targets: this.b, alpha: 0.3, duration: this.telegraphMs });
  }
  protected act(): void {
    const c0 = this.b.body.center;
    this.w.fx.playFx('portalBurst', c0.x, c0.y, { scale: 1.2 });
    // низ хітбокса — не низ кадру: ставимо так, щоб ноги одразу були на підлозі (або на висоті польоту)
    this.b.body.reset(this.dest, this.b.spriteYFor(this.b.restBottom()));
    this.b.setAlpha(1);
    const c1 = this.b.body.center;
    this.w.fx.playFx('portalBurst', c1.x, c1.y, { scale: 1.2 });
    this.b.facePlayer();
  }
}

// ======================= фабрика і «підкручування» =======================

export function makePattern(b: Boss, w: BossWorld, def: PatternDef): Pattern {
  switch (def.kind) {
    case 'melee':
      return new Melee(b, w, def);
    case 'dash':
      return new Dash(b, w, def);
    case 'shot':
      return new Shot(b, w, def);
    case 'fan':
      return new Fan(b, w, def);
    case 'rain':
      return new Rain(b, w, def);
    case 'obstacles':
      return new Obstacles(b, w, def);
    case 'summon':
      return new Summon(b, w, def);
    case 'grow':
      return new Grow(b, w, def);
    case 'slam':
      return new Slam(b, w, def);
    case 'teleport':
      return new Teleport(b, w, def.windupMs);
  }
}

/**
 * «Підкручена» атака фінального боса: показує телеграф fake, а за reactMs до удару
 * перемикається на real — з власним коротким, але чесним телеграфом (спалах + «ПІДКРУТКА!»).
 */
export class RiggedPattern extends Pattern {
  readonly label: string;
  private switched = false;
  private switchAt: number;

  constructor(
    b: Boss,
    w: BossWorld,
    private fake: Pattern,
    private real: Pattern,
    private reactMs: number,
  ) {
    super(b, w, fake.telegraphMs);
    this.label = fake.label;
    this.switchAt = Math.max(120, fake.telegraphMs - reactMs);
  }

  override start(): void {
    this.fake.start();
  }

  protected act(): void {}

  override update(dt: number): void {
    this.t += dt;
    if (!this.switched) {
      if (this.t >= this.switchAt) {
        this.switched = true;
        this.fake.clearMarks();
        this.real.telegraphMs = this.reactMs;
        this.w.fx.flash(this.b, 0xff3aff, 120);
        this.w.fx.floatText(this.b.x, this.b.y - this.b.displayHeight - 10, `ПІДКРУТКА: ${this.real.label}!`, '#ff5aff', 8);
        sfx.play('curse');
        this.real.start();
      }
      return;
    }
    this.real.update(dt);
    this.done = this.real.done;
  }

  override abort(): void {
    this.fake.abort();
    this.real.abort();
    this.done = true;
  }
}
