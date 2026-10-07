/**
 * Легенда ASCII-шаблонів кімнат: що означає кожен символ.
 *   # скеля   . порожньо   = дерев'яна платформа (стрибай крізь знизу, вниз+стрибок — зістрибнути)
 *   P гравець   T манекен
 * (У Milestone 3 тут з'являться виходи кімнат L/R/U/D, бочки, двері, ліфт…)
 */
import type { Legend } from '../core/level/grid';

export const ROOM_LEGEND: Legend = {
  '#': { solid: true },
  '.': {},
  '=': { oneWay: true },
  P: { spawn: 'player' },
  T: { spawn: 'dummy' },
};
