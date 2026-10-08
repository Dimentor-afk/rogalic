/**
 * Місце для тіла і уступи — чисті функції над сіткою рівня (без Phaser), тому їх легко протестувати.
 *
 * Уступ — тверда клітинка стіни, верхній край якої зараз на висоті рук гравця, а над краєм
 * вільно, щоб там стати. Дошки (oneWay) уступами не вважаємо: крізь них і так застрибуєш знизу.
 */
import { isSolid, type Grid } from '../level/grid';
import type { Rect } from './geometry';

/** Прямокутник (px) не зачіпає жодної твердої клітинки. За межами сітки — скеля. */
export function rectFree(g: Grid, tileSize: number, r: Rect): boolean {
  // -0.001: прямокутник, що закінчується рівно на межі клітинки, сусідню клітинку не займає
  const x0 = Math.floor(r.x / tileSize);
  const x1 = Math.floor((r.x + r.w - 0.001) / tileSize);
  const y0 = Math.floor(r.y / tileSize);
  const y1 = Math.floor((r.y + r.h - 0.001) / tileSize);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) if (isSolid(g, x, y)) return false;
  }
  return true;
}

export interface LedgeQuery {
  /** Хітбокс тіла стоячи, px. */
  body: Rect;
  /** До якої стіни тягнемось: 1 — праворуч, -1 — ліворуч. */
  dir: 1 | -1;
  /** На скільки px вище ніг руки, коли висиш. */
  handAboveFeet: number;
  /** Наскільки край може бути вище/нижче рук, px. */
  tolerance: number;
  /** Як далеко попереду тіла може бути стіна, px (до плаваючої плити тіло не притиснеш). */
  reach: number;
}

export interface Ledge {
  /** Верхній край уступу (y, px). */
  top: number;
  /** Грань стіни (x, px), за яку тримаємось. */
  wallX: number;
  /** Лівий край хітбокса, коли висиш (впритул до стіни). */
  hangX: number;
  /** Лівий край хітбокса, коли видерся і стоїш на уступі. */
  standX: number;
}

export function findLedge(g: Grid, tileSize: number, q: LedgeQuery): Ledge | null {
  const { body, dir } = q;
  // стіна — у межах reach px перед тілом з того боку, куди тягнемось
  const front = dir > 0 ? body.x + body.w : body.x;
  const tx = Math.floor((front + dir * q.reach) / tileSize);
  // найближча до рук горизонтальна межа клітинок — кандидат на край
  const handY = body.y + body.h - q.handAboveFeet;
  const ty = Math.round(handY / tileSize);
  const top = ty * tileSize;
  if (Math.abs(top - handY) > q.tolerance) return null;
  // під краєм — скеля (за межами сітки не чіпляємось)
  if (!isSolid(g, tx, ty, false)) return null;

  const wallX = dir > 0 ? tx * tileSize : (tx + 1) * tileSize;
  // тіло вже під плитою або над нею (грань позаду переднього краю) — це не край перед нами
  if ((wallX - front) * dir < -0.5) return null;
  const hangX = dir > 0 ? wallX - body.w : wallX;
  const standX = dir > 0 ? wallX + 1 : wallX - 1 - body.w;
  // нагорі є де стати на весь зріст
  if (!rectFree(g, tileSize, { x: standX, y: top - body.h, w: body.w, h: body.h })) return null;
  // шлях угору вздовж стіни вільний: від висіння до зросту над краєм
  if (!rectFree(g, tileSize, { x: hangX, y: top - body.h, w: body.w, h: body.h + q.handAboveFeet })) return null;
  return { top, wallX, hangX, standX };
}
