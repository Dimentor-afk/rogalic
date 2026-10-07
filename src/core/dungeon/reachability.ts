/**
 * Прохідність рівня для гравця — BFS по «графу руху» (без Phaser, для тестів і генератора).
 *
 * Вершина графа — «стійка» (x, y): гравець (1 клітинка завширшки, 2 заввишки) стоїть ногами на клітинці
 * (x, y+1), а клітинки (x, y) і (x, y-1) — вільні. Ребра — можливі рухи:
 *   ходьба вліво/вправо (якщо там нема підлоги — падіння вниз до першої опори);
 *   стрибок: підйом до jumpUp рядків (дошки знизу проходимо наскрізь), потім горизонтальний рух до jumpSide
 *            клітинок на висоті вершини і падіння вниз — спрощена дуга стрибка;
 *   зістрибування з дошки вниз (S + стрибок).
 * Це консервативна оцінка: якщо BFS каже «досяжно», то в грі точно можна дійти.
 */
import { isOneWay, isSolid, type Grid } from '../level/grid';

export interface MoveRules {
  /** На скільки рядків вгору дістає стрибок. */
  jumpUp: number;
  /** На скільки клітинок убік можна зміститися в стрибку. */
  jumpSide: number;
}

export const DEFAULT_MOVE_RULES: MoveRules = { jumpUp: 3, jumpSide: 4 };

const key = (x: number, y: number, w: number) => y * w + x;

/** Клітинка вільна для тіла гравця (дошка — вільна: крізь неї можна пройти знизу). */
function free(g: Grid, x: number, y: number): boolean {
  if (x < 0 || x >= g.width || y < 0 || y >= g.height) return false;
  return !isSolid(g, x, y);
}

/** Чи є опора під клітинкою (x, y). */
function floorUnder(g: Grid, x: number, y: number): boolean {
  return isSolid(g, x, y + 1) || isOneWay(g, x, y + 1);
}

export function canStand(g: Grid, x: number, y: number): boolean {
  return free(g, x, y) && free(g, x, y - 1) && floorUnder(g, x, y);
}

/** Падіння з (x, y) вниз до першої опори. null — випав за межі. */
export function fall(g: Grid, x: number, y: number): [number, number] | null {
  let cy = y;
  while (cy < g.height) {
    if (!free(g, x, cy)) return null;
    if (floorUnder(g, x, cy)) return free(g, x, cy - 1) ? [x, cy] : null;
    cy++;
  }
  return null;
}

/** Усі стійки, досяжні зі стійки (sx, sy). */
export function reachableFrom(g: Grid, sx: number, sy: number, rules: MoveRules = DEFAULT_MOVE_RULES): Set<number> {
  const w = g.width;
  const seen = new Set<number>();
  const queue: [number, number][] = [];
  const push = (p: [number, number] | null) => {
    if (!p) return;
    const k = key(p[0], p[1], w);
    if (seen.has(k)) return;
    seen.add(k);
    queue.push(p);
  };
  if (canStand(g, sx, sy)) push([sx, sy]);
  else push(fall(g, sx, sy));

  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!;
    // ходьба
    for (const dx of [-1, 1]) {
      const nx = x + dx;
      if (free(g, nx, y) && free(g, nx, y - 1)) push(fall(g, nx, y));
    }
    // зістрибнути з дошки
    if (isOneWay(g, x, y + 1) && !isSolid(g, x, y + 1)) push(fall(g, x, y + 1));
    // стрибок: піднімаємось на up рядків (голова на y-1-up), потім рух убік на висоті вершини
    for (let up = 1; up <= rules.jumpUp; up++) {
      if (!free(g, x, y - 1 - up)) break; // стеля над головою
      const top = y - up;
      // що вище стрибаємо, то менше часу на рух убік до вершини: на +1 рядок — jumpSide, на +3 — jumpSide-2
      const maxSide = Math.max(1, rules.jumpSide - (up - 1));
      for (const dir of [-1, 1]) {
        for (let side = 0; side <= maxSide; side++) {
          const nx = x + dir * side;
          if (side > 0 && !(free(g, nx, top) && free(g, nx, top - 1))) break;
          push(fall(g, nx, top));
        }
      }
    }
  }
  return seen;
}

export function stateKey(g: Grid, x: number, y: number): number {
  return key(x, y, g.width);
}
