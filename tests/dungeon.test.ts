import { describe, expect, it } from 'vitest';
import rooms from '../src/levels/rooms.json';
import { buildGraph, chooseTemplate, embedGraph, generateDungeon, mirrorTemplate, type RoomTemplate } from '../src/core/dungeon/generator';
import { canStand, fall, reachableFrom, stateKey } from '../src/core/dungeon/reachability';
import { EXIT_SLOTS, ROOM_SIZE } from '../src/config/dungeon';
import { createGrid, type Grid } from '../src/core/level/grid';
import { mulberry32 } from '../src/core/rng';
import { CURSES } from '../src/config/curses';

const TEMPLATES = rooms as RoomTemplate[];

/** Сітка з одного шаблону з УСІМА його виходами відкритими (поза кімнатою — скеля). */
function templateGrid(t: RoomTemplate): { g: Grid; marks: Record<string, [number, number][]> } {
  const g = createGrid(ROOM_SIZE.w, ROOM_SIZE.h);
  const marks: Record<string, [number, number][]> = {};
  t.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      (marks[ch] ??= []).push([x, y]);
      if (ch === '#') g.solid[y * g.width + x] = 1;
      if (ch === '=' || ch === 'U' || ch === 'D') g.oneWay[y * g.width + x] = 1;
    }),
  );
  return { g, marks };
}

/** «Входи» шаблону: де опиняється гравець, коли заходить через кожен вихід. */
function entries(t: RoomTemplate, g: Grid): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const last = EXIT_SLOTS.sideRows[EXIT_SLOTS.sideRows.length - 1]!;
  if (t.exits.includes('L')) out.L = [0, last];
  if (t.exits.includes('R')) out.R = [ROOM_SIZE.w - 1, last];
  // згори — падаємо з отвору; вниз — стоїмо на дошці нижнього виходу
  if (t.exits.includes('U')) out.U = fall(g, EXIT_SLOTS.vertCols[1]!, 0) ?? [-1, -1];
  if (t.exits.includes('D')) out.D = [EXIT_SLOTS.vertCols[1]!, ROOM_SIZE.h - 2];
  return out;
}

describe('шаблони кімнат', () => {
  it('усі 30×17, у кожного є виходи, старт має P, вихід — E і V, скарбниця — C', () => {
    for (const t of TEMPLATES) {
      expect(t.rows).toHaveLength(ROOM_SIZE.h);
      for (const r of t.rows) expect(r.length, t.id).toBe(ROOM_SIZE.w);
      expect(t.exits.length, t.id).toBeGreaterThan(0);
      const text = t.rows.join('');
      if (t.type === 'start') expect(text.includes('P'), t.id).toBe(true);
      if (t.type === 'exit') expect(text.includes('E') && text.includes('V'), t.id).toBe(true);
      if (t.type === 'treasure') expect(text.includes('C'), t.id).toBe(true);
    }
  });

  it('маркери виходів стоять на стандартних позиціях', () => {
    for (const t of TEMPLATES) {
      for (const d of t.exits) {
        for (const r of EXIT_SLOTS.sideRows) {
          if (d === 'L') expect(t.rows[r]![0], t.id).toBe('L');
          if (d === 'R') expect(t.rows[r]![ROOM_SIZE.w - 1], t.id).toBe('R');
        }
        for (const c of EXIT_SLOTS.vertCols) {
          if (d === 'U') expect(t.rows[0]![c], t.id).toBe('U');
          if (d === 'D') expect(t.rows[ROOM_SIZE.h - 1]![c], t.id).toBe('D');
        }
      }
    }
  });

  for (const t of TEMPLATES) {
    it(`${t.id}: з кожного входу досяжні всі інші входи і важливі об'єкти`, () => {
      const { g, marks } = templateGrid(t);
      const ent = entries(t, g);
      const targets: [string, [number, number]][] = [...Object.entries(ent)];
      for (const m of ['P', 'C', 'E', 'V']) for (const p of marks[m] ?? []) targets.push([m, p]);
      for (const [from, [fx, fy]] of Object.entries(ent)) {
        const reach = reachableFrom(g, fx, fy);
        for (const [name, [tx, ty]] of targets) {
          const land = canStand(g, tx, ty) ? [tx, ty] : fall(g, tx, ty);
          expect(land, `${t.id}: ${name} без опори`).not.toBeNull();
          expect(reach.has(stateKey(g, land![0]!, land![1]!)), `${t.id}: ${from} → ${name}`).toBe(true);
        }
      }
    });
  }

  it('дзеркальна копія міняє L↔R і віддзеркалює рядки', () => {
    const t: RoomTemplate = { id: 'x', type: 'combat', exits: 'LU', rows: ['L.#', 'l..'] };
    const m = mirrorTemplate(t);
    expect(m.exits).toBe('RU');
    expect(m.rows).toEqual(['#.R', '..r']);
  });
});

describe('граф і розкладка', () => {
  it('граф: старт → бойові → вихід, відгалуження чіпляються до бойових', () => {
    const nodes = buildGraph(mulberry32(1), 1);
    expect(nodes[0]!.type).toBe('start');
    const main = nodes.filter((n) => n.main);
    expect(main[main.length - 1]!.type).toBe('exit');
    for (const n of nodes.filter((n) => !n.main)) expect(nodes[n.parent!]!.type === 'combat' || nodes[n.parent!]!.type === 'combat').toBe(true);
    expect(nodes.some((n) => n.type === 'treasure')).toBe(true);
  });

  it('глибше — довший головний шлях', () => {
    const len = (d: number) => buildGraph(mulberry32(5), d).filter((n) => n.main).length;
    expect(len(4)).toBeGreaterThan(len(1));
  });

  it('розкладка: кожна кімната в окремій клітинці, сусідні по графу — сусіди на сітці', () => {
    const rng = mulberry32(42);
    const nodes = buildGraph(rng, 3);
    const cells = embedGraph(rng, nodes, 7, 5)!;
    expect(cells).not.toBeNull();
    expect(new Set(cells.map((c) => `${c.mx},${c.my}`)).size).toBe(nodes.length);
    for (const n of nodes) {
      if (n.parent === null) continue;
      const a = cells[n.id]!;
      const b = cells[n.parent]!;
      expect(Math.abs(a.mx - b.mx) + Math.abs(a.my - b.my)).toBe(1);
    }
  });

  it('chooseTemplate бере шаблон з потрібними виходами (з урахуванням дзеркала)', () => {
    const rng = mulberry32(3);
    const t = chooseTemplate(rng, TEMPLATES, 'combat', ['L', 'D'])!;
    expect(t.exits.includes('L') && t.exits.includes('D')).toBe(true);
    expect(chooseTemplate(rng, TEMPLATES, 'exit', ['U', 'D', 'L', 'R'])).not.toBeNull();
  });
});

describe('generateDungeon', () => {
  it('той самий seed — те саме підземелля; інший seed — інше', () => {
    const a = generateDungeon({ seed: 123, depth: 2, templates: TEMPLATES });
    const b = generateDungeon({ seed: 123, depth: 2, templates: TEMPLATES });
    const c = generateDungeon({ seed: 124, depth: 2, templates: TEMPLATES });
    expect(Array.from(a.grid.solid)).toEqual(Array.from(b.grid.solid));
    expect(a.spawns).toEqual(b.spawns);
    expect(Array.from(a.grid.solid).join('') === Array.from(c.grid.solid).join('') && a.grid.width === c.grid.width).toBe(false);
  });

  it('200 seed × глибини 1–6: генерується, має старт, ліфт і спуск, усе важливе досяжне', () => {
    for (let depth = 1; depth <= 6; depth++) {
      for (let seed = 1; seed <= 200; seed += depth) {
        const lvl = generateDungeon({ seed, depth, templates: TEMPLATES });
        const kinds = lvl.spawns.map((s) => s.kind);
        expect(kinds.filter((k) => k === 'player')).toHaveLength(1);
        expect(kinds).toContain('elevator');
        expect(kinds).toContain('descent');
        expect(kinds).toContain('chest');
      }
    }
  });

  it('вороги: на глибині 1 немає ворогів, що з’являються глибше', () => {
    for (let seed = 1; seed < 40; seed++) {
      const lvl = generateDungeon({ seed, depth: 1, templates: TEMPLATES });
      for (const s of lvl.spawns.filter((s) => s.kind === 'enemy')) expect(['spiderBrute', 'spiderSpitter', 'spiderVenom']).not.toContain(s.enemyId);
    }
  });

  it('мішок смерті з’являється лише на своїй глибині; прокляття «гурт» подвоює ворогів', () => {
    const withBag = generateDungeon({ seed: 9, depth: 2, templates: TEMPLATES, bag: { depth: 2, chips: 500 } });
    expect(withBag.spawns.find((s) => s.kind === 'bag')?.chips).toBe(500);
    const otherDepth = generateDungeon({ seed: 9, depth: 3, templates: TEMPLATES, bag: { depth: 2, chips: 500 } });
    expect(otherDepth.spawns.some((s) => s.kind === 'bag')).toBe(false);
    const normal = generateDungeon({ seed: 9, depth: 3, templates: TEMPLATES });
    const horde = generateDungeon({ seed: 9, depth: 3, templates: TEMPLATES, curse: CURSES.horde });
    const count = (l: typeof normal) => l.spawns.filter((s) => s.kind === 'enemy').length;
    expect(count(horde)).toBe(count(normal) * 2);
  });
});
