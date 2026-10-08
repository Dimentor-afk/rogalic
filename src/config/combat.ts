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
  hurtStunMs: 280,
};

/** Перекат (анімація roll — 4 кадри на всю тривалість; ≈5 тайлів уперед). */
export const ROLL = {
  durationMs: 380,
  /** Невразливість з початку перекату (~0.3 с за ТЗ). */
  iFramesMs: 300,
  speed: 225,
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

/** Фляги «Енергетик». Анімація heal (8 кадрів) розтягується на drinkMs. */
export const FLASK = {
  count: 3,
  /** Скільки HP повертає одна фляга. */
  heal: 5,
  drinkMs: 1100,
  /**
   * У який момент лікування спрацьовує (удар до цього — фляга пропала):
   * кадр 3 з 8, де лицар спалахує червоним, починається на 3/8 · 1100 ≈ 413 мс.
   */
  gulpAtMs: 415,
};

/**
 * Удар у стрибку — пікірування (анімація air_attack: 0 — завис і розвернув меч униз,
 * 1–2 — падіння зі слідом, 3–6 — приземлення з ударною хвилею по землі).
 * Б'є всіх, крізь кого пролітає, а при приземленні — ще й усіх поруч на землі.
 */
export const AIR_ATTACK = {
  staminaCost: 20,
  /** Коротке «зависання» перед падінням — телеграф і шанс прицілитись. */
  hoverMs: 90,
  diveSpeed: 480,
  /** Удар вістрям під час падіння: коло такого радіуса біля ніг. */
  diveDamage: 10,
  diveRadius: 14,
  diveKnockback: 90,
  /** Ударна хвиля при приземленні: коло на рівні землі. */
  landDamage: 8,
  landRadius: 34,
  landKnockback: 200,
  /** Скільки стоїмо після приземлення (кадри 3–6). */
  landRecoveryMs: 340,
  frames: { hover: [0], dive: [1, 2], land: [3, 4, 5, 6] },
  /** Як часто перемикати кадри сліду під час падіння. */
  diveFrameMs: 70,
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
