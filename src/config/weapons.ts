/**
 * Зброя відрізняється мувсетом: швидкість (фази удару), дальність, дуга, стаміна, снаряд чи ні.
 * Фази удару: windup (замах — уразливий, ще не б'є) → active (зона удару працює) → recovery (відновлення).
 * У лицаря один меч, тож «зброя» — це прийоми: кожен має власну анімацію атаки з паку.
 *
 * Кадри анімації розкладені по фазах (frames): поки йде фаза, показуємо її кадри рівномірно за її тривалістю.
 * Так удар влучає саме тоді, коли на екрані кадр з розмахом клинка, хоч би як ми міняли мілісекунди.
 */

export type WeaponId = 'sword' | 'axe' | 'scepter' | 'special';

export interface ProjectileSpec {
  /** Ключ анімації з FX (src/config/assets.ts). */
  fx: string;
  /** Ефект при влучанні (FX). */
  impactFx?: string;
  speed: number;
  lifetimeMs: number;
  /** Розмір хітбокса снаряда, px. */
  size: number;
  /** Пролітає крізь ворогів (бʼє кожного раз). */
  pierce?: boolean;
  /** Де з'являється: на стільки px попереду центру тіла і на такій висоті над ногами. */
  spawnAhead: number;
  spawnHeight: number;
  /** Де в кадрі ефекту його «серце» по вертикалі (0..1), якщо малюнок не по центру кадру — щоб хітбокс збігся з малюнком. */
  originY?: number;
}

/** Номери кадрів анімації для кожної фази удару. */
export interface PhaseFrames {
  windup: number[];
  active: number[];
  recovery: number[];
}

/** Один удар: анімація, тайминг, зона ураження. Його виконує і прийом зброї, і удар з присіду. */
export interface AttackMove {
  /** Анімація атаки лицаря (src/config/assets.ts). */
  anim: string;
  frames: PhaseFrames;
  damage: number;
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
  staminaCost: number;
  /** Дальність і дуга ближнього удару (для снаряду — не використовуються). */
  range: number;
  arcDeg: number;
  /** Висота точки удару над ногами, px (плече — для звичайних, коліно — для удару з присіду). */
  originHeight: number;
  knockback: number;
  /** Ривок уперед на початку активної фази, px/с. */
  lunge: number;
  /** Важкий удар: сильніший hitstop і тряска. */
  heavy?: boolean;
  projectile?: ProjectileSpec;
}

export interface WeaponDef extends AttackMove {
  id: WeaponId;
  name: string;
  description: string;
}

/*
 * Кадри з атласу (public/assets/atlases/player.json):
 *   attack_sword 0–1 меч унизу позаду, 2 — дуга перед собою, 3 — дуга йде за голову, 4–5 меч угорі;
 *   attack_axe 0–2 повільно заносить, 3–4 велика дуга згори, 5 — шлейф по землі, 6 — стійка;
 *   attack_wave 0–1 замах, 2 — серп утворився на клинку, 3 — серп відірвався, 4–5 залишки серпа;
 *   attack_thrust 4 — клинок відведений (замах), 0–1 укол зі слідом, 2–3 рука ще витягнута.
 */
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Меч «Ставка»',
    description: 'Збалансований удар. Швидкий замах, середня дальність.',
    anim: 'attack_sword',
    frames: { windup: [0, 1], active: [2, 3], recovery: [4, 5] },
    damage: 10,
    windupMs: 110,
    activeMs: 100,
    recoveryMs: 170,
    staminaCost: 18,
    range: 36,
    arcDeg: 150,
    originHeight: 26,
    knockback: 120,
    lunge: 70,
  },
  axe: {
    id: 'axe',
    name: 'Розмах «Ва-банк»',
    description: 'Повільний важкий розмах згори. Широка дуга, велика шкода, дорого по нервах.',
    anim: 'attack_axe',
    frames: { windup: [0, 1, 2], active: [3, 4, 5], recovery: [6] },
    damage: 24,
    windupMs: 300,
    activeMs: 150,
    recoveryMs: 300,
    staminaCost: 32,
    range: 40,
    arcDeg: 230,
    originHeight: 28,
    knockback: 230,
    lunge: 40,
    heavy: true,
  },
  scepter: {
    id: 'scepter',
    name: 'Хвиля «Кешбек»',
    description: 'Удар, що зриває з клинка хвилю. Можна тримати дистанцію.',
    anim: 'attack_wave',
    // снаряд вилітає на початку активної фази — рівно на кадрі 3, де серп відривається від клинка
    frames: { windup: [0, 1, 2], active: [3], recovery: [4, 5] },
    damage: 9,
    windupMs: 180,
    activeMs: 60,
    recoveryMs: 220,
    staminaCost: 16,
    range: 0,
    arcDeg: 0,
    originHeight: 24,
    knockback: 70,
    lunge: 0,
    // з'являється там, де на кадрі 3 намальований серп (≈39 px попереду, 24 px над ногами); у кадрі fx/slash_wave серп — у нижній частині
    projectile: { fx: 'slashWave', impactFx: 'impact', speed: 280, lifetimeMs: 900, size: 24, spawnAhead: 39, spawnHeight: 24, originY: 0.66 },
  },
  special: {
    id: 'special',
    name: 'Укол «Джекпот»',
    description: 'Дуже швидкий і дешевий укол уперед. Вузький, але далекий.',
    anim: 'attack_thrust',
    frames: { windup: [4], active: [0, 1], recovery: [2, 3, 4] },
    damage: 8,
    windupMs: 70,
    activeMs: 80,
    recoveryMs: 120,
    staminaCost: 12,
    range: 46,
    arcDeg: 60,
    originHeight: 26,
    knockback: 80,
    lunge: 100,
  },
};

/**
 * Удар з присіду: низький розмах навколо себе (кадри crouch_attack: 0 — серп перед собою,
 * 1–3 клинок іде за спину, 4 — підсічка по землі). Добре проти павуків і всього низького.
 */
export const CROUCH_ATTACK: AttackMove = {
  anim: 'crouch_attack',
  frames: { windup: [6], active: [0, 1, 2, 3, 4], recovery: [5, 6] },
  damage: 8,
  windupMs: 80,
  activeMs: 220,
  recoveryMs: 170,
  staminaCost: 16,
  range: 34,
  arcDeg: 300,
  originHeight: 10,
  knockback: 110,
  lunge: 0,
};
