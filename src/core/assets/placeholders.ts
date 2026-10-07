/**
 * ЗАГЛУШКИ КОДОМ для асетів, яких немає в паках (скриня, мішок, кабіна ліфта, світло; згодом — слот).
 * Кожна заглушка — текстура з тим самим ключем і розміром, що й майбутній спрайт. Якщо справжній
 * PNG з таким ключем завантажено (див. assets/index.json), заглушка не створюється — підміна файлом.
 */
import Phaser from 'phaser';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export function ensureTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h);
  tex.refresh();
}

/** Піксельний прямокутник (усі заглушки малюємо прямокутниками — без згладжування). */
export function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Створює всі заглушки, потрібні підземеллю/хабу. Викликається в Preload. */
export function createDungeonPlaceholders(scene: Phaser.Scene): void {
  // скриня: закрита і відкрита (24×18)
  const chest = (open: boolean): Draw => (c) => {
    px(c, '#2a1810', 1, 5, 22, 13);
    px(c, '#6b3f22', 2, 6, 20, 11);
    px(c, '#8a5530', 2, 6, 20, 3);
    px(c, '#d4a35a', 2, 10, 20, 2); // золота смуга
    px(c, '#d4a35a', 10, 9, 4, 5); // замок
    px(c, '#2a1810', 11, 11, 2, 2);
    if (open) {
      px(c, '#2a1810', 1, 0, 22, 6);
      px(c, '#4a2a16', 2, 1, 20, 4);
      px(c, '#ffd25a', 4, 5, 16, 2); // блиск фішок
      px(c, '#fff3b0', 7, 4, 3, 1);
    } else {
      px(c, '#2a1810', 1, 2, 22, 4);
      px(c, '#7a4a28', 2, 3, 20, 3);
    }
  };
  ensureTexture(scene, 'ph/chest_closed', 24, 18, chest(false));
  ensureTexture(scene, 'ph/chest_open', 24, 18, chest(true));

  // мішок смерті (16×16)
  ensureTexture(scene, 'ph/bag', 16, 16, (c) => {
    px(c, '#1a1008', 3, 5, 10, 11);
    px(c, '#7a5a30', 4, 6, 8, 9);
    px(c, '#9a7440', 4, 6, 3, 6);
    px(c, '#1a1008', 5, 2, 6, 4);
    px(c, '#b08850', 6, 3, 4, 2);
    px(c, '#ffd25a', 6, 9, 4, 3); // знак фішки
    px(c, '#a07020', 7, 10, 2, 1);
  });

  // кабіна ліфта (40×44): клітка на тросі
  ensureTexture(scene, 'ph/elevator', 40, 44, (c) => {
    px(c, '#3a3a44', 19, 0, 2, 8); // трос
    px(c, '#2a2a30', 2, 8, 36, 3);
    px(c, '#2a2a30', 2, 40, 36, 4);
    for (let x = 3; x <= 35; x += 8) px(c, '#5a5a66', x, 11, 2, 29); // ґрати
    px(c, '#8a8a99', 2, 8, 36, 1);
    px(c, '#d4a35a', 14, 24, 12, 6); // табличка
    px(c, '#2a1810', 16, 26, 8, 2);
  });

  // ігровий автомат у хабі (32×44): корпус, екран з трьома «барабанами», важіль, лампа
  ensureTexture(scene, 'ph/slot_machine', 32, 44, (c) => {
    px(c, '#1a0f14', 2, 4, 26, 40);
    px(c, '#7a1f2a', 3, 5, 24, 38);
    px(c, '#a8323f', 3, 5, 24, 3);
    px(c, '#ffd25a', 6, 0, 18, 5); // табло-лампа
    px(c, '#fff3b0', 8, 1, 14, 2);
    px(c, '#0d0a10', 6, 11, 18, 12); // екран
    px(c, '#e8d6b0', 7, 13, 4, 8);
    px(c, '#e8d6b0', 13, 13, 4, 8);
    px(c, '#e8d6b0', 19, 13, 4, 8);
    px(c, '#c0392b', 8, 15, 2, 3); // символи
    px(c, '#ffd25a', 14, 15, 2, 3);
    px(c, '#2e86de', 20, 15, 2, 3);
    px(c, '#3a1218', 6, 27, 18, 6); // кнопки
    px(c, '#ffd25a', 8, 29, 4, 2);
    px(c, '#6fbf6a', 14, 29, 4, 2);
    px(c, '#3a3a44', 28, 12, 2, 16); // важіль
    px(c, '#c0392b', 27, 9, 4, 4);
    px(c, '#2a0d12', 3, 38, 24, 5);
  });

  // каса (44×30): стійка з віконцем і табличкою
  ensureTexture(scene, 'ph/cashier', 44, 30, (c) => {
    px(c, '#1a1008', 0, 8, 44, 22);
    px(c, '#5a3a20', 1, 9, 42, 20);
    px(c, '#7a5030', 1, 9, 42, 3);
    px(c, '#0d0a10', 10, 12, 24, 10); // віконце
    px(c, '#2a4a5a', 11, 13, 22, 8);
    px(c, '#9fd0ff', 12, 14, 6, 1);
    px(c, '#d4a35a', 4, 24, 36, 2);
    px(c, '#2a1810', 14, 0, 16, 8); // табличка
    px(c, '#ffd25a', 15, 1, 14, 6);
    px(c, '#7a4a10', 17, 3, 10, 2);
  });

  // дошка рекордів (28×24)
  ensureTexture(scene, 'ph/board', 28, 24, (c) => {
    px(c, '#2a1810', 0, 0, 28, 20);
    px(c, '#1d2a22', 2, 2, 24, 16);
    for (let y = 5; y < 17; y += 3) px(c, '#9fe0a0', 4, y, 8 + ((y * 7) % 12), 1);
    px(c, '#2a1810', 4, 20, 3, 4);
    px(c, '#2a1810', 21, 20, 3, 4);
  });

  // світло для темряви: радіальний градієнт (білий центр → прозорий край)
  if (!scene.textures.exists('ph/light')) {
    const size = 256;
    const tex = scene.textures.createCanvas('ph/light', size, size);
    if (tex) {
      const ctx = tex.getContext();
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      tex.refresh();
    }
  }
}
