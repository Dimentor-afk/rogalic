import { describe, expect, it } from 'vitest';
import { canAct, createStamina, drain, spend, tick } from '../src/core/combat/stamina';
import { closestPointOnRect, rectsOverlap, sectorHitsRect } from '../src/core/combat/geometry';
import { resolveHit, type DefenderState } from '../src/core/combat/defense';
import { hasLineOfSight } from '../src/core/level/los';
import { parseRoom } from '../src/core/level/grid';
import { ROOM_LEGEND } from '../src/config/legend';

const RULES = { regenPerSec: 50, regenDelayMs: 400 };

describe('stamina', () => {
  it('витрата, нуль замість мінуса, дію можна почати при будь-якій позитивній стаміні', () => {
    const s = createStamina(100);
    expect(spend(s, 30, 0)).toBe(true);
    expect(s.value).toBe(70);
    expect(spend(s, 200, 0)).toBe(true); // souls-правило
    expect(s.value).toBe(0);
    expect(canAct(s)).toBe(false);
    expect(spend(s, 1, 0)).toBe(false);
  });

  it('відновлення лише після затримки і коли гравець нічого не робить', () => {
    const s = createStamina(100);
    spend(s, 50, 1000);
    tick(s, RULES, 100, 1200, false); // ще затримка
    expect(s.value).toBe(50);
    tick(s, RULES, 1000, 1500, true); // зайнятий (тримає блок)
    expect(s.value).toBe(50);
    tick(s, RULES, 1000, 1500, false);
    expect(s.value).toBe(100);
    tick(s, RULES, 1000, 3000, false); // не більше максимуму
    expect(s.value).toBe(100);
  });

  it('drain повертає нестачу', () => {
    const s = createStamina(20);
    expect(drain(s, 35, 0)).toBe(15);
    expect(s.value).toBe(0);
  });
});

describe('geometry', () => {
  const box = { x: 20, y: -10, w: 10, h: 20 };

  it('closestPointOnRect', () => {
    expect(closestPointOnRect({ x: 0, y: 0 }, box)).toEqual({ x: 20, y: 0 });
    expect(closestPointOnRect({ x: 25, y: 0 }, box)).toEqual({ x: 25, y: 0 });
  });

  it('дуга вперед влучає в ціль спереду в межах дальності', () => {
    expect(sectorHitsRect({ x: 0, y: 0 }, 1, 25, 90, box)).toBe(true);
    expect(sectorHitsRect({ x: 0, y: 0 }, 1, 15, 90, box)).toBe(false); // задалеко
    expect(sectorHitsRect({ x: 0, y: 0 }, -1, 25, 90, box)).toBe(false); // за спиною
    expect(sectorHitsRect({ x: 0, y: 0 }, -1, 25, 360, box)).toBe(true); // удар навколо
  });

  it('кут: ціль високо над головою не влучає вузькою дугою, але влучає широкою', () => {
    const above = { x: 5, y: -30, w: 6, h: 6 };
    expect(sectorHitsRect({ x: 0, y: 0 }, 1, 40, 60, above)).toBe(false);
    expect(sectorHitsRect({ x: 0, y: 0 }, 1, 40, 200, above)).toBe(true);
  });

  it('rectsOverlap', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
  });
});

describe('resolveHit (паріру / блок / ухилення)', () => {
  const rules = { parryWindowMs: 150, staminaPerDamage: 10 };
  const base: DefenderState = { invulnerable: false, blockHeld: false, blockPressedAt: -Infinity, facing: 1, stamina: 100 };
  const hit = { now: 1000, damage: 3, blockable: true, fromSide: 1 as const };

  it('i-frames — ухилення', () => {
    expect(resolveHit(hit, { ...base, invulnerable: true }, rules).outcome).toBe('dodged');
  });

  it('блок натиснуто за ≤150 мс до удару — паріру', () => {
    expect(resolveHit(hit, { ...base, blockHeld: true, blockPressedAt: 900 }, rules).outcome).toBe('parried');
    expect(resolveHit(hit, { ...base, blockHeld: true, blockPressedAt: 850 }, rules).outcome).toBe('parried');
    expect(resolveHit(hit, { ...base, blockHeld: true, blockPressedAt: 849 }, rules).outcome).toBe('blocked');
  });

  it('блок тратить стаміну, при нестачі — пробиття з частковою шкодою', () => {
    const b = resolveHit(hit, { ...base, blockHeld: true, blockPressedAt: 0 }, rules);
    expect(b).toEqual({ outcome: 'blocked', damageTaken: 0, staminaCost: 30 });
    const gb = resolveHit(hit, { ...base, blockHeld: true, blockPressedAt: 0, stamina: 10 }, rules);
    expect(gb.outcome).toBe('guardBreak');
    expect(gb.damageTaken).toBe(2);
    expect(gb.staminaCost).toBe(10);
  });

  it('блок спиною до ворога або неблоковний удар — повна шкода', () => {
    expect(resolveHit(hit, { ...base, facing: -1, blockHeld: true, blockPressedAt: 990 }, rules).outcome).toBe('hit');
    expect(resolveHit({ ...hit, blockable: false }, { ...base, blockHeld: true, blockPressedAt: 990 }, rules).outcome).toBe('hit');
    expect(resolveHit(hit, base, rules)).toEqual({ outcome: 'hit', damageTaken: 3, staminaCost: 0 });
  });
});

describe('hasLineOfSight (DDA)', () => {
  const g = parseRoom(['..........', '....#.....', '..........'], ROOM_LEGEND).grid;
  it('бачить по відкритій лінії, не бачить крізь скелю', () => {
    expect(hasLineOfSight(g, 16, 8, 8, 150, 8)).toBe(true);
    expect(hasLineOfSight(g, 16, 8, 24, 150, 24)).toBe(false);
    expect(hasLineOfSight(g, 16, 8, 44, 150, 36)).toBe(true); // похила лінія під каменем
    expect(hasLineOfSight(g, 16, 8, 40, 150, 8)).toBe(false); // похила лінія зачіпає камінь (4,1)
  });
  it('та сама клітинка — видно', () => {
    expect(hasLineOfSight(g, 16, 1, 1, 5, 5)).toBe(true);
  });
});
