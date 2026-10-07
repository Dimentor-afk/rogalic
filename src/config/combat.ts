/**
 * Баланс бою гравця. Час — мс, швидкості — px/с. HP рахуємо в «половинках сердець»: 10 HP = 5 сердець.
 */
export const PLAYER_COMBAT = {
  maxHp: 10,
  /** Стаміна «Нерви». */
  maxStamina: 100,
  staminaRegenPerSec: 60,
  staminaRegenDelayMs: 450,

  /** Після отримання удару: невразливість, відкидання, оглушення. */
  hurtIFramesMs: 750,
  hurtKnockbackX: 150,
  hurtKnockbackY: -120,
  hurtStunMs: 260,
};

export const ROLL = {
  durationMs: 360,
  /** Невразливість з початку перекату (~0.3 с за ТЗ). */
  iFramesMs: 300,
  speed: 235,
  staminaCost: 24,
  /** Як часто лишати «слід» (after-image), мс. */
  afterImageEveryMs: 30,
};

export const BLOCK = {
  /** Стаміна за кожну одиницю заблокованої шкоди. */
  staminaPerDamage: 14,
  moveMultiplier: 0.35,
  /** Паріру: блок натиснуто не раніше, ніж за стільки мс до удару. */
  parryWindowMs: 150,
  /** Скільки ворог оглушений після паріру. */
  parryStunMs: 1500,
  /** Наступний удар по оглушеному паріру ворогу — критичний. */
  critMultiplier: 2.5,
  /** Пробитий блок: гравець коротко «зависає». */
  guardBreakStunMs: 450,
};

/** Фляги «Енергетик». */
export const FLASK = {
  count: 3,
  /** Скільки HP повертає одна фляга. */
  heal: 5,
  drinkMs: 900,
  /** У який момент анімації лікування спрацьовує (удар до цього — фляга пропала). */
  gulpAtMs: 520,
  moveMultiplier: 0.25,
};

/** «Відчуття удару». */
export const HIT_FEEL = {
  hitstopMs: 55,
  heavyHitstopMs: 95,
  critHitstopMs: 140,
  playerHurtHitstopMs: 110,
  parryHitstopMs: 160,
  shakeMs: 100,
  shakeIntensity: 0.0035,
  heavyShakeIntensity: 0.007,
  flashMs: 90,
};
