/**
 * ЕКОНОМІКА: фішки, борг, відсотки, ціни прокачки. Уся «математика грошей» гри — тут.
 */
import type { WeaponId } from './weapons';

export const ECONOMY = {
  /** Стартовий борг перед казино. */
  startDebt: 25000,
  /** Стартовий баланс (щоб одразу можна було покрутити — так завжди починається). */
  startBalance: 400,
  /** Відсотки на борг після кожного повернення з підземелля (частка від боргу), округлення вгору. */
  interestRate: 0.015,
  /** Мінімальні відсотки за повернення (поки борг > 0). */
  minInterest: 50,
};

/** Зменшення шкоди від рівня броні 0..4 (вигляд лат за рівнем — ARMOR_LOOK у config/assets.ts). */
/** Тестові фішки: клавіша 0 у хабі й слоті або пункт меню паузи хабу — щоб швидко перевірити прокачку, бонуски й боси. */
export const TEST_CHIPS = 10_000;

export const ARMOR_DAMAGE_REDUCTION: readonly number[] = [0, 0.1, 0.2, 0.3, 0.4];

export type UpgradeId = 'armor' | 'flask' | 'stamina' | 'hp';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  /** Ціна кожного наступного рівня; довжина масиву = максимальний рівень. */
  prices: readonly number[];
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  armor: { id: 'armor', name: 'Броня', description: '−10% шкоди за рівень. Лати міняють колір: полірована сталь → воронована → бронза → золото.', prices: [1500, 3500, 7000, 12000] },
  flask: { id: 'flask', name: '+1 Енергетик', description: 'Ще одна фляга на забіг.', prices: [1200, 3000, 6000] },
  stamina: { id: 'stamina', name: 'Міцні нерви', description: '+20 до максимуму «Нервів».', prices: [1000, 2500, 5000] },
  hp: { id: 'hp', name: 'Друге серце', description: '+1 серце.', prices: [1500, 3500, 6500, 10000] },
};

/** Ціни відкриття зброї (меч є з початку). */
export const WEAPON_PRICES: Record<WeaponId, number> = {
  sword: 0,
  axe: 3000,
  scepter: 4000,
  special: 9000,
};

/** Що дає кожен рівень прокачки. */
export const UPGRADE_EFFECT = {
  staminaPerLevel: 20,
  hpPerLevel: 2,
  flaskPerLevel: 1,
};
