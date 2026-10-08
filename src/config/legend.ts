/**
 * Легенда ASCII-шаблонів кімнат: що означає кожен символ.
 *   # скеля   . порожньо   = дерев'яна платформа (стрибай крізь знизу, вниз+стрибок — зістрибнути)
 *   P гравець   T манекен
 *   вороги: g гоблін  k скелет  o скелет-вишибала  d гоблін-пращник  s слиз  c біс-злодій  p павук  i кровосос
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
  o: { spawn: 'enemy:skeletonVeteran' },
  d: { spawn: 'enemy:goblinSlinger' },
  s: { spawn: 'enemy:slime' },
  c: { spawn: 'enemy:imp' },
  p: { spawn: 'enemy:spider' },
  i: { spawn: 'enemy:bloodling' },
};
