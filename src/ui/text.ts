/**
 * Текст піксельним шрифтом Tiny5 (OFL, з кирилицею). Розміри кратні 8 — тоді гліфи лягають на піксельну сітку.
 * Шрифт підключається в main.ts і чекаємо його завантаження до старту гри.
 */
import Phaser from 'phaser';

export const FONT_FAMILY = 'Tiny5';

export const COLORS = {
  text: '#e8d6b0',
  dim: '#9c8a74',
  gold: '#ffd25a',
  red: '#ff6b5a',
  green: '#8de08a',
  blue: '#9fd0ff',
  white: '#ffffff',
} as const;

export function txt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 8,
  color: string = COLORS.text,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(Math.round(x), Math.round(y), text, {
    fontFamily: `${FONT_FAMILY}, monospace`,
    fontSize: `${size}px`,
    color,
    ...extra,
  });
}

/** Чекаємо, поки браузер завантажить шрифт (і латиницю, і кирилицю). */
export function loadFonts(timeoutMs = 3000): Promise<unknown> {
  if (!('fonts' in document)) return Promise.resolve();
  const load = Promise.all([document.fonts.load(`8px ${FONT_FAMILY}`, 'abc 123'), document.fonts.load(`8px ${FONT_FAMILY}`, 'Фішки ґїєі')]).catch(() => undefined);
  // повільна мережа не повинна блокувати старт: максимум timeoutMs, далі — запасний шрифт, поки догрузиться
  return Promise.race([load, new Promise((r) => setTimeout(r, timeoutMs))]);
}

/**
 * Іконка з атласу, розміщена за видимою частиною кадру.
 * Кадри атласу обрізані (trim), а Phaser малює їх на місці в «повному» кадрі — для UI компенсуємо зсув.
 */
export function icon(scene: Phaser.Scene, x: number, y: number, atlas: string, frame: string): Phaser.GameObjects.Image {
  const img = scene.add.image(0, 0, atlas, frame).setOrigin(0, 0);
  return img.setPosition(Math.round(x - img.frame.x), Math.round(y - img.frame.y));
}
