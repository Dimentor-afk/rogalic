/** Загальні налаштування гри. */
export const GAME = {
  /** Внутрішня роздільність. Канвас масштабується до вікна (FIT), піксель-арт без розмиття. */
  width: 480,
  height: 270,
  /** Гравітація світу, px/с². */
  gravity: 900,
  backgroundColor: '#0b0a0d',
};

/** Паралакс фонів печери: ключ зображення і швидкість відносно камери (0 — нерухомий). */
export const CAVE_PARALLAX: readonly { key: string; factor: number }[] = [
  { key: 'backgrounds/cave_1', factor: 0.05 },
  { key: 'backgrounds/cave_2', factor: 0.15 },
  { key: 'backgrounds/cave_3', factor: 0.3 },
  { key: 'backgrounds/cave_4', factor: 0.5 },
];
