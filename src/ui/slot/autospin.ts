/**
 * АВТОСПІН: варіанти кількості і правила зупинки (чисті функції — тестуються без Phaser).
 * Автоспін лише натискає «крутити» замість гравця: та сама ставка і той самий RNG; бонус він ніколи не купує.
 */

/** Варіанти кількості; 0 — без ліміту (∞). */
export const AUTO_COUNTS: readonly number[] = [10, 25, 50, 100, 0];

/** «Занос»: виграш від стількох ставок зупиняє автоспін (якщо гравець не вимкнув цю зупинку). */
export const AUTO_BIG_WIN_BETS = 50;

export type AutoStop = 'bonus' | 'curse' | 'bigWin' | 'noFunds' | 'done' | 'manual';

/** Індекс кількості у виборі; невідома кількість (старий сейв) → перший варіант. */
export function autoCountIndex(count: number): number {
  return Math.max(0, AUTO_COUNTS.indexOf(count));
}

/** Скільки спінів крутити: 0 у налаштуваннях означає «поки не зупиниш». */
export function autoSpinsToRun(count: number): number {
  return count === 0 ? Infinity : count;
}

export interface AutoCheck {
  win: number;
  bet: number;
  /** Баланс після спіна. */
  balance: number;
  bonus: boolean;
  curse: boolean;
  /** Скільки спінів лишилось після цього (Infinity — без ліміту). */
  left: number;
  stopOnBigWin: boolean;
}

/** Чи зупиняти автоспін після спіна. Бонуска і прокляття зупиняють завжди, далі — занос, гроші, ліміт. */
export function autoStopReason(c: AutoCheck): AutoStop | null {
  if (c.bonus) return 'bonus';
  if (c.curse) return 'curse';
  if (c.stopOnBigWin && c.win >= c.bet * AUTO_BIG_WIN_BETS) return 'bigWin';
  if (c.balance < c.bet) return 'noFunds';
  if (c.left <= 0) return 'done';
  return null;
}

/** Підпис причини зупинки для панелі автоспіну. */
export function autoStopNote(reason: AutoStop, done: number, win: number, bet: number): string {
  switch (reason) {
    case 'bonus':
      return 'стоп: бонуска!';
    case 'curse':
      return 'стоп: прокляття';
    case 'bigWin':
      return `стоп: занос x${Math.floor(win / bet)}`;
    case 'noFunds':
      return 'стоп: мало фішок';
    case 'done':
      return `готово: ${done} спінів`;
    case 'manual':
      return 'зупинено вручну';
  }
}
