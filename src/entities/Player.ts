/**
 * Гравець: біг, стрибок зі змінною висотою, «час койота», буфер стрибка,
 * зістрибування з дерев'яних платформ (вниз + стрибок).
 * Бій (атака, перекат, блок, фляги) — у Milestone 2.
 */
import Phaser from 'phaser';
import { GAME } from '../config/game';
import { PLAYER_MOVE as M } from '../config/player';
import { playerSpriteKey, type PlayerWeaponSprite } from '../config/assets';
import type { InputMap } from '../core/input/InputMap';
import { ManifestSprite } from './ManifestSprite';

export type PlayerWeapon = PlayerWeaponSprite | 'special';

/** Наближає value до target не більше ніж на delta (плавне прискорення/гальмування). */
function approach(value: number, target: number, delta: number): number {
  return value < target ? Math.min(value + delta, target) : Math.max(value - delta, target);
}

export class Player extends ManifestSprite {
  weapon: PlayerWeapon = 'sword';
  armor = 0;

  private coyoteMs = 0;
  private jumpBufferMs = 0;
  /** true від моменту стрибка до приземлення — тільки тоді працює «зріз» стрибка. */
  private jumping = false;
  /** Час (scene.time.now) останнього дотику до дошки — його ставить сцена в колбеку колізії. */
  oneWayContactAt = -Infinity;
  /** До цього часу колізія з дошками вимкнена (гравець провалюється крізь них). */
  private dropUntil = -Infinity;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private controls: InputMap,
  ) {
    super(scene, x, y, playerSpriteKey('sword', 0));
    // Обмеження швидкості: по X з запасом, по Y — максимальна швидкість падіння.
    this.body.setMaxVelocity(1000, M.maxFallSpeed);
    this.playAnim('idle');
  }

  /** Зброя і броня визначають набір спрайтів (броня видна на персонажі). */
  setLoadout(weapon: PlayerWeapon, armor: number): void {
    this.weapon = weapon;
    this.armor = armor;
    this.setSpriteKey(weapon === 'special' ? 'player.special' : playerSpriteKey(weapon, armor));
  }

  /** Чи зараз гравець зістрибує з дошки (сцена тоді ігнорує колізію з дошками). */
  isDroppingThrough(): boolean {
    return this.scene.time.now < this.dropUntil;
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    const body = this.body;
    const onGround = body.blocked.down;

    // --- таймери койота і буфера ---
    if (onGround) {
      this.coyoteMs = M.coyoteMs;
      if (body.velocity.y >= 0) this.jumping = false;
    } else {
      this.coyoteMs -= dtMs;
    }
    this.jumpBufferMs = this.controls.justPressed('jump') ? M.jumpBufferMs : this.jumpBufferMs - dtMs;

    // --- горизонтальний рух з прискоренням ---
    const dir = this.controls.axisX();
    const accel = dir !== 0 ? (onGround ? M.accelGround : M.accelAir) : onGround ? M.decelGround : M.decelAir;
    body.setVelocityX(approach(body.velocity.x, dir * M.runSpeed, accel * dt));
    if (dir !== 0) this.setFlipX(dir < 0);

    // --- зістрибування: стоїш на дошці, тримаєш «вниз» і тиснеш стрибок ---
    const now = this.scene.time.now;
    const onPlank = onGround && now - this.oneWayContactAt < 80;
    if (onPlank && this.controls.isDown('down') && this.jumpBufferMs > 0) {
      this.dropUntil = now + M.dropThroughMs;
      this.jumpBufferMs = 0;
      this.coyoteMs = 0;
      body.setVelocityY(M.dropThroughPush);
    }

    // --- стрибок ---
    if (this.jumpBufferMs > 0 && this.coyoteMs > 0) {
      body.setVelocityY(-M.jumpVelocity);
      this.jumpBufferMs = 0;
      this.coyoteMs = 0;
      this.jumping = true;
    }
    // відпустив кнопку на підйомі — обрізаємо швидкість: короткий тап = низький стрибок
    if (this.jumping && this.controls.justReleased('jump') && body.velocity.y < 0) {
      body.setVelocityY(body.velocity.y * M.jumpCutMultiplier);
    }

    // --- форма гравітації: м'якша вершина, швидше падіння ---
    let gravityMult = 1;
    if (!onGround) {
      if (Math.abs(body.velocity.y) < M.apexThreshold && this.controls.isDown('jump')) gravityMult = M.apexGravityMultiplier;
      else if (body.velocity.y > 0) gravityMult = M.fallGravityMultiplier;
    }
    // Arcade додає gravity тіла до гравітації світу, тому задаємо різницю.
    body.setGravityY(GAME.gravity * (gravityMult - 1));

    this.updateAnimation(onGround);
  }

  private updateAnimation(onGround: boolean): void {
    if (onGround) {
      this.playAnim(Math.abs(this.body.velocity.x) > 10 ? 'walk' : 'idle');
      return;
    }
    // У паку немає анімацій стрибка/падіння → fallback: тримаємо «кроковий» кадр ходьби.
    const anim = this.body.velocity.y < 0 ? 'jump' : 'fall';
    if (!this.playAnim(anim)) this.holdFrame('walk', 0);
  }
}
