/**
 * БОСИ. Логіка знає лише бібліотеку патернів атак (src/entities/boss/patterns.ts) і фази;
 * конкретні боси — тут: спрайт, HP, арена, фази (пороги HP → набір атак), тип фріспінів.
 * Новий бос = спрайт у маніфесті + запис тут (+ арена в src/levels/arenas.json).
 */
import type { FreeSpinType } from './slot';

/** Атаки зі спільної бібліотеки. Числа — параметри конкретного боса. */
export type PatternDef =
  | { kind: 'melee'; weight: number; damage: number; reach: number; height: number; windupMs: number }
  | { kind: 'dash'; weight: number; damage: number; speed: number; windupMs: number }
  | { kind: 'shot'; weight: number; damage: number; count: number; intervalMs: number; speed: number; fx: string; windupMs: number }
  | { kind: 'fan'; weight: number; damage: number; count: number; spreadDeg: number; speed: number; fx: string; windupMs: number; waves?: number }
  | { kind: 'rain'; weight: number; damage: number; count: number; fx: string; windupMs: number }
  | {
      kind: 'obstacles';
      weight: number;
      damage: number;
      count: number;
      lifeMs: number;
      windupMs: number;
      /** FX-анімація перешкоди; "<frame>Death" — анімація зникнення (якщо є). */
      frame: string;
      /** Тверда (стовп, через який не пройти) чи лише шкодить (калюжа, шипи). */
      blocking: boolean;
      /** Розмір зони шкоди, px (за замовчуванням: стовп 22×54, калюжа 24×10). */
      w?: number;
      h?: number;
      scale?: number;
    }
  | { kind: 'summon'; weight: number; enemy: string; count: number; windupMs: number }
  | { kind: 'grow'; weight: number; factor: number; max: number; windupMs: number }
  | { kind: 'slam'; weight: number; damage: number; shockSpeed: number; windupMs: number }
  | { kind: 'teleport'; weight: number; windupMs: number };

export type PatternKind = PatternDef['kind'];

export interface BossPhase {
  /** Фаза діє, поки HP боса вище цієї частки (0..1). Фази — від першої до останньої. */
  hpAbove: number;
  patterns: PatternDef[];
  /** Пауза між атаками [мін, макс], мс. */
  pauseMs: [number, number];
  speedMult?: number;
  /** Напис при переході у фазу. */
  shout?: string;
}

export interface BossDef {
  id: string;
  name: string;
  /** Двері-трофей у хабі (ім'я дверей у атласі props). */
  trophyDoor: string;
  /** Фінальний бос: його скатер з'являється лише після перемоги над усіма іншими. */
  final?: boolean;
  /** Які фріспіни дає перемога: частота і розмір символів-множників. */
  freeSpins: FreeSpinType;
  /** «Швидше за цільовий час» — бонус до стартового множника. */
  targetTimeMs: number;
  /** Скатер боса на барабанах: короткий підпис і колір заглушки. */
  scatter: { label: string; color: string };
  sprite: string;
  scale?: number;
  tint?: number;
  /** Колір дверей-трофея в хабі (якщо двері спільні з іншим босом). */
  trophyTint?: number;
  /** Літає: висить на висоті hover px над підлогою (без гравітації), ривок — пікірування на гравця. */
  flying?: { hover: number };
  hp: number;
  speed: number;
  /** Бажана відстань до гравця між атаками, px (маги тримаються далі). */
  preferredDistance: number;
  arena: string;
  taunt: string;
  phases: BossPhase[];
  /** «Підкручені» атаки (фінальний бос): телеграф однієї атаки, в останній момент — інша, з чесним вікном реакції. */
  rigged?: { chance: number; reactMs: number };
}

/** Стартовий множник фріспінів за бій: без шкоди, без фляг, швидко (сумуються; нічого — x1). */
export const FIGHT_MULTIPLIERS = { noDamage: 5, noFlasks: 2, fast: 2 };

/** Скільки боса оглушує паріру. */
export const BOSS_PARRY_STUN_MS = 700;

export const BOSSES: Record<string, BossDef> = {
  goblinKing: {
    id: 'goblinKing',
    scatter: { label: 'КОЛЕКТ', color: '#3f8a3a' },
    name: 'Король Колекторів',
    trophyDoor: 'goblin_door',
    targetTimeMs: 60000,
    freeSpins: { name: 'Часті дрібні', multipliers: { 2: 30, 5: 6, 10: 1, 25: 0.2 } },
    sprite: 'boss_goblin_king',
    hp: 380,
    speed: 70,
    preferredDistance: 70,
    arena: 'arena_goblin',
    taunt: 'Борг — це не проблема. Проблема — це ти.',
    phases: [
      {
        hpAbove: 0.6,
        pauseMs: [700, 1200],
        patterns: [
          { kind: 'shot', weight: 3, damage: 2, count: 2, intervalMs: 380, speed: 190, fx: 'goblinBolt', windupMs: 520 },
          { kind: 'dash', weight: 2, damage: 2, speed: 300, windupMs: 650 },
          { kind: 'melee', weight: 2, damage: 2, reach: 34, height: 40, windupMs: 480 },
        ],
      },
      {
        hpAbove: 0.25,
        pauseMs: [600, 1000],
        shout: 'Колектори, до мене!',
        patterns: [
          { kind: 'fan', weight: 3, damage: 2, count: 5, spreadDeg: 60, speed: 170, fx: 'goblinBolt', windupMs: 620 },
          { kind: 'summon', weight: 2, enemy: 'spider', count: 2, windupMs: 700 },
          { kind: 'dash', weight: 2, damage: 2, speed: 330, windupMs: 560 },
          { kind: 'melee', weight: 2, damage: 2, reach: 34, height: 40, windupMs: 420 },
        ],
      },
      {
        hpAbove: 0,
        pauseMs: [450, 800],
        speedMult: 1.3,
        shout: 'Відсотки ростуть!',
        patterns: [
          { kind: 'fan', weight: 3, damage: 2, count: 7, spreadDeg: 80, speed: 190, fx: 'goblinBolt', windupMs: 560, waves: 2 },
          { kind: 'dash', weight: 2, damage: 3, speed: 360, windupMs: 500 },
          { kind: 'summon', weight: 1, enemy: 'spiderSpitter', count: 1, windupMs: 650 },
        ],
      },
    ],
  },
  slimeKing: {
    id: 'slimeKing',
    scatter: { label: 'КРЕДИТ', color: '#5ac83a' },
    name: 'Король Кредитів',
    trophyDoor: 'slime_door',
    targetTimeMs: 70000,
    freeSpins: { name: 'Липкі середні', multipliers: { 2: 14, 5: 10, 10: 2, 25: 0.4 } },
    sprite: 'boss_slime_king',
    scale: 0.75,
    hp: 520,
    speed: 40,
    preferredDistance: 60,
    arena: 'arena_slime',
    taunt: 'Беріть кредит. Беріть ще. Я росту з кожним.',
    phases: [
      {
        hpAbove: 0.6,
        pauseMs: [900, 1400],
        patterns: [
          { kind: 'slam', weight: 3, damage: 2, shockSpeed: 170, windupMs: 700 },
          { kind: 'obstacles', weight: 2, damage: 1, count: 3, lifeMs: 4000, windupMs: 800, frame: 'slimePuddle', blocking: false },
          { kind: 'summon', weight: 1, enemy: 'microLoan', count: 2, windupMs: 700 },
        ],
      },
      {
        hpAbove: 0.3,
        pauseMs: [700, 1100],
        shout: 'Рефінансування!',
        patterns: [
          { kind: 'grow', weight: 2, factor: 1.12, max: 1.0, windupMs: 900 },
          { kind: 'slam', weight: 3, damage: 3, shockSpeed: 200, windupMs: 620 },
          { kind: 'obstacles', weight: 2, damage: 1, count: 4, lifeMs: 4500, windupMs: 700, frame: 'slimePuddle', blocking: false },
          { kind: 'summon', weight: 1, enemy: 'creditBlob', count: 1, windupMs: 700 },
        ],
      },
      {
        hpAbove: 0,
        pauseMs: [500, 900],
        speedMult: 1.4,
        shout: 'Колекторська відмова!',
        patterns: [
          { kind: 'slam', weight: 4, damage: 3, shockSpeed: 230, windupMs: 560 },
          { kind: 'dash', weight: 2, damage: 3, speed: 260, windupMs: 700 },
          { kind: 'summon', weight: 1, enemy: 'microLoan', count: 3, windupMs: 600 },
        ],
      },
    ],
  },
  golem: {
    id: 'golem',
    scatter: { label: 'ГОЛЕМ', color: '#3a6ab8' },
    name: 'Голем-Гарант',
    trophyDoor: 'door',
    trophyTint: 0x8ab4ff,
    targetTimeMs: 70000,
    freeSpins: { name: 'Камʼяні стабільні', multipliers: { 2: 23, 5: 8, 10: 1.7, 25: 0.25 } },
    sprite: 'golem_blue',
    scale: 2,
    hp: 600,
    speed: 45,
    preferredDistance: 56,
    arena: 'arena_golem',
    taunt: 'Гарантую: ти програєш. Це єдина гарантія в цьому закладі.',
    phases: [
      {
        hpAbove: 0.6,
        pauseMs: [800, 1300],
        patterns: [
          { kind: 'melee', weight: 3, damage: 3, reach: 46, height: 56, windupMs: 700 },
          { kind: 'slam', weight: 2, damage: 2, shockSpeed: 160, windupMs: 800 },
          { kind: 'dash', weight: 1, damage: 3, speed: 250, windupMs: 850 },
        ],
      },
      {
        hpAbove: 0.3,
        pauseMs: [650, 1100],
        shout: 'Камʼяна гарантія!',
        patterns: [
          { kind: 'obstacles', weight: 3, damage: 3, count: 4, lifeMs: 700, windupMs: 800, frame: 'earthSpike', blocking: false, w: 40, h: 30 },
          { kind: 'rain', weight: 2, damage: 2, count: 6, fx: 'rockFall', windupMs: 900 },
          { kind: 'melee', weight: 2, damage: 3, reach: 48, height: 56, windupMs: 620 },
          { kind: 'slam', weight: 2, damage: 3, shockSpeed: 190, windupMs: 700 },
        ],
      },
      {
        hpAbove: 0,
        pauseMs: [450, 850],
        speedMult: 1.35,
        shout: 'Гарантія закінчилась!',
        patterns: [
          { kind: 'obstacles', weight: 3, damage: 3, count: 6, lifeMs: 650, windupMs: 650, frame: 'earthSpike', blocking: false, w: 40, h: 30 },
          { kind: 'slam', weight: 2, damage: 3, shockSpeed: 220, windupMs: 600 },
          { kind: 'dash', weight: 2, damage: 3, speed: 320, windupMs: 620 },
          { kind: 'rain', weight: 2, damage: 2, count: 9, fx: 'rockFall', windupMs: 750 },
        ],
      },
    ],
  },
  skeletonKing: {
    id: 'skeletonKing',
    scatter: { label: 'СМЕРТЬ', color: '#c8c8d8' },
    name: 'Смерть-Колектор',
    trophyDoor: 'skeleton_door',
    targetTimeMs: 75000,
    freeSpins: { name: 'Рідкі великі', multipliers: { 2: 6, 5: 6, 10: 4, 25: 1 } },
    sprite: 'boss_skeleton_king',
    scale: 0.85,
    hp: 560,
    speed: 75,
    preferredDistance: 50,
    arena: 'arena_skeleton',
    taunt: 'Від боргу не втечеш. Від мене — тим паче.',
    phases: [
      {
        hpAbove: 0.6,
        pauseMs: [700, 1100],
        patterns: [
          { kind: 'melee', weight: 3, damage: 3, reach: 40, height: 50, windupMs: 600 },
          { kind: 'dash', weight: 2, damage: 3, speed: 320, windupMs: 700 },
          { kind: 'obstacles', weight: 2, damage: 2, count: 2, lifeMs: 5000, windupMs: 900, frame: 'bonePillar', blocking: true },
        ],
      },
      {
        hpAbove: 0.3,
        pauseMs: [600, 950],
        shout: 'Кістки не брешуть!',
        patterns: [
          { kind: 'rain', weight: 3, damage: 2, count: 6, fx: 'boneShard', windupMs: 900 },
          { kind: 'melee', weight: 2, damage: 3, reach: 44, height: 50, windupMs: 520 },
          { kind: 'dash', weight: 2, damage: 3, speed: 350, windupMs: 600 },
          { kind: 'obstacles', weight: 1, damage: 2, count: 3, lifeMs: 5000, windupMs: 800, frame: 'bonePillar', blocking: true },
        ],
      },
      {
        hpAbove: 0,
        pauseMs: [450, 800],
        speedMult: 1.3,
        shout: 'Повне банкрутство!',
        patterns: [
          { kind: 'rain', weight: 3, damage: 2, count: 9, fx: 'boneShard', windupMs: 750 },
          { kind: 'dash', weight: 3, damage: 3, speed: 380, windupMs: 520 },
          { kind: 'summon', weight: 1, enemy: 'spiderBrute', count: 1, windupMs: 700 },
        ],
      },
    ],
  },
  flyDemon: {
    id: 'flyDemon',
    scatter: { label: 'ДЕМОН', color: '#d83a2a' },
    name: 'Демон-Крупʼє',
    trophyDoor: 'dungeon_master_door',
    trophyTint: 0xff8a6a,
    targetTimeMs: 80000,
    freeSpins: { name: 'Вогняні', multipliers: { 2: 8.5, 5: 6.5, 10: 2.7, 25: 1 } },
    sprite: 'flydemon',
    scale: 2,
    flying: { hover: 56 },
    hp: 480,
    speed: 75,
    preferredDistance: 130,
    arena: 'arena_demon',
    taunt: 'Роздаю карти. Тобі — завжди погані.',
    phases: [
      {
        hpAbove: 0.6,
        pauseMs: [700, 1100],
        patterns: [
          { kind: 'shot', weight: 3, damage: 2, count: 3, intervalMs: 320, speed: 200, fx: 'demonFire', windupMs: 520 },
          { kind: 'dash', weight: 2, damage: 3, speed: 300, windupMs: 700 },
          { kind: 'fan', weight: 2, damage: 2, count: 5, spreadDeg: 60, speed: 170, fx: 'demonFire', windupMs: 650 },
        ],
      },
      {
        hpAbove: 0.3,
        pauseMs: [600, 950],
        shout: 'Роздача!',
        patterns: [
          { kind: 'rain', weight: 3, damage: 2, count: 7, fx: 'demonFire', windupMs: 850 },
          { kind: 'fan', weight: 2, damage: 2, count: 7, spreadDeg: 90, speed: 180, fx: 'demonFire', windupMs: 600, waves: 2 },
          { kind: 'dash', weight: 2, damage: 3, speed: 330, windupMs: 620 },
          { kind: 'summon', weight: 1, enemy: 'microLoan', count: 2, windupMs: 700 },
        ],
      },
      {
        hpAbove: 0,
        pauseMs: [450, 800],
        speedMult: 1.3,
        shout: 'Казино не програє!',
        patterns: [
          { kind: 'rain', weight: 3, damage: 2, count: 10, fx: 'demonFire', windupMs: 700 },
          { kind: 'fan', weight: 2, damage: 2, count: 9, spreadDeg: 120, speed: 200, fx: 'demonFire', windupMs: 560, waves: 2 },
          { kind: 'dash', weight: 3, damage: 3, speed: 370, windupMs: 540 },
          { kind: 'teleport', weight: 1, windupMs: 420 },
        ],
      },
    ],
  },
  dungeonMaster: {
    id: 'dungeonMaster',
    scatter: { label: 'СТАВКИ', color: '#c83a3a' },
    name: 'Майстер Ставок',
    trophyDoor: 'dungeon_master_door',
    targetTimeMs: 80000,
    freeSpins: { name: 'Все або нічого', multipliers: { 2: 2, 5: 3, 10: 3, 25: 2 } },
    sprite: 'boss_dungeon_master',
    hp: 500,
    speed: 55,
    preferredDistance: 150,
    arena: 'arena_master',
    taunt: 'Ставки зроблено. Ставок більше нема.',
    phases: [
      {
        hpAbove: 0.65,
        pauseMs: [700, 1100],
        patterns: [
          { kind: 'shot', weight: 3, damage: 2, count: 3, intervalMs: 300, speed: 210, fx: 'masterBoltGreen', windupMs: 520 },
          { kind: 'fan', weight: 2, damage: 2, count: 5, spreadDeg: 70, speed: 170, fx: 'masterBoltBlue', windupMs: 650 },
          { kind: 'teleport', weight: 2, windupMs: 500 },
        ],
      },
      {
        hpAbove: 0.3,
        pauseMs: [600, 900],
        shout: 'Подвоюю!',
        patterns: [
          { kind: 'rain', weight: 3, damage: 2, count: 7, fx: 'masterBoltRed', windupMs: 850 },
          { kind: 'fan', weight: 2, damage: 2, count: 7, spreadDeg: 90, speed: 180, fx: 'masterBoltBlue', windupMs: 600, waves: 2 },
          { kind: 'summon', weight: 1, enemy: 'spiderBrute', count: 1, windupMs: 700 },
          { kind: 'teleport', weight: 2, windupMs: 420 },
        ],
      },
      {
        hpAbove: 0,
        pauseMs: [450, 750],
        speedMult: 1.2,
        shout: 'Ва-банк!',
        patterns: [
          { kind: 'rain', weight: 3, damage: 2, count: 10, fx: 'masterBoltRed', windupMs: 700 },
          { kind: 'shot', weight: 2, damage: 2, count: 5, intervalMs: 220, speed: 240, fx: 'masterBoltGreen', windupMs: 450 },
          { kind: 'teleport', weight: 2, windupMs: 380 },
          { kind: 'summon', weight: 1, enemy: 'microLoan', count: 2, windupMs: 700 },
        ],
      },
    ],
  },
  casino: {
    id: 'casino',
    scatter: { label: 'КАЗИНО', color: '#ff4ad8' },
    name: 'КАЗИНО',
    trophyDoor: 'door',
    final: true,
    targetTimeMs: 100000,
    freeSpins: { name: 'Підкручені', multipliers: { 2: 10, 5: 8, 10: 5, 25: 3 } },
    sprite: 'boss_archdemon',
    scale: 1.5,
    tint: 0xffd8a0,
    hp: 760,
    speed: 65,
    preferredDistance: 110,
    arena: 'arena_casino',
    taunt: 'Заклад завжди у виграші. Завжди.',
    rigged: { chance: 0.45, reactMs: 340 },
    phases: [
      {
        hpAbove: 0.66,
        pauseMs: [650, 1000],
        patterns: [
          { kind: 'fan', weight: 3, damage: 2, count: 6, spreadDeg: 70, speed: 190, fx: 'casinoChip', windupMs: 650 },
          { kind: 'dash', weight: 2, damage: 3, speed: 340, windupMs: 650 },
          { kind: 'rain', weight: 2, damage: 2, count: 7, fx: 'casinoChip', windupMs: 850 },
          { kind: 'melee', weight: 2, damage: 3, reach: 40, height: 60, windupMs: 560 },
        ],
      },
      {
        hpAbove: 0.33,
        pauseMs: [550, 850],
        shout: 'Перевіримо твою удачу.',
        patterns: [
          { kind: 'fan', weight: 3, damage: 2, count: 8, spreadDeg: 100, speed: 200, fx: 'casinoChip', windupMs: 600, waves: 2 },
          { kind: 'obstacles', weight: 2, damage: 2, count: 3, lifeMs: 4500, windupMs: 800, frame: 'bonePillar', blocking: true },
          { kind: 'dash', weight: 2, damage: 3, speed: 380, windupMs: 560 },
          { kind: 'summon', weight: 1, enemy: 'microLoan', count: 2, windupMs: 650 },
          { kind: 'teleport', weight: 1, windupMs: 420 },
        ],
      },
      {
        hpAbove: 0,
        pauseMs: [400, 700],
        speedMult: 1.25,
        shout: 'ВСІ СТАВКИ — НА ЗАКЛАД!',
        patterns: [
          { kind: 'rain', weight: 3, damage: 2, count: 11, fx: 'casinoChip', windupMs: 700 },
          { kind: 'fan', weight: 3, damage: 2, count: 9, spreadDeg: 120, speed: 210, fx: 'casinoChip', windupMs: 560, waves: 2 },
          { kind: 'dash', weight: 2, damage: 3, speed: 400, windupMs: 500 },
          { kind: 'slam', weight: 2, damage: 3, shockSpeed: 240, windupMs: 560 },
          { kind: 'grow', weight: 1, factor: 1.1, max: 1.9, windupMs: 700 },
        ],
      },
    ],
  },
};

/** Порядок у колекції (хаб, HUD). Фінальний — останній. */
export const BOSS_ORDER = ['goblinKing', 'slimeKing', 'golem', 'skeletonKing', 'flyDemon', 'dungeonMaster', 'casino'] as const;
