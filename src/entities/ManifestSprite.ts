/**
 * Спрайт, що налаштовується з asset manifest: текстура, хітбокс, анімації.
 * Базовий клас для гравця, ворогів і босів.
 */
import Phaser from 'phaser';
import { SPRITES } from '../config/assets';
import { animKey, bodyOffset, type AnimName, type BodyDef, type SpriteDef } from '../core/assets/manifest';

export class ManifestSprite extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  protected spriteKey: string;
  protected spriteDef: SpriteDef;
  /** Остання анімація, яку просили програти (навіть якщо її немає і спрацював fallback). */
  protected currentAnim: AnimName | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, spriteKey: string) {
    const def = ManifestSprite.lookup(spriteKey);
    super(scene, x, y, def.atlas);
    this.spriteKey = spriteKey;
    this.spriteDef = def;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Початок координат — низ по центру: x,y спрайта = точка між ногами.
    this.setOrigin(0.5, 1);
    this.showFirstFrame();
    this.applyBody();
  }

  private static lookup(spriteKey: string): SpriteDef {
    const def = SPRITES[spriteKey];
    if (!def) throw new Error(`Спрайт "${spriteKey}" відсутній у маніфесті (src/config/assets.ts)`);
    return def;
  }

  get key(): string {
    return this.spriteKey;
  }

  /** Повернути обличчям у бік dir (враховує спрайти, намальовані обличчям вліво). */
  setFacing(dir: 1 | -1): this {
    return this.setFlipX(this.spriteDef.facesLeft ? dir > 0 : dir < 0);
  }

  /** Дзеркалимо і зсув хітбокса (для персонажів, намальованих не по центру кадру). */
  override setFlipX(value: boolean): this {
    if (value === this.flipX) return this;
    super.setFlipX(value);
    if (this.body) this.applyBody();
    return this;
  }

  hasAnim(anim: AnimName): boolean {
    return this.scene.anims.exists(animKey(this.spriteKey, anim));
  }

  /**
   * Програє анімацію з маніфесту. Повертає false, якщо такої анімації немає —
   * тоді викликач робить fallback (тримає інший кадр, блимає, тощо).
   */
  playAnim(anim: AnimName, ignoreIfPlaying = true): boolean {
    this.currentAnim = anim;
    const key = animKey(this.spriteKey, anim);
    if (!this.scene.anims.exists(key)) return false;
    this.play(key, ignoreIfPlaying);
    return true;
  }

  /** Зупиняє анімацію і показує конкретний кадр іншої анімації (найпростіший fallback). */
  holdFrame(anim: AnimName, index: number): boolean {
    const a = this.scene.anims.get(animKey(this.spriteKey, anim));
    const frame = a?.frames[Math.min(index, a.frames.length - 1)];
    if (!frame) return false;
    this.stop();
    this.setFrame(frame.frame.name);
    return true;
  }

  /**
   * Змінює набір спрайтів (напр. інша броня/зброя), зберігаючи поточну анімацію і її прогрес.
   */
  setSpriteKey(spriteKey: string): void {
    if (spriteKey === this.spriteKey) return;
    const progress = this.anims.isPlaying ? this.anims.getProgress() : 0;
    this.spriteDef = ManifestSprite.lookup(spriteKey);
    this.spriteKey = spriteKey;
    this.applyBody();
    if (this.currentAnim && this.playAnim(this.currentAnim, false)) {
      this.anims.setProgress(progress);
    } else {
      this.showFirstFrame();
    }
  }

  private showFirstFrame(): void {
    const firstAnim = Object.keys(this.spriteDef.anims)[0];
    const a = firstAnim ? this.scene.anims.get(animKey(this.spriteKey, firstAnim)) : undefined;
    const frame = a?.frames[0]?.frame.name;
    // жодної анімації не знайдено — показуємо вбудовану текстуру-заглушку Phaser, а не весь атлас
    if (frame) this.setTexture(this.spriteDef.atlas, frame);
    else this.setTexture('__MISSING');
  }

  /** Хітбокс, який має бути зараз. За замовчуванням — з маніфесту; нащадок може підмінити (присід гравця). */
  protected currentBody(): BodyDef {
    return this.spriteDef.body;
  }

  /** Ставить хітбокс з currentBody(). */
  protected applyBody(): void {
    const b = this.currentBody();
    const body = this.body;
    const off = bodyOffset(b, this.width, this.height, this.flipX);
    // Тіло вже могло зрушити на цьому кроці фізики, а спрайт наздожене його лише після кадру —
    // тому не перечитуємо позицію зі спрайта, а зсуваємо тіло на різницю офсетів (разом з prev, щоб спрайт не смикнувся).
    const dx = (off.x - body.offset.x) * this.scaleX;
    const dy = (off.y - body.offset.y) * this.scaleY;
    for (const v of [body.position, body.prev, body.prevFrame]) v.set(v.x + dx, v.y + dy);
    body.setSize(b.w, b.h, false);
    body.setOffset(off.x, off.y);
  }
}
