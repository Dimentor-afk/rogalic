/**
 * Геометрія ударів (без Phaser).
 *
 * Ближня атака задається «дугою»: радіус (дальність) + кут розкриття навколо напрямку погляду.
 * Ціль — прямокутник хітбокса. Попадання, якщо найближча до точки удару точка прямокутника
 * лежить у секторі: відстань ≤ range і кут між напрямком погляду і вектором до неї ≤ arc/2.
 * Найближча точка (а не центр) — щоб великі вороги отримували удар по краю, а не лише в «серце».
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Vec {
  x: number;
  y: number;
}

/** Найближча до точки p точка прямокутника (затискаємо координати в межі). */
export function closestPointOnRect(p: Vec, r: Rect): Vec {
  return {
    x: Math.min(Math.max(p.x, r.x), r.x + r.w),
    y: Math.min(Math.max(p.y, r.y), r.y + r.h),
  };
}

/**
 * @param origin  точка, з якої б'ють (плече/центр тіла)
 * @param facing  1 — вправо, -1 — вліво
 * @param range   дальність, px
 * @param arcDeg  повний кут дуги, градуси (360 — удар навколо)
 */
export function sectorHitsRect(origin: Vec, facing: 1 | -1, range: number, arcDeg: number, target: Rect): boolean {
  const c = closestPointOnRect(origin, target);
  const dx = c.x - origin.x;
  const dy = c.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  if (dist === 0 || arcDeg >= 360) return true; // ціль «всередині» точки удару
  // кут між (facing, 0) і (dx, dy): cos = (facing·dx) / dist
  const cos = (facing * dx) / dist;
  const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  return angle <= arcDeg / 2;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
