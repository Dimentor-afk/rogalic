import { describe, expect, it } from 'vitest';
import rooms from '../src/levels/rooms.json';
import { buildGraph, chooseTemplate, embedGraph, generateDungeon, mirrorTemplate, type RoomTemplate } from '../src/core/dungeon/generator';
import { canStand, DEFAULT_MOVE_RULES, fall, reachableFrom, stateKey } from '../src/core/dungeon/reachability';
import { EXIT_SLOTS, LAYOUT, ROOM_SIZE } from '../src/config/dungeon';
import { createGrid, isOneWay, type Grid } from '../src/core/level/grid';
import { mulberry32 } from '../src/core/rng';
import { CURSES } from '../src/config/curses';
import { ENEMIES } from '../src/config/enemies';

const TEMPLATES = rooms as RoomTemplate[];

/** Найбільше дошок (= і ^) в одному шаблоні: кімнати мають бути спокійними, без «драбин» з полиць. */
const MAX_PLANKS_PER_ROOM = 20;

/** Сітка з одного шаблону з УСІМА його виходами відкритими (поза кімнатою — скеля). */
function templateGrid(t: RoomTemplate): { g: Grid; marks: Record<string, [number, number][]> } {
  const g = createGrid(ROOM_SIZE.w, ROOM_SIZE.h);
  const marks: Record<string, [number, number][]> = {};
  t.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      (marks[ch] ??= []).push([x, y]);
      if (ch === '#') g.solid[y * g.width + x] = 1;
      if (ch === '=' || ch === '^' || ch === 'U' || ch === 'D') g.oneWay[y * g.width + x] = 1;
    }),
  );
  return { g, marks };
}

/** Рядок клітинок: # скеля, = дошка, решта порожньо (для коротких тестових карт). */
function asciiGrid(rows: string[]): Grid {
  const g = createGrid(rows[0]!.length, rows.length);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#') g.solid[y * g.width + x] = 1;
      if (ch === '=') g.oneWay[y * g.width + x] = 1;
    }),
  );
  return g;
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

  for (const t of TEMPLATES) {
    it(`${t.id}: на кожну дошку можна стати, застрибнувши з підлоги кімнати`, () => {
      const { g } = templateGrid(t);
      for (const [from, [fx, fy]] of Object.entries(entries(t, g))) {
        const reach = reachableFrom(g, fx, fy);
        // рядок 0 і останній — дошки вертикальних виходів на кордоні, їх перевіряють сусідні кімнати
        for (let y = 1; y < ROOM_SIZE.h - 1; y++) {
          for (let x = 0; x < ROOM_SIZE.w; x++) {
            if (!isOneWay(g, x, y)) continue;
            expect(canStand(g, x, y - 1), `${t.id}: над дошкою (${x}, ${y}) не вміщається лицар`).toBe(true);
            expect(reach.has(stateKey(g, x, y - 1)), `${t.id}: ${from} → дошка (${x}, ${y})`).toBe(true);
          }
        }
      }
    });
  }

  it(`у шаблоні не більше ${MAX_PLANKS_PER_ROOM} клітинок дощок, у бойових — 3–6 слотів наземних ворогів`, () => {
    for (const t of TEMPLATES) {
      const text = t.rows.join('');
      const planks = [...text].filter((ch) => ch === '=' || ch === '^').length;
      expect(planks, t.id).toBeLessThanOrEqual(MAX_PLANKS_PER_ROOM);
      // дошки підйому ^ мають сенс лише з верхнім виходом
      if (text.includes('^')) expect(t.exits.includes('U'), t.id).toBe(true);
      const ground = [...text].filter((ch) => ch === 'e').length;
      // вертикальний колодязь (лише U/D) — перехідна кімната, у ній ворогів менше
      if (t.type === 'combat' && /[LR]/.test(t.exits)) {
        expect(ground, t.id).toBeGreaterThanOrEqual(3);
        expect(ground, t.id).toBeLessThanOrEqual(6);
      }
    }
  });

  it('дзеркальна копія міняє L↔R і віддзеркалює рядки', () => {
    const t: RoomTemplate = { id: 'x', type: 'combat', exits: 'LU', rows: ['L.#', 'l..'] };
    const m = mirrorTemplate(t);
    expect(m.exits).toBe('RU');
    expect(m.rows).toEqual(['#.R', '..r']);
  });
});

describe('модель руху (reachability)', () => {
  it('прохід заввишки 2 клітинки лицарю (3) закритий, а низькому героєві (2) — ні', () => {
    const g = asciiGrid(['##########', '#..####..#', '#........#', '#........#', '##########']);
    const reach3 = reachableFrom(g, 1, 3);
    expect(reach3.has(stateKey(g, 8, 3))).toBe(false);
    const reach2 = reachableFrom(g, 1, 3, { ...DEFAULT_MOVE_RULES, bodyHeight: 2 });
    expect(reach2.has(stateKey(g, 8, 3))).toBe(true);
    expect(canStand(g, 4, 3)).toBe(false);
    expect(canStand(g, 1, 3)).toBe(true);
  });

  it('стрибок: дошка на 3 рядки вище досяжна, на 4 — ні', () => {
    // підлога — рядок 8, гравець стоїть у рядку 7
    const room = (plankRow: number) =>
      asciiGrid(Array.from({ length: 9 }, (_, y) => (y === 0 || y === 8 ? '#######' : y === plankRow ? '#..=..#' : '#.....#')));
    const three = room(5);
    expect(reachableFrom(three, 1, 7).has(stateKey(three, 3, 4))).toBe(true);
    const four = room(4);
    expect(canStand(four, 3, 3)).toBe(true);
    expect(reachableFrom(four, 1, 7).has(stateKey(four, 3, 3))).toBe(false);
  });

  it('стрибок упирається головою в стелю з урахуванням зросту', () => {
    // дошка на 2 рядки вище, але над нею лише 2 вільні клітинки — лицар там не вміщається
    const low = asciiGrid(['#######', '#######', '#######', '#.....#', '#.....#', '#..=..#', '#.....#', '#######']);
    expect(canStand(low, 3, 4)).toBe(false);
    expect(reachableFrom(low, 1, 6).has(stateKey(low, 3, 4))).toBe(false);
    const short = { ...DEFAULT_MOVE_RULES, bodyHeight: 2 };
    expect(reachableFrom(low, 1, 6, short).has(stateKey(low, 3, 4))).toBe(true);
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
    const cells = embedGraph(rng, nodes, LAYOUT.gridW, LAYOUT.gridH)!;
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

  it('600 seed × глибини 1–7: генерується, має старт, ліфт, спуск і скриню', { timeout: 120_000 }, () => {
    for (let depth = 1; depth <= 7; depth++) {
      for (let seed = 1; seed <= 600; seed++) {
        const lvl = generateDungeon({ seed, depth, templates: TEMPLATES });
        const kinds = lvl.spawns.map((s) => s.kind);
        expect(kinds.filter((k) => k === 'player')).toHaveLength(1);
        expect(kinds).toContain('elevator');
        expect(kinds).toContain('descent');
        expect(kinds).toContain('chest');
      }
    }
  });

  it('лицар (3 клітинки заввишки) дістається з старту до кожної кімнати, скрині, бочки і наземного ворога', { timeout: 60_000 }, () => {
    expect(DEFAULT_MOVE_RULES.bodyHeight).toBe(3);
    for (let depth = 1; depth <= 7; depth++) {
      for (let seed = depth; seed <= 600; seed += 7) {
        const lvl = generateDungeon({ seed, depth, templates: TEMPLATES });
        const g = lvl.grid;
        const start = lvl.spawns.find((s) => s.kind === 'player')!;
        const reach = reachableFrom(g, start.x, start.y);
        const at = (x: number, y: number) => {
          const land = canStand(g, x, y) ? [x, y] : fall(g, x, y);
          return !!land && reach.has(stateKey(g, land[0]!, land[1]!));
        };
        for (const s of lvl.spawns) {
          if (s.kind === 'door') continue; // двері стоять у самому отворі виходу
          if (s.kind === 'enemy' && ENEMIES[s.enemyId!]?.flying) continue;
          expect(at(s.x, s.y), `seed ${seed}, глибина ${depth}: ${s.kind} (${s.x}, ${s.y})`).toBe(true);
        }
        // у кожній кімнаті є досяжне місце
        for (const r of lvl.rooms) {
          let found = false;
          for (let y = r.y + 1; y < r.y + ROOM_SIZE.h - 1 && !found; y++) {
            for (let x = r.x + 1; x < r.x + ROOM_SIZE.w - 1 && !found; x++) found = reach.has(stateKey(g, x, y));
          }
          expect(found, `seed ${seed}, глибина ${depth}: кімната ${r.template}`).toBe(true);
        }
      }
    }
  });

  it('вертикальні переходи між кімнатами рідкісні: здебільшого поверх іде вбік', () => {
    let links = 0;
    let vertical = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const lvl = generateDungeon({ seed, depth: 1 + (seed % 7), templates: TEMPLATES });
      for (const r of lvl.rooms) {
        if (r.node.parent === null) continue;
        links++;
        if (lvl.rooms[r.node.parent]!.mx === r.mx) vertical++;
      }
    }
    expect(vertical / links).toBeLessThan(0.3);
  });

  it('дошки підйому ^ з’являються лише в кімнатах з використаним верхнім виходом', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const lvl = generateDungeon({ seed, depth: 3, templates: TEMPLATES });
      for (const r of lvl.rooms) {
        if (r.exits.includes('U')) continue;
        const tpl = TEMPLATES.find((t) => t.id === r.template)!;
        tpl.rows.forEach((row, y) =>
          [...row].forEach((ch, x) => {
            const gx = r.x + (r.mirrored ? ROOM_SIZE.w - 1 - x : x);
            if (ch === '^') expect(isOneWay(lvl.grid, gx, r.y + y), `${r.template} (${x}, ${y})`).toBe(false);
          }),
        );
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
