/**
 * Легенда ASCII-шаблонів кімнат: що означає кожен символ.
 *   # скеля   . порожньо   = дерев'яна платформа (стрибай крізь знизу, вниз+стрибок — зістрибнути)
 *   P гравець   T манекен
 *   вороги: g гоблін  k скелет  o голем  d демон  s слиз  c кіт  p павук  i біс
 * (У Milestone 3 тут з'являться виходи кімнат L/R/U/D, бочки, двері, ліфт…)
 */
import type { Legend } from '../core/level/grid';

export const ROOM_LEGEND: Legend = {
  '#': { solid: true },
  '.': {},
  '=': { oneWay: true },
  P: { spawn: 'player' },
  T: { spawn: 'enemy:dummy' },
  g: { spawn: 'enemy:goblin' },
  k: { spawn: 'enemy:skeleton' },
  o: { spawn: 'enemy:golem' },
  d: { spawn: 'enemy:demon' },
  s: { spawn: 'enemy:slime' },
  c: { spawn: 'enemy:cat' },
  p: { spawn: 'enemy:spider' },
  i: { spawn: 'enemy:imp' },
};
