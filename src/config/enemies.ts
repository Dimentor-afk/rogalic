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
  goblin: {
    id: 'goblin',
    name: 'Гоблін-колектор',
    sprite: 'goblin0',
    archetype: 'fast',
    hp: 18,
    speed: 80,
    chips: [2, 4],
    aggroRange: 180,
    attack: { reach: 16, height: 20, damage: 1, windupMs: 280, activeMs: 130, recoveryMs: 320, cooldownMs: 650, lungeSpeed: 180, triggerRange: 36 },
    knockbackResist: 0,
    spawn: { minDepth: 1, weight: 10 },
  },
  goblinVeteran: {
    id: 'goblinVeteran',
    name: 'Гоблін-колектор зі стажем',
    sprite: 'goblin1',
    archetype: 'fast',
    hp: 26,
    speed: 95,
    chips: [3, 6],
    aggroRange: 200,
    attack: { reach: 18, height: 22, damage: 2, windupMs: 230, activeMs: 130, recoveryMs: 280, cooldownMs: 550, lungeSpeed: 210, triggerRange: 38 },
    spawn: { minDepth: 3, weight: 7 },
  },
  spider: {
    id: 'spider',
    name: 'Павук-ростовщик',
    sprite: 'spider_black',
    archetype: 'fast',
    hp: 22,
    speed: 105,
    chips: [3, 5],
    aggroRange: 190,
    attack: { reach: 18, height: 16, damage: 1, windupMs: 220, activeMs: 140, recoveryMs: 300, cooldownMs: 600, lungeSpeed: 230, triggerRange: 44 },
    spawn: { minDepth: 2, weight: 7 },
  },
  skeleton: {
    id: 'skeleton',
    name: 'Скелет-охоронець',
    sprite: 'skeleton0',
    archetype: 'heavy',
    hp: 42,
    speed: 50,
    chips: [4, 7],
    aggroRange: 190,
    attack: { reach: 22, height: 28, damage: 2, windupMs: 520, activeMs: 150, recoveryMs: 480, cooldownMs: 700, lungeSpeed: 120, triggerRange: 38 },
    knockbackResist: 0.6,
    spawn: { minDepth: 1, weight: 5 },
  },
  golem: {
    id: 'golem',
    name: 'Голем-вишибала',
    sprite: 'golem_blue',
    archetype: 'heavy',
    hp: 75,
    speed: 38,
    chips: [7, 11],
    aggroRange: 170,
    attack: { reach: 26, height: 34, damage: 3, windupMs: 680, activeMs: 170, recoveryMs: 620, cooldownMs: 900, lungeSpeed: 60, triggerRange: 42 },
    knockbackResist: 0.9,
    spawn: { minDepth: 2, weight: 4 },
  },
  golemElite: {
    id: 'golemElite',
    name: 'Голем-вишибала VIP',
    sprite: 'golem_orange',
    archetype: 'heavy',
    hp: 110,
    speed: 45,
    chips: [10, 16],
    aggroRange: 190,
    attack: { reach: 28, height: 34, damage: 4, windupMs: 600, activeMs: 170, recoveryMs: 560, cooldownMs: 800, lungeSpeed: 80, triggerRange: 44 },
    knockbackResist: 0.95,
    spawn: { minDepth: 4, weight: 3 },
  },
  demon: {
    id: 'demon',
    name: 'Демон-крупʼє',
    sprite: 'flydemon',
    archetype: 'ranged',
    hp: 30,
    speed: 55,
    chips: [5, 8],
    aggroRange: 230,
    flying: true,
    attack: { reach: 18, height: 24, damage: 2, windupMs: 520, activeMs: 80, recoveryMs: 420, cooldownMs: 1500, lungeSpeed: 0, triggerRange: 210 },
    knockbackResist: 0.3,
    ranged: {
      projectile: { fx: 'fireball', speed: 150, size: 10, lifetimeMs: 2600, damage: 2, blockable: true },
      preferredDistance: 120,
      fireRange: 210,
    },
    spawn: { minDepth: 2, weight: 5 },
  },
  slime: {
    id: 'slime',
    name: 'Слиз-кредит',
    sprite: 'slime1',
    archetype: 'splitter',
    hp: 30,
    speed: 35,
    chips: [3, 5],
    aggroRange: 160,
    attack: { reach: 10, height: 16, damage: 1, windupMs: 420, activeMs: 160, recoveryMs: 380, cooldownMs: 600, lungeSpeed: 150, triggerRange: 30 },
    knockbackResist: 0.2,
    split: { into: 'slimeling', count: 2 },
    spawn: { minDepth: 1, weight: 6 },
  },
  slimeling: {
    id: 'slimeling',
    name: 'Мікрокредит',
    sprite: 'slime0',
    archetype: 'fast',
    hp: 10,
    speed: 60,
    chips: [1, 2],
    aggroRange: 200,
    scale: 0.7,
    attack: { reach: 8, height: 12, damage: 1, windupMs: 300, activeMs: 140, recoveryMs: 300, cooldownMs: 500, lungeSpeed: 170, triggerRange: 26 },
  },
  cat: {
    id: 'cat',
    name: 'Кіт-кишеньковий злодій',
    sprite: 'cat',
    archetype: 'thief',
    hp: 14,
    speed: 75,
    chips: [2, 3],
    aggroRange: 220,
    attack: { reach: 12, height: 16, damage: 1, windupMs: 200, activeMs: 120, recoveryMs: 200, cooldownMs: 800, lungeSpeed: 200, triggerRange: 30 },
    steal: { fraction: 0.25, minChips: 3, fleeSpeed: 165, escapeMs: 7000 },
    spawn: { minDepth: 1, weight: 3 },
  },
  imp: {
    id: 'imp',
    name: 'Біс-промоутер',
    sprite: 'imp',
    archetype: 'fast',
    hp: 16,
    speed: 115,
    chips: [3, 5],
    aggroRange: 200,
    attack: { reach: 14, height: 16, damage: 2, windupMs: 200, activeMs: 120, recoveryMs: 260, cooldownMs: 500, lungeSpeed: 200, triggerRange: 34 },
    spawn: { minDepth: 4, weight: 6 },
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
