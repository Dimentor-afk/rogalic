/**
 * ГЕНЕРАТОР ПІДЗЕМЕЛЛЯ «як у Dead Cells»: вручну зроблені шаблони кімнат + процедурне компонування.
 *
 * 1. Граф рівня: старт → N бойових → вихід (ліфт). До випадкових бойових кімнат чіпляються відгалуження
 *    (скарбниці, додаткові бойові).
 * 2. Розкладка графа на макросітку (кожна кімната — одна клітинка): пошук у глибину з відкатом —
 *    кожну наступну кімнату ставимо у випадкову вільну сусідню клітинку (вбік частіше, ніж вгору/вниз);
 *    глухий кут → відкат і інший напрямок.
 * 3. Виходи кожної кімнати = напрямки до сусідів по графу. Шаблон обираємо серед тих, у кого
 *    набір виходів ⊇ потрібних (з урахуванням дзеркальної копії шаблону). Зайві виходи замуровуються.
 * 4. Зшивання: шаблони мають стандартний розмір і стандартні позиції виходів, сусідні кімнати ділять
 *    стіну — отвори завжди збігаються.
 * 5. Заселення: слоти ворогів (вибір за вагами з урахуванням глибини), бочки, скриня, ліфт, мішок смерті.
 * 6. Перевірка: BFS по графу руху гравця — ліфт, спуск і скарбниці мусять бути досяжні зі старту.
 *    Не пройшло — нова спроба з тим самим RNG (тобто результат усе одно залежить лише від seed).
 *
 * Модуль без Phaser. Той самий seed → те саме підземелля (перевіряє тест).
 */
import { EXIT_SLOTS, LAYOUT, POPULATE, ROOM_SIZE } from '../../config/dungeon';
import { ENEMIES, type EnemyDef } from '../../config/enemies';
import type { CurseDef } from '../../config/curses';
import { hash32, mulberry32, weightedPick } from '../rng';
import { createGrid, type Grid } from '../level/grid';
import { canStand, fall, reachableFrom, stateKey } from './reachability';

export type RoomType = 'start' | 'combat' | 'treasure' | 'exit';
export type Dir = 'L' | 'R' | 'U' | 'D';

export interface RoomTemplate {
  id: string;
  type: RoomType;
  exits: string;
  rows: string[];
}

export interface LevelNode {
  id: number;
  type: RoomType;
  /** Батьківський вузол (для відгалужень і головного шляху). */
  parent: number | null;
  /** Чи лежить на головному шляху старт → вихід. */
  main: boolean;
}

export interface PlacedRoom {
  node: LevelNode;
  mx: number;
  my: number;
  template: string;
  mirrored: boolean;
  exits: Dir[];
  /** Лівий верхній кут кімнати у глобальній сітці (клітинки). */
  x: number;
  y: number;
}

export type SpawnKind = 'player' | 'enemy' | 'barrel' | 'chest' | 'elevator' | 'descent' | 'bag' | 'door';

export interface DungeonSpawn {
  kind: SpawnKind;
  /** Клітинка (стоїть на клітинці під нею). */
  x: number;
  y: number;
  enemyId?: string;
  chips?: number;
  flask?: boolean;
  /** Індекс кімнати в rooms. */
  room: number;
}

export interface DungeonLevel {
  seed: number;
  depth: number;
  grid: Grid;
  rooms: PlacedRoom[];
  spawns: DungeonSpawn[];
  /** Скільки спроб знадобилось (для статистики/тестів). */
  attempts: number;
}

export interface GenerateOptions {
  seed: number;
  depth: number;
  templates: readonly RoomTemplate[];
  curse?: CurseDef | null;
  /** На цій глибині лежить мішок смерті з такою кількістю фішок. */
  bag?: { depth: number; chips: number } | null;
  enemies?: Record<string, EnemyDef>;
}

const DIRS: Record<Dir, [number, number]> = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };

type Rng = () => number;

// =================== 1. граф ===================

export function buildGraph(rng: Rng, depth: number): LevelNode[] {
  const nodes: LevelNode[] = [];
  const add = (type: RoomType, parent: number | null, main: boolean) => {
    nodes.push({ id: nodes.length, type, parent, main });
    return nodes.length - 1;
  };
  const mp = LAYOUT.mainPath;
  const combatCount = Math.min(mp.max, mp.base + mp.perDepth * (depth - 1));
  let prev = add('start', null, true);
  const mainCombat: number[] = [];
  for (let i = 0; i < combatCount; i++) {
    prev = add('combat', prev, true);
    mainCombat.push(prev);
  }
  add('exit', prev, true);

  // відгалуження: скарбниці і додаткова бойова кімната (теж може вести до скарбу)
  const treasureCount = LAYOUT.treasure.base + (depth >= LAYOUT.treasure.extraFromDepth ? 1 : 0);
  const pickHost = () => mainCombat[Math.floor(rng() * mainCombat.length)]!;
  for (let i = 0; i < treasureCount; i++) add('treasure', pickHost(), false);
  if (rng() < LAYOUT.sideCombatChance) {
    const side = add('combat', pickHost(), false);
    if (rng() < 0.5) add('treasure', side, false);
  }
  return nodes;
}

// =================== 2. розкладка на макросітку ===================

interface Cell {
  mx: number;
  my: number;
}

function shuffleWeighted(rng: Rng, dirs: Dir[]): Dir[] {
  const w = LAYOUT.dirWeights;
  const weight = (d: Dir) => (d === 'L' || d === 'R' ? w.side : d === 'D' ? w.down : w.up);
  // зважене перемішування: на кожному кроці тягнемо напрямок пропорційно вазі
  const pool = [...dirs];
  const out: Dir[] = [];
  while (pool.length) {
    const d = weightedPick(pool, pool.map(weight), rng());
    out.push(d);
    pool.splice(pool.indexOf(d), 1);
  }
  return out;
}

/** Розкладка з відкатом. Повертає клітинку для кожного вузла або null. */
export function embedGraph(rng: Rng, nodes: LevelNode[], gridW: number, gridH: number): Cell[] | null {
  const pos: (Cell | undefined)[] = [];
  const used = new Set<string>();
  const k = (c: Cell) => `${c.mx},${c.my}`;
  const free = (c: Cell) => c.mx >= 0 && c.my >= 0 && c.mx < gridW && c.my < gridH && !used.has(k(c));

  // порядок: спершу головний шлях (щоб він мав пріоритет місця), потім відгалуження
  const order = [...nodes.filter((n) => n.main), ...nodes.filter((n) => !n.main)];

  const place = (i: number): boolean => {
    if (i === order.length) return true;
    const node = order[i]!;
    let candidates: Cell[];
    if (node.parent === null) {
      // старт — у випадковій клітинці лівої половини (щоб шлях мав куди йти)
      candidates = [];
      for (let my = 0; my < gridH; my++) for (let mx = 0; mx < Math.ceil(gridW / 2); mx++) candidates.push({ mx, my });
      candidates.sort(() => rng() - 0.5);
      candidates = candidates.slice(0, 4);
    } else {
      const p = pos[node.parent]!;
      candidates = shuffleWeighted(rng, ['L', 'R', 'U', 'D'])
        .map((d) => ({ mx: p.mx + DIRS[d][0], my: p.my + DIRS[d][1] }))
        .filter(free);
    }
    for (const c of candidates) {
      if (!free(c)) continue;
      pos[node.id] = c;
      used.add(k(c));
      if (place(i + 1)) return true;
      used.delete(k(c));
      pos[node.id] = undefined;
    }
    return false;
  };

  return place(0) ? (pos as Cell[]) : null;
}

// =================== 3. шаблони ===================

/** Дзеркальна копія шаблону: рядки навпаки, L↔R, l↔r. */
export function mirrorTemplate(t: RoomTemplate): RoomTemplate {
  const swap: Record<string, string> = { L: 'R', R: 'L', l: 'r', r: 'l' };
  return {
    ...t,
    id: `${t.id}~m`,
    exits: [...t.exits].map((c) => swap[c] ?? c).join(''),
    rows: t.rows.map((row) => [...row].reverse().map((c) => swap[c] ?? c).join('')),
  };
}

function exitsOf(nodes: LevelNode[], cells: Cell[], id: number): Dir[] {
  const out: Dir[] = [];
  const c = cells[id]!;
  for (const n of nodes) {
    const linked = n.parent === id || nodes[id]!.parent === n.id;
    if (!linked) continue;
    const o = cells[n.id]!;
    const dx = o.mx - c.mx;
    const dy = o.my - c.my;
    out.push(dx === 1 ? 'R' : dx === -1 ? 'L' : dy === 1 ? 'D' : 'U');
  }
  return out;
}

export function chooseTemplate(rng: Rng, templates: readonly RoomTemplate[], type: RoomType, need: Dir[]): RoomTemplate | null {
  const all = templates.flatMap((t) => [t, mirrorTemplate(t)]);
  const fits = (t: RoomTemplate) => t.type === type && need.every((d) => t.exits.includes(d));
  const ok = all.filter(fits);
  if (!ok.length) return null;
  // перевага шаблонам, де менше зайвих (замурованих) виходів
  const extra = (t: RoomTemplate) => t.exits.length - need.length;
  const best = Math.min(...ok.map(extra));
  const pool = ok.filter((t) => extra(t) <= best + 1);
  return pool[Math.floor(rng() * pool.length)]!;
}

// =================== 4–6. зшивання, заселення, перевірка ===================

export function generateDungeon(opts: GenerateOptions): DungeonLevel {
  const rng = mulberry32(opts.seed);
  for (let attempt = 1; attempt <= LAYOUT.maxAttempts; attempt++) {
    const level = tryGenerate(rng, opts, attempt);
    if (level) return level;
  }
  throw new Error(`Не вдалося згенерувати рівень (seed ${opts.seed}, глибина ${opts.depth})`);
}

function tryGenerate(rng: Rng, opts: GenerateOptions, attempt: number): DungeonLevel | null {
  const nodes = buildGraph(rng, opts.depth);
  const cells = embedGraph(rng, nodes, LAYOUT.gridW, LAYOUT.gridH);
  if (!cells) return null;

  // вибір шаблонів
  const W = ROOM_SIZE.w;
  const H = ROOM_SIZE.h;
  const picks: { tpl: RoomTemplate; exits: Dir[] }[] = [];
  for (const n of nodes) {
    const exits = exitsOf(nodes, cells, n.id);
    const tpl = chooseTemplate(rng, opts.templates, n.type, exits);
    if (!tpl) return null;
    picks.push({ tpl, exits });
  }

  // обрізаємо макросітку до прямокутника, який реально зайнято
  const minX = Math.min(...cells.map((c) => c.mx));
  const minY = Math.min(...cells.map((c) => c.my));
  const maxX = Math.max(...cells.map((c) => c.mx));
  const maxY = Math.max(...cells.map((c) => c.my));
  const gw = (maxX - minX + 1) * (W - 1) + 1;
  const gh = (maxY - minY + 1) * (H - 1) + 1;
  const chars: string[][] = Array.from({ length: gh }, () => Array<string>(gw).fill('#'));

  const rooms: PlacedRoom[] = nodes.map((n, i) => {
    const c = cells[n.id]!;
    const { tpl, exits } = picks[i]!;
    return {
      node: n,
      mx: c.mx - minX,
      my: c.my - minY,
      template: tpl.id.replace('~m', ''),
      mirrored: tpl.id.endsWith('~m'),
      exits,
      x: (c.mx - minX) * (W - 1),
      y: (c.my - minY) * (H - 1),
    };
  });

  // копіюємо шаблони; маркери виходів і «умовну скелю» поки що робимо скелею
  const conditional: { x: number; y: number; ch: string; room: number }[] = [];
  rooms.forEach((r, ri) => {
    const rows = picks[ri]!.tpl.rows;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = rows[y]![x]!;
        const gx = r.x + x;
        const gy = r.y + y;
        if ('LRUDlrud'.includes(ch)) {
          // спільні стіни сусідів збігаються: обидві кімнати пишуть сюди скелю, отвір прорубаємо нижче
          conditional.push({ x: gx, y: gy, ch, room: ri });
          chars[gy]![gx] = '#';
        } else {
          chars[gy]![gx] = ch;
        }
      }
    }
  });

  // відкриваємо використані виходи: бічні — порожнеча, вертикальні — дошки (зістрибнути/застрибнути)
  rooms.forEach((r, ri) => {
    for (const d of r.exits) {
      for (const c of conditional) {
        if (c.room !== ri || c.ch.toUpperCase() !== d) continue;
        const isBorderVert = c.ch === 'D' || c.ch === 'U';
        chars[c.y]![c.x] = isBorderVert ? '=' : '.';
      }
    }
  });

  // =========== заселення ===========
  const grid = createGrid(gw, gh);
  const spawns: DungeonSpawn[] = [];
  const enemies = opts.enemies ?? ENEMIES;
  const slotChance = Math.min(
    POPULATE.enemySlotChance.max,
    POPULATE.enemySlotChance.base + POPULATE.enemySlotChance.perDepth * (opts.depth - 1),
  );
  const perSlot = opts.curse?.enemyMultiplier ?? 1;
  const chipsMul = opts.curse?.chipsMultiplier ?? 1;
  const roomAt = (gx: number, gy: number) => rooms.findIndex((r) => gx >= r.x && gx < r.x + W && gy >= r.y && gy < r.y + H);

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const ch = chars[y]![x]!;
      if (ch === '#') grid.solid[y * gw + x] = 1;
      else if (ch === '=') grid.oneWay[y * gw + x] = 1;
      const room = roomAt(x, y);
      switch (ch) {
        case 'P':
          spawns.push({ kind: 'player', x, y, room });
          break;
        case 'e':
        case 'f':
          if (rng() < slotChance) {
            const id = pickEnemy(rng, enemies, opts.depth, ch === 'f');
            if (id) for (let k = 0; k < perSlot; k++) spawns.push({ kind: 'enemy', x: x + k, y, enemyId: id, room });
          }
          break;
        case 'b':
          spawns.push({ kind: 'barrel', x, y, room, chips: Math.round(randInt(rng, POPULATE.barrelChips) * depthChips(opts.depth) * chipsMul) });
          break;
        case 'C':
          spawns.push({
            kind: 'chest',
            x,
            y,
            room,
            chips: Math.round(randInt(rng, POPULATE.chestChips) * depthChips(opts.depth) * chipsMul),
            flask: rng() < POPULATE.chestFlaskChance,
          });
          break;
        case 'E':
          spawns.push({ kind: 'elevator', x, y, room });
          break;
        case 'V':
          spawns.push({ kind: 'descent', x, y, room });
          break;
      }
    }
  }

  // двері на вході у скарбниці і в кімнату з ліфтом (лише бічні входи)
  rooms.forEach((r, ri) => {
    if (r.node.type !== 'treasure' && r.node.type !== 'exit') return;
    const parent = r.node.parent;
    if (parent === null) return;
    const p = rooms[parent]!;
    const dx = r.mx - p.mx;
    if (dx === 0) return;
    const doorX = dx > 0 ? r.x : r.x + W - 1;
    spawns.push({ kind: 'door', x: doorX, y: r.y + EXIT_SLOTS.sideRows[EXIT_SLOTS.sideRows.length - 1]!, room: ri });
  });

  // мішок смерті — у бойовій кімнаті посередині головного шляху
  if (opts.bag && opts.bag.depth === opts.depth && opts.bag.chips > 0) {
    const mainCombat = rooms.map((r, i) => ({ r, i })).filter((o) => o.r.node.main && o.r.node.type === 'combat');
    const host = mainCombat[Math.floor(mainCombat.length / 2)] ?? { r: rooms[0]!, i: 0 };
    const spot = findStandSpot(grid, host.r, W, H, hash32(opts.seed, 77));
    if (spot) spawns.push({ kind: 'bag', x: spot[0], y: spot[1], room: host.i, chips: opts.bag.chips });
  }

  // =========== перевірка прохідності ===========
  const start = spawns.find((s) => s.kind === 'player');
  if (!start) return null;
  const reach = reachableFrom(grid, start.x, start.y);
  const mustReach = spawns.filter((s) => s.kind === 'elevator' || s.kind === 'descent' || s.kind === 'chest' || s.kind === 'bag');
  for (const s of mustReach) {
    const landing = canStand(grid, s.x, s.y) ? [s.x, s.y] : fall(grid, s.x, s.y);
    if (!landing || !reach.has(stateKey(grid, landing[0]!, landing[1]!))) return null;
  }

  return { seed: opts.seed, depth: opts.depth, grid, rooms, spawns, attempts: attempt };
}

function randInt(rng: Rng, [a, b]: [number, number]): number {
  return a + Math.floor(rng() * (b - a + 1));
}

function depthChips(depth: number): number {
  return 1 + 0.35 * (depth - 1);
}

/** Вибір ворога для слота: лише ті, що вже «доступні» на цій глибині; літаючі — у повітряні слоти. */
export function pickEnemy(rng: Rng, enemies: Record<string, EnemyDef>, depth: number, flying: boolean): string | null {
  const pool = Object.values(enemies).filter((e) => e.spawn && e.spawn.minDepth <= depth && !!e.flying === flying);
  if (!pool.length) return null;
  return weightedPick(
    pool.map((e) => e.id),
    pool.map((e) => e.spawn!.weight),
    rng(),
  );
}

/** Випадкове місце, де можна стояти, у межах кімнати (детерміновано від salt). */
function findStandSpot(grid: Grid, r: PlacedRoom, W: number, H: number, salt: number): [number, number] | null {
  const spots: [number, number][] = [];
  for (let y = r.y + 1; y < r.y + H - 1; y++) {
    for (let x = r.x + 2; x < r.x + W - 2; x++) if (canStand(grid, x, y)) spots.push([x, y]);
  }
  return spots.length ? spots[salt % spots.length]! : null;
}
