/**
 * ГЛОБАЛЬНИЙ СТАН ГРИ і всі операції з ним (чисті функції, без Phaser) + збереження в localStorage.
 *
 * Що зберігаємо: фішки на балансі, борг, прокачку, колекцію босів, мішок смерті, шкалу гаранту,
 * прокляття на наступний спуск, стан RNG слота, статистику і налаштування гравця.
 * Сцени не змінюють поля напряму — лише через функції нижче (їх легко тестувати).
 */
import { ECONOMY, TEST_CHIPS, UPGRADES, UPGRADE_EFFECT, WEAPON_PRICES, type UpgradeId } from '../../config/economy';
import { FLASK, PLAYER_COMBAT } from '../../config/combat';
import { SLOT } from '../../config/slot';
import type { WeaponId } from '../../config/weapons';
import type { PlayerLoadout } from '../../entities/Player';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'dodep.save';

export interface Stats {
  /** Скільки фішок поставлено на слоті за весь час («задепано всього»). */
  wagered: number;
  /** Скільки виграно на слоті. */
  won: number;
  /** Скільки виведено на погашення боргу. */
  paidDebt: number;
  /** Нараховано відсотків. */
  interestPaid: number;
  spins: number;
  bonuses: number;
  bossWins: number;
  bossLosses: number;
  runs: number;
  deaths: number;
  deepest: number;
  chipsFarmed: number;
  /** Повернень з підземелля («днів»). */
  days: number;
  /** «Днів без додепу»: скільки повернень поспіль гравець не крутив слот. */
  daysWithoutDodep: number;
}

/** Налаштування гравця (турбо, автоспін). Старі сейви їх не мають — loadGame підставляє значення за замовчуванням. */
export interface Settings {
  /** Турбо-режим слота: швидші барабани і паузи (лише показ — на результат спіна не впливає). */
  slotTurbo: boolean;
  /** Остання вибрана кількість автоспінів; 0 — без ліміту (∞). */
  autoSpins: number;
  /** Зупиняти автоспін на великому виграші («заносі»). */
  autoStopBigWin: boolean;
}

export function defaultSettings(): Settings {
  return { slotTurbo: false, autoSpins: 10, autoStopBigWin: true };
}

/** Налаштування зі сейва: поле відсутнє або зіпсоване → значення за замовчуванням (кожне поле окремо). */
export function normalizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const count = r.autoSpins;
  return {
    slotTurbo: bool(r.slotTurbo, d.slotTurbo),
    autoSpins: typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : d.autoSpins,
    autoStopBigWin: bool(r.autoStopBigWin, d.autoStopBigWin),
  };
}

export interface SaveData {
  version: number;
  balance: number;
  debt: number;
  upgrades: Record<UpgradeId, number>;
  weapons: WeaponId[];
  equipped: WeaponId;
  /** Переможені боси (id), кожен — хоча б раз. */
  bosses: string[];
  /** Мішок смерті: фішки забігу, що лишились на глибині. */
  deathBag: { depth: number; chips: number } | null;
  /** Шкала гаранту 0..100 (%). */
  guarantee: number;
  /** Прокляття на наступний спуск (id з CURSES). */
  nextCurse: string | null;
  /** Стан RNG слота — щоб спіни були відтворювані між сесіями. */
  slotSeed: number;
  /** Лічильник спусків — з нього будується seed підземелля. */
  runCounter: number;
  bet: number;
  spunSinceReturn: boolean;
  victory: boolean;
  stats: Stats;
  settings: Settings;
}

export function newGame(seed = Date.now() >>> 0): SaveData {
  return {
    version: SAVE_VERSION,
    balance: ECONOMY.startBalance,
    debt: ECONOMY.startDebt,
    upgrades: { armor: 0, flask: 0, stamina: 0, hp: 0 },
    weapons: ['sword'],
    equipped: 'sword',
    bosses: [],
    deathBag: null,
    guarantee: 0,
    nextCurse: null,
    slotSeed: seed,
    runCounter: 0,
    bet: SLOT.bets[0]!,
    spunSinceReturn: false,
    victory: false,
    stats: {
      wagered: 0,
      won: 0,
      paidDebt: 0,
      interestPaid: 0,
      spins: 0,
      bonuses: 0,
      bossWins: 0,
      bossLosses: 0,
      runs: 0,
      deaths: 0,
      deepest: 0,
      chipsFarmed: 0,
      days: 0,
      daysWithoutDodep: 0,
    },
    settings: defaultSettings(),
  };
}

// ---------------- збереження ----------------

/** Мінімальний інтерфейс сховища (localStorage або підробка в тестах). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function saveGame(storage: KeyValueStorage, s: SaveData): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // приватний режим / переповнене сховище — гра працює й без збереження
  }
}

/** Завантаження з перевіркою: битий або старий сейв → нова гра (поля, яких бракує, — за замовчуванням). */
export function loadGame(storage: KeyValueStorage): SaveData {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return newGame();
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.version !== SAVE_VERSION || typeof data.balance !== 'number') return newGame();
    const base = newGame(data.slotSeed);
    return {
      ...base,
      ...data,
      upgrades: { ...base.upgrades, ...data.upgrades },
      stats: { ...base.stats, ...data.stats },
      settings: normalizeSettings(data.settings),
      // старі сейви зберігали ставку не з таблиці (напр. 2) — беремо найменшу дозволену
      bet: SLOT.bets.includes(data.bet as number) ? (data.bet as number) : base.bet,
    } as SaveData;
  } catch {
    return newGame();
  }
}

/** Начислити тестові фішки (для перевірки гри). Повертає, скільки додано. */
export function grantTestChips(s: SaveData): number {
  s.balance += TEST_CHIPS;
  return TEST_CHIPS;
}

// ---------------- прокачка ----------------

export function upgradePrice(s: SaveData, id: UpgradeId): number | null {
  return UPGRADES[id].prices[s.upgrades[id]] ?? null;
}

export type BuyResult = 'ok' | 'max' | 'noMoney' | 'owned';

export function buyUpgrade(s: SaveData, id: UpgradeId): BuyResult {
  const price = upgradePrice(s, id);
  if (price === null) return 'max';
  if (s.balance < price) return 'noMoney';
  s.balance -= price;
  s.upgrades[id]++;
  return 'ok';
}

export function buyWeapon(s: SaveData, w: WeaponId): BuyResult {
  if (s.weapons.includes(w)) return 'owned';
  const price = WEAPON_PRICES[w];
  if (s.balance < price) return 'noMoney';
  s.balance -= price;
  s.weapons.push(w);
  s.equipped = w;
  return 'ok';
}

export function equipWeapon(s: SaveData, w: WeaponId): boolean {
  if (!s.weapons.includes(w)) return false;
  s.equipped = w;
  return true;
}

/** Характеристики гравця на початку забігу з урахуванням прокачки (і прокляття). */
export function loadoutOf(s: SaveData, maxHpDelta = 0): PlayerLoadout {
  return {
    weapon: s.equipped,
    armor: s.upgrades.armor,
    maxHp: Math.max(2, PLAYER_COMBAT.maxHp + s.upgrades.hp * UPGRADE_EFFECT.hpPerLevel + maxHpDelta),
    maxStamina: PLAYER_COMBAT.maxStamina + s.upgrades.stamina * UPGRADE_EFFECT.staminaPerLevel,
    flasks: FLASK.count + s.upgrades.flask * UPGRADE_EFFECT.flaskPerLevel,
    flaskHeal: FLASK.heal,
  };
}

// ---------------- борг ----------------

/** Відсотки на борг (округлення вгору, мінімум minInterest). Повертає нараховану суму. */
export function interestFor(debt: number): number {
  if (debt <= 0) return 0;
  return Math.max(ECONOMY.minInterest, Math.ceil(debt * ECONOMY.interestRate));
}

/** Каса: погашення боргу будь-якою сумою (не більше балансу і боргу). Повертає, скільки реально пішло. */
export function payDebt(s: SaveData, amount: number): number {
  const paid = Math.max(0, Math.min(Math.floor(amount), s.balance, s.debt));
  s.balance -= paid;
  s.debt -= paid;
  s.stats.paidDebt += paid;
  return paid;
}

// ---------------- підземелля ----------------

export interface RunResult {
  /** Фішки забігу (до мішка/зарахування). */
  chips: number;
  died: boolean;
  /** Глибина, де закінчився забіг. */
  depth: number;
  /** Чи підібрали мішок смерті в цьому забігу. */
  bagPicked: boolean;
}

export interface ReturnSummary {
  banked: number;
  bagChips: number;
  interest: number;
  bagBurned: number;
}

/** Початок спуску: прокляття «з'їдається» цим забігом. */
export function startRun(s: SaveData): { seed: number; curse: string | null } {
  s.runCounter++;
  s.stats.runs++;
  const curse = s.nextCurse;
  s.nextCurse = null;
  return { seed: (s.slotSeed ^ Math.imul(s.runCounter, 0x9e3779b1)) >>> 0, curse };
}

/**
 * Повернення з підземелля (ліфтом або смертю). Тут же — мішок смерті і відсотки.
 *  - вийшов ліфтом: фішки забігу → на баланс;
 *  - помер: фішки забігу лишаються «мішком» на глибині смерті; старий непідібраний мішок згорає;
 *  - після кожного повернення на борг нараховуються відсотки, минає «день».
 */
export function finishRun(s: SaveData, r: RunResult): ReturnSummary {
  let banked = 0;
  let bagChips = 0;
  let bagBurned = 0;
  if (r.bagPicked) s.deathBag = null;
  if (r.died) {
    s.stats.deaths++;
    if (s.deathBag) bagBurned = s.deathBag.chips;
    s.deathBag = r.chips > 0 ? { depth: r.depth, chips: r.chips } : null;
    bagChips = r.chips;
  } else {
    banked = r.chips;
    s.balance += banked;
    s.stats.chipsFarmed += banked;
  }
  s.stats.deepest = Math.max(s.stats.deepest, r.depth);
  const interest = interestFor(s.debt);
  s.debt += interest;
  s.stats.interestPaid += interest;
  s.stats.days++;
  s.stats.daysWithoutDodep = s.spunSinceReturn ? 0 : s.stats.daysWithoutDodep + 1;
  s.spunSinceReturn = false;
  return { banked, bagChips, interest, bagBurned };
}

// ---------------- перемога ----------------

export function canExit(s: SaveData, allBossIds: readonly string[]): boolean {
  return s.debt <= 0 && allBossIds.every((id) => s.bosses.includes(id));
}
