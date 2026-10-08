/**
 * ЛОГІКА СЛОТА — чисті функції без Phaser (їх використовують і гра, і тести, і симуляція RTP).
 *
 * Результат спіна рахується ПОВНІСТЮ ДО анімації: UI лише показує готову сітку.
 * Кожна клітинка сітки 5×3 — незалежний зважений вибір символу (ваги з конфігу).
 *
 * Виплати по лініях: йдемо лінією зліва направо; перший не-wild символ визначає символ лінії,
 * wild підміняє будь-який платний символ (не скатер/прокляття). Рахуємо, скільки поспіль від першого
 * барабана; 3+ → виплата з таблиці. Якщо чисті wild-и вигідніші — платимо за них.
 * Виграш у фішках = ⌊сума виплат (у ставках на лінію) · ставка / кількість ліній⌋.
 */
import { MULTIPLIER_VALUE, SLOT, SYMBOLS, type FreeSpinType, type SymbolDef } from '../../config/slot';

// ---------------- RNG зі станом, який можна зберегти ----------------

/** Крок mulberry32: повертає [число в [0,1), новий стан]. Стан зберігаємо в сейві — спіни відтворювані. */
export function nextRandom(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

export class SlotRng {
  constructor(public state: number) {}
  next(): number {
    const [v, s] = nextRandom(this.state);
    this.state = s;
    return v;
  }
}

// ---------------- символи і таблиці ваг ----------------

const BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]));

export function symbolDef(id: string): SymbolDef | undefined {
  if (id.startsWith('sc:')) return BY_ID.get('scatter');
  return BY_ID.get(id);
}

export function isScatter(id: string): boolean {
  return id.startsWith('sc:');
}

export function scatterBoss(id: string): string {
  return id.slice(3);
}

interface WeightTable {
  ids: string[];
  /** Кумулятивні ваги для бінарного пошуку. */
  cum: number[];
  total: number;
}

function makeTable(entries: [string, number][]): WeightTable {
  const ids: string[] = [];
  const cum: number[] = [];
  let total = 0;
  for (const [id, w] of entries) {
    if (w <= 0) continue;
    total += w;
    ids.push(id);
    cum.push(total);
  }
  return { ids, cum, total };
}

function draw(t: WeightTable, r: number): string {
  const x = r * t.total;
  // бінарний пошук першої кумулятивної ваги > x
  let lo = 0;
  let hi = t.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t.cum[mid]! > x) hi = mid;
    else lo = mid + 1;
  }
  return t.ids[lo]!;
}

/** Таблиця основної гри: вага скатерів ділиться порівну між доступними босами. */
export function baseTable(availableBosses: readonly string[]): WeightTable {
  const entries: [string, number][] = [];
  for (const s of SYMBOLS) {
    if (s.kind === 'multiplier') continue;
    if (s.kind === 'scatter') {
      for (const b of availableBosses) entries.push([`sc:${b}`, s.weight / availableBosses.length]);
    } else entries.push([s.id, s.weight]);
  }
  return makeTable(entries);
}

/** Таблиця фріспінів: без скатерів і прокляття, з множниками за типом фріспінів боса. */
export function freeSpinTable(fs: FreeSpinType): WeightTable {
  const entries: [string, number][] = [];
  for (const s of SYMBOLS) {
    if (s.kind === 'scatter' || s.kind === 'curse' || s.kind === 'multiplier') continue;
    entries.push([s.id, s.fsWeight ?? s.weight]);
  }
  for (const [value, w] of Object.entries(fs.multipliers)) entries.push([`x${value}`, w]);
  return makeTable(entries);
}

// ---------------- оцінка сітки ----------------

/** grid[col][row] */
export type Grid = string[][];

export interface LineWin {
  line: number;
  symbol: string;
  count: number;
  /** Виплата у ставках на лінію. */
  units: number;
}

function pays(id: string, count: number): number {
  const d = symbolDef(id);
  return count >= 3 && d?.pays ? d.pays[count - 3]! : 0;
}

function substitutable(id: string): boolean {
  const k = symbolDef(id)?.kind;
  return k === 'low' || k === 'mid' || k === 'high';
}

export function evaluateLine(grid: Grid, line: readonly number[], index: number): LineWin | null {
  const cells = line.map((row, col) => grid[col]![row]!);
  // 1) варіант «лише wild-и» від початку
  let wildCount = 0;
  while (wildCount < cells.length && cells[wildCount] === 'wild') wildCount++;
  const wildUnits = pays('wild', wildCount);
  // 2) варіант «символ + wild-и»
  const first = cells.find((c) => c !== 'wild');
  let symUnits = 0;
  let symCount = 0;
  if (first && substitutable(first)) {
    while (symCount < cells.length && (cells[symCount] === first || cells[symCount] === 'wild')) symCount++;
    symUnits = pays(first, symCount);
  }
  if (wildUnits === 0 && symUnits === 0) return null;
  return wildUnits >= symUnits
    ? { line: index, symbol: 'wild', count: wildCount, units: wildUnits }
    : { line: index, symbol: first!, count: symCount, units: symUnits };
}

export function evaluateLines(grid: Grid): LineWin[] {
  const wins: LineWin[] = [];
  SLOT.paylines.forEach((line, i) => {
    const w = evaluateLine(grid, line, i);
    if (w) wins.push(w);
  });
  return wins;
}

export function unitsToChips(units: number, bet: number, multiplier = 1): number {
  return Math.floor((units * bet * multiplier) / SLOT.paylines.length);
}

// ---------------- спін ----------------

export interface SpinInput {
  bet: number;
  /** Боси, чиї скатери зараз на барабанах. */
  availableBosses: readonly string[];
  /** Шкала гаранту заповнена → цей спін гарантує бонуску. */
  guaranteeFull: boolean;
  rng: SlotRng;
}

export interface SpinResult {
  grid: Grid;
  lineWins: LineWin[];
  /** Сума виплат у ставках на лінію. */
  units: number;
  /** Виграш у фішках. */
  win: number;
  scatters: Record<string, number>;
  totalScatters: number;
  /** Бос бонуски (null — бонуски немає). */
  bonusBoss: string | null;
  curses: number;
  curseTriggered: boolean;
  /** Бонуска з'явилась завдяки гаранту. */
  guaranteed: boolean;
}

function fillGrid(table: WeightTable, rng: SlotRng): Grid {
  const g: Grid = [];
  for (let c = 0; c < SLOT.cols; c++) {
    const col: string[] = [];
    for (let r = 0; r < SLOT.rows; r++) col.push(draw(table, rng.next()));
    g.push(col);
  }
  return g;
}

function countScatters(grid: Grid): Record<string, number> {
  const out: Record<string, number> = {};
  for (const col of grid) for (const id of col) if (isScatter(id)) out[scatterBoss(id)] = (out[scatterBoss(id)] ?? 0) + 1;
  return out;
}

/** Бос бонуски: чиїх скатерів найбільше; при рівності — випадково серед лідерів. */
export function pickBonusBoss(scatters: Record<string, number>, rng: SlotRng): string | null {
  const total = Object.values(scatters).reduce((a, b) => a + b, 0);
  if (total < SLOT.scattersForBonus) return null;
  const max = Math.max(...Object.values(scatters));
  const leaders = Object.keys(scatters)
    .filter((b) => scatters[b] === max)
    .sort();
  return leaders[Math.floor(rng.next() * leaders.length)]!;
}

/**
 * Гарант: якщо бонуски не випало, ставимо 3 скатери одного (випадкового доступного) боса
 * на випадкові клітинки трьох різних барабанів.
 */
function forceBonus(grid: Grid, available: readonly string[], rng: SlotRng): void {
  const boss = available[Math.floor(rng.next() * available.length)]!;
  const cols = [0, 1, 2, 3, 4];
  for (let i = cols.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [cols[i], cols[j]] = [cols[j]!, cols[i]!];
  }
  // прибираємо наявні скатери інших босів, щоб не було нічиїх
  for (const col of grid) for (let r = 0; r < col.length; r++) if (isScatter(col[r]!)) col[r] = 'ten';
  for (const c of cols.slice(0, SLOT.scattersForBonus)) grid[c]![Math.floor(rng.next() * SLOT.rows)] = `sc:${boss}`;
}

export function spin(input: SpinInput): SpinResult {
  const { rng } = input;
  const grid = fillGrid(baseTable(input.availableBosses), rng);
  let scatters = countScatters(grid);
  let bonusBoss = pickBonusBoss(scatters, rng);
  let guaranteed = false;
  if (!bonusBoss && input.guaranteeFull && input.availableBosses.length) {
    forceBonus(grid, input.availableBosses, rng);
    scatters = countScatters(grid);
    bonusBoss = pickBonusBoss(scatters, rng);
    guaranteed = true;
  }
  const lineWins = evaluateLines(grid);
  const units = lineWins.reduce((s, w) => s + w.units, 0);
  const curses = grid.flat().filter((id) => id === 'curse').length;
  return {
    grid,
    lineWins,
    units,
    win: unitsToChips(units, input.bet),
    scatters,
    totalScatters: Object.values(scatters).reduce((a, b) => a + b, 0),
    bonusBoss,
    curses,
    curseTriggered: curses >= SLOT.cursesForCurse,
    guaranteed,
  };
}

/** Нове значення шкали гаранту після спіна. */
export function nextGuarantee(current: number, r: SpinResult): number {
  if (r.bonusBoss) return 0;
  return Math.min(SLOT.guarantee.max, current + r.totalScatters * SLOT.guarantee.perScatter);
}

// ---------------- фріспіни ----------------

export interface FreeSpinResult {
  grid: Grid;
  lineWins: LineWin[];
  units: number;
  /** Множники, що випали в цьому спіні. */
  multipliers: number[];
}

export function freeSpin(fs: FreeSpinType, rng: SlotRng): FreeSpinResult {
  const grid = fillGrid(freeSpinTable(fs), rng);
  const lineWins = evaluateLines(grid);
  const multipliers = grid.flat().filter((id) => id in MULTIPLIER_VALUE).map((id) => MULTIPLIER_VALUE[id]!);
  return { grid, lineWins, units: lineWins.reduce((s, w) => s + w.units, 0), multipliers };
}

export interface FreeSpinSeries {
  spins: FreeSpinResult[];
  startMultiplier: number;
  /** Загальний множник серії = стартовий + сума всіх множників, що випали. */
  totalMultiplier: number;
  units: number;
  win: number;
}

/** Уся серія фріспінів наперед (UI показує її спін за спіном). Усі виграші серії множаться на загальний множник. */
export function runFreeSpins(fs: FreeSpinType, bet: number, startMultiplier: number, rng: SlotRng, count = SLOT.freeSpins): FreeSpinSeries {
  const spins: FreeSpinResult[] = [];
  let mult = startMultiplier;
  let units = 0;
  for (let i = 0; i < count; i++) {
    const s = freeSpin(fs, rng);
    spins.push(s);
    units += s.units;
    for (const m of s.multipliers) mult += m;
  }
  return { spins, startMultiplier, totalMultiplier: mult, units, win: unitsToChips(units, bet, mult) };
}

/** Стартовий множник фріспінів за результатами бою з босом (значення — з конфігу боса). */
export function startMultiplierFor(fight: { noDamage: boolean; noFlasks: boolean; fast: boolean }, values = { noDamage: 5, noFlasks: 2, fast: 2 }): number {
  const m = (fight.noDamage ? values.noDamage : 0) + (fight.noFlasks ? values.noFlasks : 0) + (fight.fast ? values.fast : 0);
  return Math.max(1, m);
}
