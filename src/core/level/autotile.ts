/**
 * Автотайлінг: сітка рівня → список «що і де намалювати».
 *
 * 1. СКЕЛЯ — 4-бітна маска сусідів. Для кожної твердої клітинки дивимось, які з 4 сторін відкриті
 *    (сусід порожній): T=1 (верх), R=2, B=4 (низ), L=8. Маска 0..15 → набір шматків з конфігу
 *    ("" — заповнення, "T" — підлога, "TR" — правий верхній кут, …).
 *    Якщо для маски шматків немає — беремо найближчу визначену підмаску (див. buildMaskTable).
 *    Варіант шматка — хеш (seed, x, y): візерунок відтворюваний і не залежить від порядку обходу.
 * 2. ЗАТЕМНЕННЯ — заповнення глибше в скелі темніше (BFS-відстань до порожнечі).
 * 3. ДЕКОР — рідкісні сталактити під стелею (з шансом, теж через хеш).
 * 4. ДЕРЕВО — дошки односторонніх платформ (лівий край / середина / правий край)
 *    і риштування під довшими дошками — лише якщо воно стоїть на скелі (не на іншій дошці).
 *
 * Порядок малювання: риштування → скеля → сталактити → дошки.
 * Модуль без Phaser — тестується в Vitest.
 */
import { hash32, weightedPick } from '../rng';
import { isOneWay, isSolid, type Grid } from './grid';

export interface Piece {
  frame: string;
  /** Дзеркально по горизонталі (так з правої стіни отримуємо ліву). */
  flipX?: boolean;
  /** Зсув відносно лівого верхнього кута клітинки, px (для шматків, що вилазять за клітинку). */
  dx?: number;
  dy?: number;
  /** Вага при випадковому виборі варіанта (за замовчуванням 1). */
  weight?: number;
}

export interface DecorRule {
  /** Куди чіпляти: 'bottom' — під клітинку з відкритим низом (сталактит). */
  side: 'bottom';
  /** Імовірність для кожної придатної клітинки, 0..1. */
  chance: number;
  /** Скільки порожніх клітинок має бути під стелею (щоб декор не висів у низьких тунелях). */
  minClear?: number;
  pieces: readonly Piece[];
}

export interface ScaffoldDef {
  /** Кадри риштування 3 стовпці × 3 рядки, по рядках. Візерунок повторюється кожні 3 клітинки вниз. */
  frames: readonly string[];
  /** Мінімальна довжина дошки, під якою ставимо опору. */
  minRun: number;
  /** Довша за це дошка отримує дві опори (по краях). */
  doubleRun: number;
  /** Максимальна висота опори в клітинках (немає скелі ближче — опори нема). */
  maxDepth: number;
}

export interface TilesetDef {
  atlas: string;
  tileSize: number;
  /** Ключ — відкриті сторони в порядку T R B L ("", "T", "TR", "RB", "TRBL"…). "" обов'язковий. */
  solid: Readonly<Record<string, readonly Piece[]>>;
  /** Яскравість заповнення на відстані 1, 2, 3… від порожнечі. Останнє значення — для всіх глибших. */
  depthShade?: readonly number[];
  decor?: readonly DecorRule[];
  plank?: { left: readonly Piece[]; mid: readonly Piece[]; right: readonly Piece[] };
  scaffold?: ScaffoldDef;
}

export interface DrawOp {
  frame: string;
  /** Лівий верхній кут, px. */
  x: number;
  y: number;
  flipX: boolean;
  /** Яскравість 0..1 (1 — без затемнення). */
  shade: number;
}

// ---------- маска ----------

const SIDES = ['T', 'R', 'B', 'L'] as const;
const BIT: Record<(typeof SIDES)[number], number> = { T: 1, R: 2, B: 4, L: 8 };

export function maskOf(key: string): number {
  let m = 0;
  for (const ch of key) {
    const b = BIT[ch as keyof typeof BIT];
    if (b === undefined) throw new Error(`Невідома сторона "${ch}" у ключі "${key}" (дозволено T R B L)`);
    m |= b;
  }
  return m;
}

export function keyOf(mask: number): string {
  return SIDES.filter((s) => mask & BIT[s]).join('');
}

const popcount = (m: number): number => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

/**
 * Таблиця 16 масок → набір шматків.
 * Немає точного збігу → беремо визначену маску, що є підмножиною потрібної і має найбільше спільних сторін.
 * При рівності перевага — верху (підлога найпомітніша), потім низу. Напр.: "TB" немає → "T".
 */
export function buildMaskTable(solid: TilesetDef['solid']): (readonly Piece[])[] {
  if (!solid['']?.length) throw new Error('Тайлсет: потрібен набір заповнення (ключ "")');
  const defined = Object.entries(solid)
    .filter(([, p]) => p.length > 0)
    .map(([k, p]) => ({ mask: maskOf(k), pieces: p }));
  const table: (readonly Piece[])[] = [];
  for (let mask = 0; mask < 16; mask++) {
    const best = defined
      .filter((d) => (d.mask & mask) === d.mask)
      .sort((a, b) => popcount(b.mask) - popcount(a.mask) || (b.mask & 1) - (a.mask & 1) || (b.mask & 4) - (a.mask & 4) || a.mask - b.mask)[0]!;
    table.push(best.pieces);
  }
  return table;
}

// ---------- затемнення ----------

/**
 * Відстань кожної клітинки до найближчої порожньої (у кроках по 8 напрямках).
 * Багатоджерельний BFS: стартуємо одночасно з усіх порожніх клітинок (відстань 0),
 * хвиля розходиться в скелю — кожна клітинка отримує відстань, коли хвиля вперше до неї дійде. O(w·h).
 * Порожніх клітинок нема взагалі — усім Infinity.
 */
export function distanceToEmpty(grid: Grid): Float32Array {
  const { width: w, height: h } = grid;
  const dist = new Float32Array(w * h).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!grid.solid[i]) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (dist[j] === Infinity) {
          dist[j] = dist[i]! + 1;
          queue.push(j);
        }
      }
    }
  }
  return dist;
}

// ---------- головна функція ----------

/** Різні «солі» хешу для різних виборів, щоб вони не корелювали між собою. */
const SALT = { solid: 1, decorChance: 2, decorPick: 3, plank: 4 } as const;

function pick(pieces: readonly Piece[], seed: number, x: number, y: number, salt: number): Piece {
  const r = hash32(seed, x, y, salt) / 4294967296;
  const weights = pieces.some((p) => p.weight !== undefined) ? pieces.map((p) => p.weight ?? 1) : undefined;
  return weightedPick(pieces, weights, r);
}

export function autotile(grid: Grid, tileset: TilesetDef, seed: number): DrawOp[] {
  const ts = tileset.tileSize;
  const ops: DrawOp[] = [];
  const put = (p: Piece, x: number, y: number, shade = 1) =>
    ops.push({ frame: p.frame, x: x * ts + (p.dx ?? 0), y: y * ts + (p.dy ?? 0), flipX: p.flipX ?? false, shade });

  // 1. риштування (найдальший шар)
  if (tileset.scaffold) {
    for (const s of scaffoldCells(grid, tileset.scaffold)) put({ frame: s.frame }, s.x, s.y);
  }

  // 2. скеля
  const table = buildMaskTable(tileset.solid);
  const shades = tileset.depthShade;
  const dist = shades?.length ? distanceToEmpty(grid) : undefined;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!isSolid(grid, x, y)) continue;
      const mask =
        (isSolid(grid, x, y - 1) ? 0 : BIT.T) |
        (isSolid(grid, x + 1, y) ? 0 : BIT.R) |
        (isSolid(grid, x, y + 1) ? 0 : BIT.B) |
        (isSolid(grid, x - 1, y) ? 0 : BIT.L);
      let shade = 1;
      if (mask === 0 && dist && shades) {
        const d = dist[y * grid.width + x]!;
        shade = shades[Math.min(Math.max(d, 1), shades.length) - 1]!;
      }
      put(pick(table[mask]!, seed, x, y, SALT.solid), x, y, shade);
    }
  }

  // 3. декор
  for (const rule of tileset.decor ?? []) {
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        // сталактит: тверда клітинка, під якою щонайменше minClear порожніх клітинок
        if (!isSolid(grid, x, y)) continue;
        let clear = 0;
        while (clear < (rule.minClear ?? 1) && !isSolid(grid, x, y + 1 + clear) && !isOneWay(grid, x, y + 1 + clear)) clear++;
        if (clear < (rule.minClear ?? 1)) continue;
        if (hash32(seed, x, y, SALT.decorChance) / 4294967296 >= rule.chance) continue;
        put(pick(rule.pieces, seed, x, y, SALT.decorPick), x, y + 1);
      }
    }
  }

  // 4. дошки: вибір кінця/середини за сусідами в рядку
  if (tileset.plank) {
    const { left, mid, right } = tileset.plank;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!isOneWay(grid, x, y)) continue;
        const l = isOneWay(grid, x - 1, y);
        const r = isOneWay(grid, x + 1, y);
        const set = !l && r ? left : l && !r ? right : mid;
        put(pick(set, seed, x, y, SALT.plank), x, y);
      }
    }
  }

  return ops;
}

// ---------- риштування ----------

export interface ScaffoldCell {
  frame: string;
  x: number;
  y: number;
}

/**
 * Скільки порожніх клітинок під (x, y) до скелі. null — раніше трапилась дошка
 * або скелі немає ближче за maxDepth (за межами сітки — теж не опора).
 */
function depthToRock(grid: Grid, x: number, y: number, maxDepth: number): number | null {
  for (let depth = 0; depth < maxDepth; depth++) {
    if (isSolid(grid, x, y + 1 + depth, false)) return depth;
    if (isOneWay(grid, x, y + 1 + depth)) return null;
  }
  return null;
}

/**
 * Опори під дошками. Для кожного горизонтального відрізка дошок довжиною ≥ minRun ставимо
 * одну опору шириною 3 по центру (або дві по краях, якщо відрізок ≥ doubleRun).
 * Опору ставимо, лише якщо всі три її стовпці дістають скелі не глибше maxDepth і не впираються
 * в іншу дошку: так немає «драбин» з риштування і опор, що висять у повітрі.
 */
export function scaffoldCells(grid: Grid, def: ScaffoldDef): ScaffoldCell[] {
  const out: ScaffoldCell[] = [];
  for (let y = 0; y < grid.height; y++) {
    let x = 0;
    while (x < grid.width) {
      if (!isOneWay(grid, x, y)) {
        x++;
        continue;
      }
      const x0 = x;
      while (isOneWay(grid, x, y)) x++;
      const len = x - x0;
      if (len < def.minRun) continue;
      const starts = len >= def.doubleRun ? [x0, x0 + len - 3] : [x0 + Math.floor((len - 3) / 2)];
      for (const sx of starts) {
        const depths = [0, 1, 2].map((col) => depthToRock(grid, sx + col, y, def.maxDepth));
        if (depths.some((d) => d === null)) continue;
        depths.forEach((depth, col) => {
          // depth = 0 — цей стовпець дошки лежить просто на скелі, малювати нічого
          for (let k = 0; k < depth!; k++) out.push({ frame: def.frames[(k % 3) * 3 + col]!, x: sx + col, y: y + 1 + k });
        });
      }
    }
  }
  return out;
}
