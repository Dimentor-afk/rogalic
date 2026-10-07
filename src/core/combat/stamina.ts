/**
 * Стаміна «Нерви».
 * Атака, перекат і блок її тратять. Відновлення починається через regenDelayMs після останньої витрати
 * і лише коли гравець нічого з цього не робить (busy = false: не атакує, не котиться, не тримає блок).
 * Souls-правило: дію можна почати, якщо стаміни більше нуля, навіть якщо її менше за вартість —
 * тоді вона падає до нуля (а не в мінус).
 */

export interface Stamina {
  value: number;
  max: number;
  /** Час (мс) останньої витрати — від нього рахується затримка відновлення. */
  lastSpentAt: number;
}

export interface StaminaRules {
  regenPerSec: number;
  regenDelayMs: number;
}

export function createStamina(max: number): Stamina {
  return { value: max, max, lastSpentAt: -Infinity };
}

export function canAct(s: Stamina): boolean {
  return s.value > 0;
}

/** Витрачає стаміну. Повертає false (і нічого не змінює), якщо стаміни нема зовсім. */
export function spend(s: Stamina, cost: number, now: number): boolean {
  if (!canAct(s)) return false;
  s.value = Math.max(0, s.value - cost);
  s.lastSpentAt = now;
  return true;
}

/** Примусова витрата (напр. блок удару): може обнулити стаміну, повертає, скільки «не вистачило». */
export function drain(s: Stamina, cost: number, now: number): number {
  const shortage = Math.max(0, cost - s.value);
  s.value = Math.max(0, s.value - cost);
  s.lastSpentAt = now;
  return shortage;
}

export function tick(s: Stamina, rules: StaminaRules, dtMs: number, now: number, busy: boolean): void {
  if (busy || now - s.lastSpentAt < rules.regenDelayMs) return;
  s.value = Math.min(s.max, s.value + (rules.regenPerSec * dtMs) / 1000);
}
