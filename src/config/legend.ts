/**
 * Легенда ASCII-шаблонів кімнат: що означає кожен символ.
 * (У Milestone 3 тут з'являться виходи кімнат L/R/U/D, бочки, двері, ліфт…)
 */
import type { Legend } from '../core/level/grid';

export const ROOM_LEGEND: Legend = {
  '#': { solid: true },
  '.': {},
  P: { spawn: 'player' },
  T: { spawn: 'dummy' },
};
