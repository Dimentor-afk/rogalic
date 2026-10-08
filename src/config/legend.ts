/**
 * Легенда ASCII-шаблонів кімнат: що означає кожен символ.
 *   # скеля   . порожньо   = дерев'яна платформа (стрибай крізь знизу, вниз+стрибок — зістрибнути)
 *   P гравець   T манекен
 *   вороги: g павук  k/o павук-вишибала  d павук-бухгалтер (дальній)  s кровосос-кредит (ділиться)
 *            c біс-злодій  p павук-колектор  i мікрозайм
 */
import type { Legend } from '../core/level/grid';

export const ROOM_LEGEND: Legend = {
  '#': { solid: true },
  '.': {},
  '=': { oneWay: true },
  P: { spawn: 'player' },
  T: { spawn: 'enemy:dummy' },
  g: { spawn: 'enemy:spider' },
  k: { spawn: 'enemy:spiderBrute' },
  o: { spawn: 'enemy:spiderBrute' },
  d: { spawn: 'enemy:spiderSpitter' },
  s: { spawn: 'enemy:creditBlob' },
  c: { spawn: 'enemy:imp' },
  p: { spawn: 'enemy:spiderVenom' },
  i: { spawn: 'enemy:microLoan' },
};
