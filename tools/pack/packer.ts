/**
 * Пакування прямокутників в атлас алгоритмом «полиць» (shelf packing).
 *
 * Ідея: сортуємо кадри за висотою (від найвищих), кладемо зліва направо в рядок-«полицю».
 * Коли наступний кадр не влазить по ширині — відкриваємо нову полицю під поточною.
 * Висота полиці = висота першого (найвищого) кадру в ній.
 * Алгоритм не оптимальний (як MaxRects), зате простий: O(n log n) і легко пояснити.
 */

export interface PackItem {
  id: string;
  w: number;
  h: number;
}

export interface Placement {
  x: number;
  y: number;
}

export interface PackResult {
  width: number;
  height: number;
  placements: Map<string, Placement>;
}

/**
 * @param maxWidth  максимальна ширина атласу
 * @param padding   відступ між кадрами (з урахуванням extrude з обох боків)
 */
export function shelfPack(items: PackItem[], maxWidth: number, padding: number): PackResult {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w || a.id.localeCompare(b.id));
  const placements = new Map<string, Placement>();

  let x = padding;
  let y = padding;
  let shelfH = 0;
  let usedW = 0;

  for (const it of sorted) {
    if (it.w + padding * 2 > maxWidth) {
      throw new Error(`Кадр "${it.id}" (${it.w}px) ширший за атлас (${maxWidth}px)`);
    }
    if (x + it.w + padding > maxWidth) {
      // нова полиця
      x = padding;
      y += shelfH + padding;
      shelfH = 0;
    }
    placements.set(it.id, { x, y });
    x += it.w + padding;
    shelfH = Math.max(shelfH, it.h);
    usedW = Math.max(usedW, x);
  }

  const height = items.length ? y + shelfH + padding : 0;
  return { width: items.length ? usedW : 0, height, placements };
}
