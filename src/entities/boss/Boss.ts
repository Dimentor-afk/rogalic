/**
 * БОС: спрайт з маніфесту + конфіг (HP, фази, патерни). Логіка не знає конкретних босів.
 *
 * Цикл: між атаками ходить на бажану відстань від гравця і чекає паузу фази → обирає патерн
 * за вагами поточної фази → телеграф → дія → відновлення → знову пауза.
 * Фаза визначається часткою HP (пороги в конфігу). Паріру ближнього удару/ривку оглушує боса;
 * наступний удар по оглушеному — критичний. Фінальний бос може «підкрутити» атаку (див. RiggedPattern).
 */
import Phaser from 'phaser';
import { BLOCK, HIT_FEEL } from '../../config/combat';
import { BOSS_PARRY_STUN_MS, type BossDef, type BossPhase } from '../../config/bosses';
import type { CombatSystem, Hittable } from '../../core/combat/CombatSystem';
import type { Rect } from '../../core/combat/geometry';
import type { Fx } from '../../core/fx/Fx';
import { sfx } from '../../core/audio/Sfx';
import { weightedPick } from '../../core/rng';
import type { PlayerHit } from '../enemies/Enemy';
import { ManifestSprite } from '../ManifestSprite';
import type { Player } from '../Player';
import { makePattern, RiggedPattern, type Pattern } from './patterns';

export interface BossWorld {
  readonly player: Player;
  readonly fx: Fx;
  readonly combat: CombatSystem;
  /** Межі арени у px: ліва/права стіна, підлога (верх рядка підлоги), стеля. */
  readonly arena: { left: number; right: number; floorY: number; top: number };
  shout(text: string): void;
  spawnMinion(id: string, x: number, y: number): void;
  /** Тимчасова тверда перешкода (стовп). */
  addBlocker(x: number, y: number, w: number, h: number): Phaser.GameObjects.Zone;
  onBossDefeated(boss: Boss): void;
}

type BossState = 'intro' | 'idle' | 'attack' | 'stunned' | 'dead';

export class Boss extends ManifestSprite implements Hittable {
  readonly def: BossDef;
  hp: number;
  readonly maxHp: number;
  facing: 1 | -1 = -1;
  lastSwingHit = -1;
  /** Множник розміру/сили (патерн «ріст»). */
  growth = 1;
  private mode: BossState = 'intro';
  private phaseIndex = 0;
  private pattern: Pattern | null = null;
  private pauseMs = 1200;
  private stunMs = 0;
  private critReady = false;
  private readonly baseScale: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    def: BossDef,
    private world: BossWorld,
  ) {
    super(scene, x, y, def.sprite);
    this.def = def;
    this.hp = this.maxHp = def.hp;
    this.baseScale = def.scale ?? 1;
    this.setScale(this.baseScale);
    if (def.tint) this.setTint(def.tint);
    this.setDepth(9);
    if (def.flying) this.body.setAllowGravity(false);
    this.face(-1);
    this.playLoop();
  }

  get flying(): boolean {
    return !!this.def.flying;
  }

  /** Де має бути низ хітбокса у спокої: на підлозі або на висоті польоту. */
  restBottom(): number {
    return this.world.arena.floorY - (this.def.flying?.hover ?? 0);
  }

  /** y спрайта, за якого низ хітбокса = bottom: хітбокс на bottomPad px вище низу кадру (з урахуванням масштабу). */
  spriteYFor(bottom: number): number {
    return bottom + (this.spriteDef.body.bottomPad ?? 0) * this.scaleY;
  }

  get alive(): boolean {
    return this.mode !== 'dead';
  }

  get phase(): BossPhase {
    return this.def.phases[this.phaseIndex]!;
  }

  get hpFraction(): number {
    return Math.max(0, this.hp / this.maxHp);
  }

  hitRect(): Rect {
    const b = this.body;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  /** Точка, звідки летять снаряди (рука/посох). */
  handPoint(): { x: number; y: number } {
    const b = this.body;
    return { x: b.center.x + this.facing * b.width * 0.45, y: b.y + b.height * 0.35 };
  }

  face(dir: 1 | -1): void {
    this.facing = dir;
    this.setFacing(dir);
  }

  facePlayer(): void {
    this.face(this.world.player.body.center.x >= this.body.center.x ? 1 : -1);
  }

  /** Початок бою (після кат-сцени). */
  begin(): void {
    this.mode = 'idle';
    this.pauseMs = 900;
  }

  /** Стоїть — idle (якщо є), рухається — walk. */
  private playLoop(moving = true): void {
    if (moving || !this.hasAnim('idle')) {
      if (!this.playAnim('walk')) this.playAnim('idle');
    } else this.playAnim('idle');
  }

  /** Анімація атаки, якщо є; інакше — короткий «ривок» масштабом (fallback). */
  playAttackAnim(ms: number): void {
    if (this.hasAnim('attack')) {
      this.play({ key: `${this.key}:attack`, duration: ms, repeat: 0 });
      this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.alive && this.playLoop());
    } else {
      this.scene.tweens.add({ targets: this, scaleX: this.scaleX * 1.08, yoyo: true, duration: Math.min(140, ms / 2) });
    }
  }

  grow(factor: number, max: number): void {
    const next = Math.min(max / this.baseScale, this.growth * factor);
    if (next <= this.growth) return;
    this.growth = next;
    this.scene.tweens.add({ targets: this, scale: this.baseScale * this.growth, duration: 500, ease: 'Back.easeOut' });
  }

  update(dt: number): void {
    if (!this.active || this.mode === 'dead' || this.mode === 'intro') return;
    // фаза за часткою HP
    const next = this.def.phases.findIndex((p) => this.hpFraction > p.hpAbove);
    const idx = next < 0 ? this.def.phases.length - 1 : next;
    if (idx > this.phaseIndex) {
      this.phaseIndex = idx;
      if (this.phase.shout) this.world.shout(this.phase.shout);
      this.world.fx.shake(300, 0.008);
      sfx.play('boss');
    }

    if (this.mode === 'stunned') {
      this.stunMs -= dt;
      this.setTint(Math.floor(this.stunMs / 90) % 2 ? 0x9fd0ff : this.def.tint ?? 0xffffff);
      this.body.setVelocityX(this.body.velocity.x * 0.9);
      if (this.flying) this.body.setVelocityY(this.body.velocity.y * 0.9);
      if (this.stunMs <= 0) {
        this.mode = 'idle';
        this.critReady = false;
        if (this.def.tint) this.setTint(this.def.tint);
        else this.clearTint();
        this.pauseMs = 300;
      }
      return;
    }

    if (this.mode === 'attack' && this.pattern) {
      const pattern = this.pattern;
      pattern.update(dt);
      // під час кадру атаку могли перервати: паріру гравця оглушує боса (stun обнуляє pattern) або бос загинув
      if (this.pattern !== pattern) return;
      if (pattern.done) {
        this.pattern = null;
        this.mode = 'idle';
        const [a, b] = this.phase.pauseMs;
        this.pauseMs = Phaser.Math.Between(a, b);
        this.body.setVelocityX(0);
        if (this.flying) this.body.setVelocityY(0);
      }
      return;
    }

    // idle: підійти/відійти на бажану відстань і дочекатись паузи
    const p = this.world.player;
    const dx = p.body.center.x - this.body.center.x;
    const dist = Math.abs(dx);
    const want = this.def.preferredDistance;
    const speed = this.def.speed * (this.phase.speedMult ?? 1);
    this.facePlayer();
    if (dist > want + 24) this.body.setVelocityX(Math.sign(dx) * speed);
    else if (dist < want - 30 && want > 90) this.body.setVelocityX(-Math.sign(dx) * speed * 0.8);
    else this.body.setVelocityX(0);
    if (this.flying) {
      // літун повертається на свою висоту і трохи «гойдається» в повітрі
      const target = this.restBottom() + Math.sin(this.scene.time.now / 380) * 6;
      this.body.setVelocityY(Phaser.Math.Clamp((target - this.body.bottom) * 4, -160, 160));
    }
    this.playLoop(Math.abs(this.body.velocity.x) > 5);
    this.pauseMs -= dt;
    if (this.pauseMs <= 0 && p.alive) this.startPattern();
  }

  private pickDef() {
    const list = this.phase.patterns;
    return weightedPick(
      list,
      list.map((x) => x.weight),
      Math.random(),
    );
  }

  private startPattern(): void {
    const realDef = this.pickDef();
    let pattern: Pattern = makePattern(this, this.world, realDef);
    // фінальний бос: інколи телеграфує одне, а б'є іншим
    const rig = this.def.rigged;
    if (rig && Math.random() < rig.chance) {
      let fakeDef = this.pickDef();
      for (let i = 0; i < 4 && fakeDef.kind === realDef.kind; i++) fakeDef = this.pickDef();
      if (fakeDef.kind !== realDef.kind) pattern = new RiggedPattern(this, this.world, makePattern(this, this.world, fakeDef), pattern, rig.reactMs);
    }
    this.pattern = pattern;
    this.mode = 'attack';
    this.body.setVelocity(0, this.flying ? 0 : this.body.velocity.y);
    pattern.start();
  }

  /** Паріру: бос оглушений, наступний удар — критичний. */
  stun(_ms: number): void {
    if (!this.alive) return;
    this.pattern?.abort();
    this.pattern = null;
    this.mode = 'stunned';
    this.stunMs = BOSS_PARRY_STUN_MS;
    this.critReady = true;
    this.body.setVelocityX(-this.facing * 60);
    this.world.fx.floatText(this.x, this.y - this.displayHeight - 4, 'ОГЛУШЕНО', '#9fd0ff');
  }

  takeHit(hit: PlayerHit): boolean {
    if (!this.alive || this.mode === 'intro') return false;
    const crit = this.critReady;
    const dmg = Math.round(hit.damage * (crit ? BLOCK.critMultiplier : 1));
    this.hp -= dmg;
    if (crit) this.critReady = false;
    const fx = this.world.fx;
    fx.flash(this, 0xff5555, HIT_FEEL.flashMs);
    if (this.def.tint) this.scene.time.delayedCall(HIT_FEEL.flashMs + 5, () => this.alive && this.mode !== 'stunned' && this.setTint(this.def.tint!));
    fx.playFx(crit ? 'impactCrit' : 'impact', hit.x, hit.y, { scale: crit ? 1.1 : 0.8, flipX: hit.dir < 0 });
    fx.burst(hit.x, hit.y, 0xffe08a, crit ? 14 : 5, 110, 320);
    fx.floatText(hit.x, hit.y - 10, crit ? `КРИТ ${dmg}` : `${dmg}`, crit ? '#ffd25a' : '#ffffff');
    fx.hitstop(crit ? HIT_FEEL.critHitstopMs : hit.heavy ? HIT_FEEL.heavyHitstopMs : HIT_FEEL.hitstopMs * 0.7);
    fx.shake(HIT_FEEL.shakeMs, crit || hit.heavy ? HIT_FEEL.heavyShakeIntensity : HIT_FEEL.shakeIntensity);
    sfx.play('hit');
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private die(): void {
    this.mode = 'dead';
    this.pattern?.abort();
    this.pattern = null;
    this.body.setVelocity(0, 0);
    // літун падає на землю
    if (this.flying) this.body.setAllowGravity(true);
    this.world.fx.hitstop(260);
    this.world.fx.shake(600, 0.012);
    sfx.play('death');
    const finish = () => this.world.onBossDefeated(this);
    if (this.playAnim('death', false)) {
      this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.scene.tweens.add({ targets: this, alpha: 0, duration: 700, delay: 400, onComplete: finish });
      });
    } else {
      this.world.fx.disintegrate(this, 300);
      this.setVisible(false);
      this.scene.time.delayedCall(900, finish);
    }
  }
}
