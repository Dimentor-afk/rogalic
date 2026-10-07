/**
 * Модифікатори поверху від символу «Прокляття» на слоті (3+ символи → прокляття на наступний спуск).
 * Щоб було не лише боляче: кожне прокляття збільшує нагороду фішками.
 */
export interface CurseDef {
  id: string;
  name: string;
  description: string;
  /** Множник фішок за ворогів/бочки/скрині на час прокляття. */
  chipsMultiplier: number;
  /** Радіус світла навколо гравця, px (темрява). */
  lightRadius?: number;
  /** У скільки разів більше ворогів (кожен слот породжує стільки). */
  enemyMultiplier?: number;
  /** Фляги не працюють. */
  noFlasks?: boolean;
  /** Вороги швидші в стільки разів. */
  enemySpeed?: number;
  /** Зміна максимального HP гравця. */
  maxHpDelta?: number;
}

export const CURSES: Record<string, CurseDef> = {
  darkness: {
    id: 'darkness',
    name: 'Вимкнули світло за несплату',
    description: 'Темрява: видно лише навколо себе. Фішки ×1.5',
    chipsMultiplier: 1.5,
    lightRadius: 78,
  },
  horde: {
    id: 'horde',
    name: 'Колектори прийшли гуртом',
    description: 'Удвічі більше ворогів. Фішки ×1.6',
    chipsMultiplier: 1.6,
    enemyMultiplier: 2,
  },
  dry: {
    id: 'dry',
    name: 'Енергетики конфіскували',
    description: 'Фляги не працюють. Фішки ×1.7',
    chipsMultiplier: 1.7,
    noFlasks: true,
  },
  frenzy: {
    id: 'frenzy',
    name: 'Колектори на кофеїні',
    description: 'Вороги на 35% швидші. Фішки ×1.4',
    chipsMultiplier: 1.4,
    enemySpeed: 1.35,
  },
  fragile: {
    id: 'fragile',
    name: 'Нерви здають',
    description: 'Мінус одне серце. Фішки ×1.5',
    chipsMultiplier: 1.5,
    maxHpDelta: -2,
  },
};
