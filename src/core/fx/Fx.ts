/**
 * Ефекти кодом — «відчуття удару» і fallback-и для спрайтів без потрібних анімацій:
 *  - hitstop: коротка заморозка кадру при влучанні;
 *  - flash / blink: червоне блимання при ударі, біле — при телеграфі атаки;
 *  - afterImage: сліди-копії під час перекату;
 *  - disintegrate: розпад спрайта на пікселі (смерть без анімації);
 *  - burst / spark: частинки; playFx: одноразова анімація з атласу ефектів;
 *  - floatText: спливаючі числа (шкода, фішки).
 * Один екземпляр на сцену; update(dt) викликати щокадру.
 */
import Phaser from 'phaser';

const PIXEL = '__fx_px';

interface Particle {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
}

export class Fx {
  private particles: Particle[] = [];
  private hitstopUntil = 0;
  private hitstopTimer?: Phaser.Time.TimerEvent;
  /** Піксельні дані атласів для розпаду на частинки (кеш: читаємо картинку лише раз). */
  private static pixelCache = new Map<string, ImageData>();

  constructor(private scene: Phaser.Scene) {
    if (!scene.textures.exists(PIXEL)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
      g.generateTexture(PIXEL, 2, 2);
      g.destroy();
    }
  }

  // ---------- hitstop ----------

  get frozen(): boolean {
    return this.scene.time.now < this.hitstopUntil;
  }

  /**
   * Заморожує фізику, анімації і твіни на ms. Повторний виклик під час заморозки лише подовжує її.
   * Таймер сцени не зупиняється, тому розморожування спрацює гарантовано.
   */
  hitstop(ms: number): void {
    if (ms <= 0) return;
    const until = this.scene.time.now + ms;
    if (until <= this.hitstopUntil) return;
    const wasFrozen = this.frozen;
    this.hitstopUntil = until;
    if (!wasFrozen) {
      this.scene.physics.world.pause();
      this.scene.anims.pauseAll();
      this.scene.tweens.pauseAll();
    }
    this.hitstopTimer?.remove();
    this.hitstopTimer = this.scene.time.delayedCall(this.hitstopUntil - this.scene.time.now, () => {
      this.scene.physics.world.resume();
      this.scene.anims.resumeAll();
      this.scene.tweens.resumeAll();
    });
  }

  shake(ms: number, intensity: number): void {
    this.scene.cameras.main.shake(ms, intensity);
  }

  // ---------- кольорові спалахи ----------

  /** Суцільна заливка кольором на ms (червоне блимання при ударі). */
  flash(sprite: Phaser.GameObjects.Sprite, color: number, ms: number): void {
    sprite.setTintFill(color);
    this.scene.time.delayedCall(ms, () => {
      if (sprite.active) sprite.clearTint();
    });
  }

  /**
   * Біле блимання з тремтінням — телеграф атаки для ворогів без анімації атаки.
   * Повертає функцію, що достроково зупиняє ефект.
   */
  telegraph(sprite: Phaser.GameObjects.Sprite, ms: number, shakePx = 1.5): () => void {
    let on = false;
    // тремтіння: коливаємо x на ±shakePx навколо поточної позиції і завжди повертаємо назад (без дрейфу)
    let offset = 0;
    const timer = this.scene.time.addEvent({
      delay: 60,
      loop: true,
      callback: () => {
        if (!sprite.active) return;
        on = !on;
        if (on) sprite.setTintFill(0xffffff);
        else sprite.clearTint();
        const next = (on ? 1 : -1) * shakePx;
        sprite.x += next - offset;
        offset = next;
      },
    });
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      timer.remove();
      if (!sprite.active) return;
      sprite.clearTint();
      sprite.x -= offset;
      offset = 0;
    };
    this.scene.time.delayedCall(ms, stop);
    return stop;
  }

  /** Копія поточного кадру спрайта, що тане — слід перекату. */
  afterImage(sprite: Phaser.GameObjects.Sprite, tint = 0x6fd3ff): void {
    const img = this.scene.add
      .image(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name)
      .setOrigin(sprite.originX, sprite.originY)
      .setFlipX(sprite.flipX)
      .setScale(sprite.scaleX, sprite.scaleY)
      .setDepth(sprite.depth - 1)
      .setAlpha(0.55)
      .setTintFill(tint);
    this.scene.tweens.add({ targets: img, alpha: 0, duration: 220, onComplete: () => img.destroy() });
  }

  // ---------- частинки ----------

  /** Розліт дрібних квадратиків. */
  burst(x: number, y: number, color: number, count: number, speed = 90, life = 450, gravity = 300): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.spawn(x, y, color, Math.cos(a) * v, Math.sin(a) * v - speed * 0.4, gravity, life * (0.6 + Math.random() * 0.4));
    }
  }

  /**
   * Розпад на частинки: беремо реальні пікселі поточного кадру спрайта і розкидаємо їх.
   * Використовується для смерті без анімації.
   */
  disintegrate(sprite: Phaser.GameObjects.Sprite, maxParticles = 160): void {
    const data = this.pixelsOf(sprite.texture);
    const frame = sprite.frame;
    if (!data) {
      this.burst(sprite.x, sprite.y - sprite.displayHeight / 2, 0xffffff, 30);
      return;
    }
    const left = sprite.x - sprite.displayOriginX * sprite.scaleX;
    const top = sprite.y - sprite.displayOriginY * sprite.scaleY;
    const pts: { x: number; y: number; c: number }[] = [];
    for (let v = 0; v < frame.cutHeight; v += 2) {
      for (let u = 0; u < frame.cutWidth; u += 2) {
        const i = ((frame.cutY + v) * data.width + frame.cutX + u) * 4;
        if (data.data[i + 3]! < 128) continue;
        const fx = sprite.flipX ? frame.realWidth - frame.x - u - 1 : frame.x + u;
        pts.push({
          x: left + fx * sprite.scaleX,
          y: top + (frame.y + v) * sprite.scaleY,
          c: (data.data[i]! << 16) | (data.data[i + 1]! << 8) | data.data[i + 2]!,
        });
      }
    }
    Phaser.Utils.Array.Shuffle(pts);
    const cx = sprite.x;
    const cy = sprite.y - sprite.displayHeight / 2;
    for (const p of pts.slice(0, maxParticles)) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const v = 40 + Math.random() * 90;
      this.spawn(p.x, p.y, p.c, (dx / len) * v, (dy / len) * v - 60, 220, 500 + Math.random() * 500);
    }
  }

  private spawn(x: number, y: number, color: number, vx: number, vy: number, gravity: number, life: number): void {
    const img = this.scene.add.image(x, y, PIXEL).setTint(color).setDepth(50);
    this.particles.push({ img, vx, vy, gravity, life, maxLife: life });
  }

  private pixelsOf(texture: Phaser.Textures.Texture): ImageData | undefined {
    const key = texture.key;
    const cached = Fx.pixelCache.get(key);
    if (cached) return cached;
    const src = texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    if (!src || !('width' in src)) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(src, 0, 0);
    const data = ctx.getImageData(0, 0, src.width, src.height);
    Fx.pixelCache.set(key, data);
    return data;
  }

  // ---------- анімації-ефекти і текст ----------

  /** Програє одноразову анімацію "fx:<name>" і прибирає її. */
  playFx(name: string, x: number, y: number, opts: { flipX?: boolean; scale?: number; depth?: number; tint?: number } = {}): Phaser.GameObjects.Sprite | undefined {
    const key = `fx:${name}`;
    if (!this.scene.anims.exists(key)) return undefined;
    const s = this.scene.add.sprite(x, y, '__DEFAULT').setDepth(opts.depth ?? 40).setFlipX(opts.flipX ?? false).setScale(opts.scale ?? 1);
    if (opts.tint !== undefined) s.setTint(opts.tint);
    s.play(key);
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
    return s;
  }

  /** Спливаюче число/напис над точкою. */
  floatText(x: number, y: number, text: string, color = '#ffffff', size = 8): void {
    const t = this.scene.add
      .text(Math.round(x), Math.round(y), text, { fontFamily: 'Tiny5, monospace', fontSize: `${size}px`, color, stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5, 1)
      .setDepth(60);
    this.scene.tweens.add({ targets: t, y: y - 18, alpha: 0, duration: 750, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  update(dtMs: number): void {
    if (this.frozen) return;
    const dt = dtMs / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dtMs;
      if (p.life <= 0) {
        p.img.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.img.setAlpha(Math.min(1, (p.life / p.maxLife) * 1.5));
    }
  }
}
