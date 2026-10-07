/**
 * Мінімальна робота з RGBA-зображеннями для пакувальника спрайтів.
 * Чисті функції без залежностей — їх легко тестувати і пояснити.
 * Формат: data — масив байтів RGBA, рядок за рядком (як у PNG).
 */

export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function createImage(width: number, height: number): RGBAImage {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Індекс першого байта пікселя (x, y). */
function idx(img: RGBAImage, x: number, y: number): number {
  return (y * img.width + x) * 4;
}

export function crop(img: RGBAImage, r: Rect): RGBAImage {
  if (r.x < 0 || r.y < 0 || r.x + r.w > img.width || r.y + r.h > img.height) {
    throw new Error(`crop ${JSON.stringify(r)} виходить за межі ${img.width}x${img.height}`);
  }
  const out = createImage(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    const from = idx(img, r.x, r.y + y);
    out.data.set(img.data.subarray(from, from + r.w * 4), y * r.w * 4);
  }
  return out;
}

/**
 * Масштабування «найближчим сусідом» на цілий коефіцієнт.
 * scale < 1 — зменшення (0.5 = кожен 2-й піксель), scale > 1 — збільшення.
 * Для піксель-арту, вже збільшеного в N разів, зменшення в N разів — без втрат.
 */
export function scaleNearest(img: RGBAImage, scale: number): RGBAImage {
  if (scale === 1) return img;
  const down = scale < 1;
  const k = down ? Math.round(1 / scale) : Math.round(scale);
  if (Math.abs((down ? 1 / k : k) - scale) > 1e-9) {
    throw new Error(`scale ${scale} має бути цілим (2, 3…) або 1/ціле (0.5, 0.25…)`);
  }
  const w = down ? Math.floor(img.width / k) : img.width * k;
  const h = down ? Math.floor(img.height / k) : img.height * k;
  const out = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = down ? x * k : Math.floor(x / k);
      const sy = down ? y * k : Math.floor(y / k);
      const s = idx(img, sx, sy);
      out.data.set(img.data.subarray(s, s + 4), idx(out, x, y));
    }
  }
  return out;
}

/**
 * Чи складається зображення з однотонних блоків k×k?
 * Якщо так — зменшення в k разів не втрачає деталей (перевірка для асетів «вже збільшених у 4 рази»).
 */
export function isBlockUniform(img: RGBAImage, k: number): boolean {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const a = idx(img, x, y);
      const b = idx(img, x - (x % k), y - (y % k));
      for (let c = 0; c < 4; c++) if (img.data[a + c] !== img.data[b + c]) return false;
    }
  }
  return true;
}

/** Поворот за годинниковою стрілкою на 0/90/180/270 градусів. */
export function rotate(img: RGBAImage, deg: 0 | 90 | 180 | 270): RGBAImage {
  if (deg === 0) return img;
  const swap = deg === 90 || deg === 270;
  const out = createImage(swap ? img.height : img.width, swap ? img.width : img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      let nx: number;
      let ny: number;
      if (deg === 90) {
        // верх стає правим боком
        nx = img.height - 1 - y;
        ny = x;
      } else if (deg === 180) {
        nx = img.width - 1 - x;
        ny = img.height - 1 - y;
      } else {
        // 270: верх стає лівим боком
        nx = y;
        ny = img.width - 1 - x;
      }
      const s = idx(img, x, y);
      out.data.set(img.data.subarray(s, s + 4), idx(out, nx, ny));
    }
  }
  return out;
}

/** Найменший прямокутник, що містить усі непрозорі пікселі (null — якщо картинка порожня). */
export function alphaBounds(img: RGBAImage): Rect | null {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[idx(img, x, y) + 3]! > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Копіює src у dst на позицію (dx, dy).
 * extrude > 0 — додатково «розтягує» крайні пікселі назовні на extrude px.
 * Це прибирає щілини між тайлами, коли камера стоїть на дробовій координаті
 * (GPU може зачепити сусідній піксель атласу — тепер там та сама барва).
 */
export function blit(dst: RGBAImage, src: RGBAImage, dx: number, dy: number, extrude = 0): void {
  for (let y = -extrude; y < src.height + extrude; y++) {
    for (let x = -extrude; x < src.width + extrude; x++) {
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      const sx = Math.min(Math.max(x, 0), src.width - 1);
      const sy = Math.min(Math.max(y, 0), src.height - 1);
      const s = idx(src, sx, sy);
      dst.data.set(src.data.subarray(s, s + 4), idx(dst, tx, ty));
    }
  }
}
