/**
 * ЕКОНОМІКА: фішки, борг, відсотки, ціни прокачки. Уся «математика грошей» гри — тут.
 */
import type { WeaponId } from './weapons';

export const ECONOMY = {
  /** Стартовий борг перед казино. */
  startDebt: 2500,
  /** Стартовий баланс (щоб одразу можна було покрутити — так завжди починається). */
  startBalance: 40,
  /** Відсотки на борг після кожного повернення з підземелля (частка від боргу), округлення вгору. */
  interestRate: 0.03,
  /** Мінімальні відсотки за повернення (поки борг > 0). */
  minInterest: 5,
};

/** Зменшення шкоди від рівня броні 0..4 (броню видно на спрайті гравця). */
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
  armor: { id: 'armor', name: 'Броня', description: '−10% шкоди за рівень. Видно на персонажі.', prices: [150, 350, 700, 1200] },
  flask: { id: 'flask', name: '+1 Енергетик', description: 'Ще одна фляга на забіг.', prices: [120, 300, 600] },
  stamina: { id: 'stamina', name: 'Міцні нерви', description: '+20 до максимуму «Нервів».', prices: [100, 250, 500] },
  hp: { id: 'hp', name: 'Друге серце', description: '+1 серце.', prices: [150, 350, 650, 1000] },
};

/** Ціни відкриття зброї (меч є з початку). */
export const WEAPON_PRICES: Record<WeaponId, number> = {
  sword: 0,
  axe: 300,
  scepter: 400,
  special: 900,
};

/** Що дає кожен рівень прокачки. */
export const UPGRADE_EFFECT = {
  staminaPerLevel: 20,
  hpPerLevel: 2,
  flaskPerLevel: 1,
};
