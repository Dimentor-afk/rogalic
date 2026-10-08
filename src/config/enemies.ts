/**
 * ВОРОГИ. Логіка знає лише архетипи (поведінки), а не конкретних ворогів.
 * Новий ворог = спрайт у маніфесті (src/config/assets.ts) + запис тут.
 *
 * Архетипи:
 *  fast     — швидкий слабкий: часто атакує, коротке телеграфування, удар перериває його замах;
 *  heavy    — повільний важкий: сильний удар, довге телеграфування, не збивається з замаху;
 *  ranged   — дальній: тримає дистанцію, стріляє снарядами;
 *  splitter — ділиться при смерті на N менших копій;
 *  thief    — при ударі краде частину фішок забігу і тікає; вбив — фішки повертаються.
 * Шкода — у половинках сердець (у гравця 10 = 5 сердець).
 * Вороги — павуки і демонята; великі істоти (голем, демон, королі) — боси (src/config/bosses.ts).
 * Масштаб — лише цілі числа (2, 3): так піксель-арт лишається рівним.
 */

export type Archetype = 'fast' | 'heavy' | 'ranged' | 'splitter' | 'thief';

export interface EnemyAttackDef {
  /** Наскільки далеко перед тілом ворога сягає удар, px. */
  reach: number;
  /** Висота зони удару, px. */
  height: number;
  damage: number;
  /** Телеграф (замах): ворог зупиняється, блимає білим, тремтить. */
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
  cooldownMs: number;
  /** Ривок уперед в активній фазі, px/с (для ворогів без анімації атаки — це і є «удар»). */
  lungeSpeed: number;
  /** З якої горизонтальної відстані до гравця починати атаку, px. */
  triggerRange: number;
}

export interface EnemyProjectileDef {
  /** Ключ FX-анімації снаряда. */
  fx: string;
  speed: number;
  size: number;
  lifetimeMs: number;
  damage: number;
  /** Чи можна заблокувати/парирувати. */
  blockable: boolean;
}

export interface EnemyDef {
  id: string;
  name: string;
  /** Ключ спрайта з маніфесту. */
  sprite: string;
  archetype: Archetype;
  hp: number;
  speed: number;
  /** Нагорода фішками [мін, макс] на глибині 1. */
  chips: [number, number];
  /** На якій відстані помічає гравця, px (і лише якщо є пряма видимість). */
  aggroRange: number;
  attack: EnemyAttackDef;
  /** 0 — відлітає від кожного удару, 1 — не зрушити. */
  knockbackResist?: number;
  /** Літає (без гравітації). */
  flying?: boolean;
  scale?: number;
  tint?: number;
  ranged?: { projectile: EnemyProjectileDef; preferredDistance: number; fireRange: number };
  split?: { into: string; count: number };
  steal?: { fraction: number; minChips: number; fleeSpeed: number; escapeMs: number };
  /** Поява в підземеллі: з якої глибини і як часто (вага). */
  spawn?: { minDepth: number; weight: number };
}

export const ENEMIES: Record<string, EnemyDef> = {
  // Усі вороги — павуки й демонята з паків вищої роздільності, збільшені вдвічі (ціле число — пікселі лишаються рівними).
  spider: {
    id: 'spider',
    name: 'Павук-ростовщик',
    sprite: 'spider_black',
    archetype: 'fast',
    scale: 2,
    hp: 22,
    speed: 105,
    chips: [30, 50],
    aggroRange: 200,
    attack: { reach: 22, height: 26, damage: 1, windupMs: 230, activeMs: 140, recoveryMs: 300, cooldownMs: 600, lungeSpeed: 230, triggerRange: 40 },
    knockbackResist: 0.2,
    spawn: { minDepth: 1, weight: 10 },
  },
  spiderBrute: {
    id: 'spiderBrute',
    name: 'Павук-вишибала',
    sprite: 'spider_brown',
    archetype: 'heavy',
    scale: 2,
    hp: 60,
    speed: 48,
    chips: [60, 100],
    aggroRange: 190,
    attack: { reach: 30, height: 32, damage: 3, windupMs: 620, activeMs: 170, recoveryMs: 560, cooldownMs: 850, lungeSpeed: 110, triggerRange: 44 },
    knockbackResist: 0.85,
    tint: 0xd8c0a8,
    spawn: { minDepth: 2, weight: 5 },
  },
  spiderSpitter: {
    id: 'spiderSpitter',
    name: 'Павук-бухгалтер',
    sprite: 'spider_aqua',
    archetype: 'ranged',
    scale: 2,
    hp: 24,
    speed: 60,
    chips: [40, 70],
    aggroRange: 230,
    attack: { reach: 18, height: 24, damage: 1, windupMs: 480, activeMs: 80, recoveryMs: 420, cooldownMs: 1400, lungeSpeed: 0, triggerRange: 200 },
    knockbackResist: 0.2,
    ranged: {
      // плює «штрафами» — водяна куля; можна заблокувати і відбити паріруванням
      projectile: { fx: 'waterBall', speed: 160, size: 12, lifetimeMs: 2400, damage: 2, blockable: true },
      preferredDistance: 120,
      fireRange: 210,
    },
    spawn: { minDepth: 2, weight: 5 },
  },
  spiderVenom: {
    id: 'spiderVenom',
    name: 'Павук-колектор',
    sprite: 'spider_purple',
    archetype: 'fast',
    scale: 2,
    hp: 32,
    speed: 120,
    chips: [50, 80],
    aggroRange: 210,
    attack: { reach: 24, height: 26, damage: 2, windupMs: 210, activeMs: 140, recoveryMs: 280, cooldownMs: 550, lungeSpeed: 260, triggerRange: 46 },
    knockbackResist: 0.3,
    spawn: { minDepth: 4, weight: 6 },
  },
  creditBlob: {
    id: 'creditBlob',
    name: 'Кровосос-кредит',
    sprite: 'bloodling',
    archetype: 'splitter',
    scale: 3,
    hp: 34,
    speed: 40,
    chips: [40, 60],
    aggroRange: 170,
    attack: { reach: 18, height: 30, damage: 2, windupMs: 440, activeMs: 160, recoveryMs: 380, cooldownMs: 650, lungeSpeed: 150, triggerRange: 34 },
    knockbackResist: 0.4,
    split: { into: 'microLoan', count: 2 },
    spawn: { minDepth: 1, weight: 6 },
  },
  microLoan: {
    id: 'microLoan',
    name: 'Мікрозайм',
    sprite: 'bloodling',
    archetype: 'fast',
    scale: 2,
    hp: 12,
    speed: 95,
    chips: [10, 20],
    aggroRange: 220,
    attack: { reach: 14, height: 20, damage: 1, windupMs: 260, activeMs: 120, recoveryMs: 260, cooldownMs: 500, lungeSpeed: 190, triggerRange: 30 },
  },
  imp: {
    id: 'imp',
    name: 'Біс-кишеньковий',
    sprite: 'imp',
    archetype: 'thief',
    scale: 2,
    hp: 16,
    speed: 85,
    chips: [20, 30],
    aggroRange: 220,
    attack: { reach: 16, height: 22, damage: 1, windupMs: 220, activeMs: 120, recoveryMs: 200, cooldownMs: 800, lungeSpeed: 200, triggerRange: 32 },
    steal: { fraction: 0.25, minChips: 3, fleeSpeed: 175, escapeMs: 7000 },
    spawn: { minDepth: 1, weight: 3 },
  },
  dummy: {
    id: 'dummy',
    name: 'Манекен',
    sprite: 'dummy',
    archetype: 'heavy',
    hp: 999999,
    speed: 0,
    chips: [0, 0],
    aggroRange: 0,
    attack: { reach: 0, height: 0, damage: 0, windupMs: 0, activeMs: 0, recoveryMs: 0, cooldownMs: 99999, lungeSpeed: 0, triggerRange: 0 },
    knockbackResist: 1,
  },
};

/** Скейлінг від глибини: множник = 1 + коеф · (глибина − 1). */
export const DEPTH_SCALING = {
  hp: 0.22,
  damage: 0.12,
  speed: 0.03,
  /** Кількість ворогів у кімнаті. */
  count: 0.2,
  /** Фішки за ворога (глибше — більше). */
  chips: 0.35,
};

export function depthMultiplier(coef: number, depth: number): number {
  return 1 + coef * Math.max(0, depth - 1);
}
