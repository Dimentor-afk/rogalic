/**
 * Застосування результатів слота до стану гри (чисті функції): баланс, статистика, гарант, прокляття.
 */
import { BOSSES, BOSS_ORDER } from '../../config/bosses';
import { CURSES } from '../../config/curses';
import { SLOT } from '../../config/slot';
import type { SaveData } from '../state/GameState';
import { nextGuarantee, type SlotRng, type SpinResult } from './slot';

/** Чиї скатери на барабанах: усі звичайні боси (і переможені — щоб фармити), фінальний — лише після всіх інших. */
export function availableBosses(s: SaveData): string[] {
  const regular = BOSS_ORDER.filter((id) => !BOSSES[id]!.final);
  const allBeaten = regular.every((id) => s.bosses.includes(id));
  return BOSS_ORDER.filter((id) => !BOSSES[id]!.final || allBeaten);
}

export function canAfford(s: SaveData, cost: number): boolean {
  return s.balance >= cost;
}

/** Списати ставку (до анімації). */
export function chargeSpin(s: SaveData, bet: number): void {
  s.balance -= bet;
  s.stats.wagered += bet;
  s.stats.spins++;
  s.spunSinceReturn = true;
}

export interface SpinOutcome {
  /** Нове прокляття (id), якщо випало. */
  curse: string | null;
}

/** Зарахувати результат основного спіна. Прокляття обирається тим самим RNG слота. */
export function settleSpin(s: SaveData, r: SpinResult, rng: SlotRng): SpinOutcome {
  s.balance += r.win;
  s.stats.won += r.win;
  s.guarantee = nextGuarantee(s.guarantee, r);
  let curse: string | null = null;
  if (r.curseTriggered) {
    const ids = Object.keys(CURSES);
    curse = ids[Math.floor(rng.next() * ids.length)]!;
    s.nextCurse = curse;
  }
  if (r.bonusBoss) s.stats.bonuses++;
  return { curse };
}

/** «Купити бонус»: ціна в ставках. */
export function buyBonusCost(bet: number): number {
  return bet * SLOT.buyBonusBets;
}

export function chargeBuyBonus(s: SaveData, bet: number): boolean {
  const cost = buyBonusCost(bet);
  if (s.balance < cost) return false;
  s.balance -= cost;
  s.stats.wagered += cost;
  s.stats.bonuses++;
  s.spunSinceReturn = true;
  return true;
}

/** Виграш серії фріспінів. */
export function settleFreeSpins(s: SaveData, win: number): void {
  s.balance += win;
  s.stats.won += win;
}

/** Перемога над босом: у колекцію (повторна — лише фріспіни). Повертає true, якщо бос новий. */
export function recordBossWin(s: SaveData, bossId: string): boolean {
  s.stats.bossWins++;
  if (s.bosses.includes(bossId)) return false;
  s.bosses.push(bossId);
  return true;
}
