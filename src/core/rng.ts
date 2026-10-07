/**
 * Детермінований генератор випадкових чисел з seed.
 * Потрібен скрізь, де важлива відтворюваність: генерація підземелля, спіни слота, варіанти тайлів.
 */

/**
 * mulberry32 — маленький швидкий PRNG з 32-бітним станом.
 * Кожен виклик зсуває стан на «золоту» константу і перемішує біти множеннями та XOR-зсувами.
 * Повертає число в [0, 1). Однаковий seed → однакова послідовність.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Хеш кількох цілих у одне 32-бітне число (без стану).
 * Використовуємо для «випадкового, але стабільного» вибору: напр. варіант тайла в клітинці (x, y)
 * завжди той самий для того самого seed, незалежно від порядку обходу.
 */
export function hash32(...values: number[]): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (const v of values) {
    h ^= v | 0;
    h = Math.imul(h, 0x01000193); // FNV prime
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Вибір елемента з урахуванням ваг. r — число в [0, 1). */
export function weightedPick<T>(items: readonly T[], weights: readonly number[] | undefined, r: number): T {
  if (items.length === 0) throw new Error('weightedPick: порожній список');
  if (!weights) return items[Math.floor(r * items.length)]!;
  const total = weights.reduce((s, w) => s + w, 0);
  let x = r * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i] ?? 0;
    if (x < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}
