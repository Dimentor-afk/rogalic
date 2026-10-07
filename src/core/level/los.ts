/**
 * Лінія видимості по сітці (DDA — Digital Differential Analyzer, як у Wolfenstein-подібних рейкастерах).
 *
 * Йдемо від клітинки до клітинки вздовж відрізка a→b: на кожному кроці переходимо через ту межу
 * (вертикальну чи горизонтальну), до якої вздовж променя ближче. Якщо зустріли тверду клітинку — не видно.
 * Складність O(кількість перетнутих клітинок). Дошки (односторонні платформи) погляд не блокують.
 */
import { isSolid, type Grid } from './grid';

export function hasLineOfSight(grid: Grid, tileSize: number, ax: number, ay: number, bx: number, by: number): boolean {
  let cx = Math.floor(ax / tileSize);
  let cy = Math.floor(ay / tileSize);
  const tx = Math.floor(bx / tileSize);
  const ty = Math.floor(by / tileSize);
  const dx = bx - ax;
  const dy = by - ay;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  // скільки «t» (частка відрізка) треба пройти, щоб перетнути одну клітинку по X / по Y
  const tDeltaX = dx !== 0 ? Math.abs(tileSize / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(tileSize / dy) : Infinity;
  // t до першої межі клітинки
  const nextBoundX = (cx + (stepX > 0 ? 1 : 0)) * tileSize;
  const nextBoundY = (cy + (stepY > 0 ? 1 : 0)) * tileSize;
  let tMaxX = dx !== 0 ? (nextBoundX - ax) / dx : Infinity;
  let tMaxY = dy !== 0 ? (nextBoundY - ay) / dy : Infinity;

  // кількість кроків обмежена манхеттенською відстанню в клітинках — захист від нескінченного циклу
  const maxSteps = Math.abs(tx - cx) + Math.abs(ty - cy) + 1;
  for (let i = 0; i <= maxSteps; i++) {
    if (isSolid(grid, cx, cy)) return false;
    if (cx === tx && cy === ty) return true;
    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX;
      cx += stepX;
    } else {
      tMaxY += tDeltaY;
      cy += stepY;
    }
  }
  return false;
}
