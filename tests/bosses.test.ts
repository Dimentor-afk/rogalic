import { describe, expect, it } from 'vitest';
import { BOSSES, BOSS_ORDER } from '../src/config/bosses';
import { ENEMIES } from '../src/config/enemies';
import { FX, PLACEHOLDER_FX, SPRITES } from '../src/config/assets';
import arenas from '../src/levels/arenas.json';
import { parseRoom } from '../src/core/level/grid';

// Новий бос = спрайт + запис у конфігу + арена. Цей тест ловить помилки в такому записі.
describe('конфіг босів', () => {
  const fxExists = (name: string) => name in FX || name in PLACEHOLDER_FX;

  it('порядок колекції містить усіх босів, фінальний — один і останній', () => {
    expect([...BOSS_ORDER].sort()).toEqual(Object.keys(BOSSES).sort());
    const finals = BOSS_ORDER.filter((id) => BOSSES[id]!.final);
    expect(finals).toEqual([BOSS_ORDER[BOSS_ORDER.length - 1]]);
  });

  for (const b of Object.values(BOSSES)) {
    it(`${b.id}: спрайт, арена, фази, патерни`, () => {
      expect(SPRITES[b.sprite], `спрайт ${b.sprite}`).toBeDefined();
      const arena = arenas.find((a) => a.id === b.arena);
      expect(arena, `арена ${b.arena}`).toBeDefined();
      const room = parseRoom(arena!.rows, { '#': { solid: true }, '.': {}, '=': { oneWay: true }, P: { spawn: 'player' }, O: { spawn: 'boss' } });
      expect(room.spawns.filter((s) => s.type === 'player')).toHaveLength(1);
      expect(room.spawns.filter((s) => s.type === 'boss')).toHaveLength(1);
      // пороги фаз спадають, остання фаза — до нуля
      const th = b.phases.map((p) => p.hpAbove);
      expect([...th].sort((x, y) => y - x)).toEqual(th);
      expect(th[th.length - 1]).toBe(0);
      for (const ph of b.phases) {
        expect(ph.patterns.length).toBeGreaterThan(0);
        expect(ph.pauseMs[0]).toBeLessThanOrEqual(ph.pauseMs[1]);
        for (const p of ph.patterns) {
          expect(p.weight).toBeGreaterThan(0);
          expect(p.windupMs, `${p.kind}: телеграф має бути достатнім для реакції`).toBeGreaterThanOrEqual(300);
          if ('fx' in p) expect(fxExists(p.fx), `fx ${p.fx}`).toBe(true);
          if (p.kind === 'obstacles') expect(fxExists(p.frame), `перешкода ${p.frame}`).toBe(true);
          if (p.kind === 'summon') expect(ENEMIES[p.enemy], `міньйон ${p.enemy}`).toBeDefined();
          // наземні патерни (стрибок) не для літунів
          if (b.flying) expect(p.kind).not.toBe('slam');
        }
      }
      // «підкручування» лишає чесне вікно реакції
      if (b.rigged) expect(b.rigged.reactMs).toBeGreaterThanOrEqual(250);
      // множники фріспінів — лише ті, що є символами
      for (const v of Object.keys(b.freeSpins.multipliers)) expect(['2', '5', '10', '25']).toContain(v);
    });
  }

  it('вороги підземелля: усі архетипи є, кожен має спрайт', () => {
    const arch = new Set(Object.values(ENEMIES).filter((e) => e.spawn).map((e) => e.archetype));
    for (const a of ['fast', 'heavy', 'ranged', 'splitter', 'thief']) expect(arch).toContain(a);
    for (const e of Object.values(ENEMIES)) expect(SPRITES[e.sprite], e.sprite).toBeDefined();
  });
});
