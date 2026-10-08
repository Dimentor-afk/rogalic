/**
 * СЛОТ-МАШИНА: сітка, лінії, символи, ваги, виплати, гарант, фріспіни, модель гравця для симуляції RTP.
 * Логіка (src/core/slot/slot.ts) не знає конкретних символів — лише їх типи (kind).
 * Перевірка балансу: `npm run sim` (1 000 000 спінів → RTP, частота бонусок, розподіл виграшів).
 */

export type SymbolKind = 'low' | 'mid' | 'high' | 'wild' | 'scatter' | 'curse' | 'multiplier';

export interface SymbolDef {
  id: string;
  /** Підпис на заглушці. */
  label: string;
  kind: SymbolKind;
  /** Колір заглушки. */
  color: string;
  /** Вага в основній грі (для скатерів — сумарна вага всіх скатерів, ділиться між доступними босами). */
  weight: number;
  /** Вага у фріспінах (скатерів і прокляття там немає). */
  fsWeight?: number;
  /** Виплата за 3, 4, 5 однакових на лінії — у ставках на лінію (ставка на лінію = ставка / кількість ліній). */
  pays?: [number, number, number];
}

/** Тип фріспінів боса: які символи-множники і як часто випадають. */
export interface FreeSpinType {
  name: string;
  /** Вага кожного множника у фріспінах (x2, x5, x10, x25). */
  multipliers: Record<number, number>;
}

export const SLOT = {
  cols: 5,
  rows: 3,
  /** 20 ліній виплат: індекс рядка (0 — верхній) для кожного барабана. */
  paylines: [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [0, 1, 1, 1, 0],
    [2, 1, 1, 1, 2],
    [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1],
    [0, 1, 0, 1, 0],
    [2, 1, 2, 1, 2],
    [1, 1, 0, 1, 1],
    [1, 1, 2, 1, 1],
    [0, 0, 2, 0, 0],
    [2, 2, 0, 2, 2],
    [0, 2, 0, 2, 0],
  ] as readonly (readonly number[])[],
  /** Доступні ставки (фішки за спін). */
  bets: [10, 20, 50, 100, 250, 500] as readonly number[],
  /** «Купити бонус»: ціна в ставках. */
  buyBonusBets: 100,
  /** Скільки скатерів будь-де запускають бонуску. */
  scattersForBonus: 3,
  /** Скільки символів прокляття запускають прокляття. */
  cursesForCurse: 3,
  /** Шкала гаранту: +perScatter % за кожен скатер у спіні без бонуски; 100% → наступний спін з гарантованою бонуською. */
  guarantee: { perScatter: 1, max: 100 },
  freeSpins: 10,
  /** Near-miss: якщо вже видно стільки скатерів, решта барабанів крутиться довше. */
  nearMiss: { scatters: 2, extraMs: 900 },
};

export const SYMBOLS: SymbolDef[] = [
  { id: 'ten', label: '10', kind: 'low', color: '#4a8fd8', weight: 140, pays: [9, 28, 90] },
  { id: 'jack', label: 'J', kind: 'low', color: '#4caf6a', weight: 140, pays: [9, 27, 90] },
  { id: 'queen', label: 'Q', kind: 'low', color: '#a46ae0', weight: 120, pays: [9, 36, 108] },
  { id: 'king', label: 'K', kind: 'low', color: '#e0844a', weight: 110, pays: [9, 36, 135] },
  { id: 'chip', label: 'ФІШКА', kind: 'mid', color: '#d8404f', weight: 90, pays: [18, 54, 180] },
  { id: 'energy', label: 'ЕНЕРГ', kind: 'mid', color: '#3ad87a', weight: 85, pays: [18, 63, 216] },
  { id: 'dice', label: 'КУБИК', kind: 'mid', color: '#e8e8f0', weight: 80, pays: [18, 72, 270] },
  { id: 'gold', label: 'ЗЛИТОК', kind: 'high', color: '#ffc83a', weight: 55, pays: [27, 108, 450] },
  { id: 'seven', label: '777', kind: 'high', color: '#ff3040', weight: 40, pays: [36, 180, 900] },
  { id: 'wild', label: 'WILD', kind: 'wild', color: '#ff4ad8', weight: 40, fsWeight: 47, pays: [45, 270, 1800] },
  // скатери: вага на всіх босів разом; конкретні — `sc:<id боса>`
  { id: 'scatter', label: 'БОС', kind: 'scatter', color: '#7a2a2a', weight: 16 },
  { id: 'curse', label: 'ПРОКЛ', kind: 'curse', color: '#6a3ad0', weight: 20 },
  // множники — лише у фріспінах (вага задає тип фріспінів боса)
  { id: 'x2', label: 'x2', kind: 'multiplier', color: '#ffd25a', weight: 0 },
  { id: 'x5', label: 'x5', kind: 'multiplier', color: '#ffb02a', weight: 0 },
  { id: 'x10', label: 'x10', kind: 'multiplier', color: '#ff7a1a', weight: 0 },
  { id: 'x25', label: 'x25', kind: 'multiplier', color: '#ff3a1a', weight: 0 },
];

/** Значення символу-множника. */
export const MULTIPLIER_VALUE: Record<string, number> = { x2: 2, x5: 5, x10: 10, x25: 25 };

/**
 * Модель гравця для симуляції RTP: бонуска — це бій з босом, і результат залежить від гравця.
 * Стартовий множник фріспінів = 5 (без шкоди) + 2 (без фляг) + 2 (швидко), мінімум 1.
 */
export const SIM_PLAYER_MODEL = {
  bossWinRate: 0.7,
  noDamageChance: 0.12,
  noFlaskChance: 0.5,
  fastChance: 0.3,
};

/** Цільовий діапазон RTP (перевіряє симуляція). */
export const TARGET_RTP = { min: 0.94, max: 0.96 };
