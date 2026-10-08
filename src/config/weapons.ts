/**
 * Зброя відрізняється мувсетом: швидкість (фази удару), дальність, дуга, стаміна, снаряд чи ні.
 * Фази удару: windup (замах — уразливий, ще не б'є) → active (зона удару працює) → recovery (відновлення).
 * У лицаря один меч, тож «зброя» — це прийоми: кожен має власну анімацію атаки з паку.
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
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  description: string;
  /** Анімація атаки лицаря (src/config/assets.ts). */
  anim: string;
  damage: number;
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
  staminaCost: number;
  /** Дальність і дуга ближнього удару (для снаряду — не використовуються). */
  range: number;
  arcDeg: number;
  knockback: number;
  /** Ривок уперед на початку активної фази, px/с. */
  lunge: number;
  /** Важкий удар: сильніший hitstop і тряска. */
  heavy?: boolean;
  projectile?: ProjectileSpec;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Меч «Ставка»',
    description: 'Збалансований удар. Швидкий замах, середня дальність.',
    anim: 'attack_sword',
    damage: 10,
    windupMs: 110,
    activeMs: 90,
    recoveryMs: 170,
    staminaCost: 18,
    range: 32,
    arcDeg: 150,
    knockback: 120,
    lunge: 70,
  },
  axe: {
    id: 'axe',
    name: 'Розмах «Ва-банк»',
    description: 'Повільний подвійний розмах. Широка дуга, велика шкода, дорого по нервах.',
    anim: 'attack_axe',
    damage: 24,
    windupMs: 300,
    activeMs: 120,
    recoveryMs: 320,
    staminaCost: 32,
    range: 38,
    arcDeg: 230,
    knockback: 230,
    lunge: 40,
    heavy: true,
  },
  scepter: {
    id: 'scepter',
    name: 'Хвиля «Кешбек»',
    description: 'Удар, що зриває з клинка хвилю. Можна тримати дистанцію.',
    anim: 'attack_wave',
    damage: 9,
    windupMs: 160,
    activeMs: 60,
    recoveryMs: 230,
    staminaCost: 16,
    range: 0,
    arcDeg: 0,
    knockback: 70,
    lunge: 0,
    projectile: { fx: 'slashWave', impactFx: 'impact', speed: 280, lifetimeMs: 900, size: 14 },
  },
  special: {
    id: 'special',
    name: 'Укол «Джекпот»',
    description: 'Дуже швидкий і дешевий укол уперед. Вузький, але далекий.',
    anim: 'attack_thrust',
    damage: 8,
    windupMs: 70,
    activeMs: 80,
    recoveryMs: 110,
    staminaCost: 12,
    range: 28,
    arcDeg: 130,
    knockback: 80,
    lunge: 100,
  },
};
