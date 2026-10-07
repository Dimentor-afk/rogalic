/**
 * Дебаг-галерея: усі спрайти з маніфесту з усіма анімаціями.
 * Зручно перевіряти новий пак: чи правильні префікси кадрів, fps, хітбокс, яких анімацій бракує
 * (для них гра використає fallback-ефекти).
 * Керування: ↑/↓ або колесо — прокрутка, Esc/G — назад.
 */
import Phaser from 'phaser';
import { SPRITES } from '../config/assets';
import { animKey, bodyOffset } from '../core/assets/manifest';
import { SCENES } from './keys';

/** Анімації, наявність яких показуємо завжди (відсутні — червоним). */
const STANDARD_ANIMS = ['idle', 'walk', 'attack', 'hurt', 'death'];
const ROW_H = 96;
const CELL_W = 84;
const LABEL_W = 110;

export class AssetGalleryScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super(SCENES.gallery);
  }

  create(): void {
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#d8c3a5' };
    const keys = Object.keys(SPRITES);
    const g = this.add.graphics();

    keys.forEach((spriteKey, row) => {
      const def = SPRITES[spriteKey]!;
      const y = 20 + row * ROW_H;
      this.add.text(4, y + 4, spriteKey, style);
      const animNames = [...new Set([...STANDARD_ANIMS, ...Object.keys(def.anims)])];
      const missing = animNames.filter((a) => !this.anims.exists(animKey(spriteKey, a)));
      this.add.text(4, y + 16, missing.length ? `немає: ${missing.join(', ')}\n→ fallback кодом` : 'усі анімації є', {
        ...style,
        color: missing.length ? '#e07a6a' : '#9fe0a0',
      });

      animNames
        .filter((a) => this.anims.exists(animKey(spriteKey, a)))
        .forEach((anim, col) => {
          const cx = LABEL_W + col * CELL_W + CELL_W / 2;
          const base = y + ROW_H - 14;
          const s = this.add.sprite(cx, base, def.atlas).setOrigin(0.5, 1);
          s.play(animKey(spriteKey, anim));
          this.add.text(cx, base + 2, anim, style).setOrigin(0.5, 0);
          // рамка хітбокса з маніфесту — щоб одразу бачити, чи він збігається з персонажем
          const off = bodyOffset(def.body, s.width, s.height);
          g.lineStyle(1, 0x55ff88, 0.8).strokeRect(cx - s.width / 2 + off.x, base - s.height + off.y, def.body.w, def.body.h);
          g.lineStyle(1, 0x444455, 1).lineBetween(cx - 30, base, cx + 30, base);
        });
    });

    this.add
      .text(4, 4, 'ГАЛЕРЕЯ АСЕТІВ   ↑/↓ — прокрутка   Esc/G — назад', { ...style, color: '#ffd27a' })
      .setScrollFactor(0);

    const cam = this.cameras.main;
    const contentH = 20 + keys.length * ROW_H;
    cam.setBounds(0, 0, this.scale.width, Math.max(contentH, this.scale.height));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => (cam.scrollY += dy * 0.5));

    const kb = this.input.keyboard!;
    const back = () => this.scene.start(SCENES.menu);
    kb.on('keydown-ESC', back);
    kb.on('keydown-G', back);
    this.cursors = kb.createCursorKeys();
  }

  update(): void {
    const cam = this.cameras.main;
    if (this.cursors.down.isDown) cam.scrollY += 6;
    if (this.cursors.up.isDown) cam.scrollY -= 6;
  }
}
