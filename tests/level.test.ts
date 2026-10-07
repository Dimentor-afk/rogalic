import { describe, expect, it } from 'vitest';
import { isOneWay, isSolid, parseRoom } from '../src/core/level/grid';
import { autotile, buildMaskTable, distanceToEmpty, keyOf, maskOf, scaffoldCells, type TilesetDef } from '../src/core/level/autotile';
import { hash32, mulberry32, weightedPick } from '../src/core/rng';
import { ROOM_LEGEND } from '../src/config/legend';
import testCave from '../src/levels/test-cave.json';

const TS: TilesetDef = {
  atlas: 't',
  tileSize: 16,
  solid: {
    '': [{ frame: 'fill' }],
    T: [{ frame: 'top' }],
    R: [{ frame: 'right' }],
    L: [{ frame: 'right', flipX: true }],
    B: [{ frame: 'bottom' }],
    TR: [{ frame: 'tr' }],
  },
};

const frameAt = (ops: ReturnType<typeof autotile>, x: number, y: number) => ops.find((o) => o.x === x * 16 && o.y === y * 16);
describe('parseRoom', () => {
  it('будує сітку і знаходить точки появи', () => {
    const r = parseRoom(['####', '#P.#', '####'], ROOM_LEGEND);
    expect([r.grid.width, r.grid.height]).toEqual([4, 3]);
    expect(isSolid(r.grid, 0, 0)).toBe(true);
    expect(isSolid(r.grid, 1, 1)).toBe(false);
    expect(r.spawns).toEqual([{ type: 'player', x: 1, y: 1 }]);
  });

  it('за межами сітки — твердо (за замовчуванням)', () => {
    const r = parseRoom(['..'], ROOM_LEGEND);
    expect(isSolid(r.grid, -1, 0)).toBe(true);
    expect(isSolid(r.grid, 0, 5, false)).toBe(false);
  });

  it('помилки: невідомий символ, різна довжина рядків', () => {
    expect(() => parseRoom(['#?'], ROOM_LEGEND)).toThrow(/\?/);
    expect(() => parseRoom(['##', '#'], ROOM_LEGEND)).toThrow(/довжину/);
  });

  it('= — одностороння платформа, не тверда', () => {
    const r = parseRoom(['.=.'], ROOM_LEGEND);
    expect(isSolid(r.grid, 1, 0)).toBe(false);
    expect(isOneWay(r.grid, 1, 0)).toBe(true);
    expect(isOneWay(r.grid, -1, 0)).toBe(false);
  });

  it('тестова печера коректна і має гравця', () => {
    const r = parseRoom(testCave.rows, ROOM_LEGEND);
    expect(r.spawns.filter((s) => s.type === 'player')).toHaveLength(1);
  });
});

describe('autotile: маска сусідів', () => {
  it('maskOf / keyOf — взаємно обернені, порядок T R B L', () => {
    expect(maskOf('')).toBe(0);
    expect(maskOf('TRBL')).toBe(15);
    expect(maskOf('BL')).toBe(12);
    for (let m = 0; m < 16; m++) expect(maskOf(keyOf(m))).toBe(m);
    expect(() => maskOf('X')).toThrow();
  });

  it('buildMaskTable: точний збіг або найбільша визначена підмаска з перевагою верху', () => {
    const t = buildMaskTable(TS.solid);
    expect(t[maskOf('TR')]![0]!.frame).toBe('tr');
    expect(t[maskOf('L')]![0]!.flipX).toBe(true);
    expect(t[maskOf('TB')]![0]!.frame).toBe('top'); // TB не задано → T (верх важливіший за низ)
    expect(t[maskOf('TRB')]![0]!.frame).toBe('tr'); // найбільша підмаска
    expect(t[maskOf('RL')]![0]!.frame).toBe('right'); // R і L рівні → менша маска (R)
    expect(() => buildMaskTable({ T: [{ frame: 'x' }] })).toThrow(/заповнення/);
  });

  it('клітинки отримують шматок за відкритими сторонами', () => {
    // 4×3: верхній ряд порожній, далі скеля; за межами сітки — твердо
    const g = parseRoom(['....', '####', '####'], ROOM_LEGEND).grid;
    const ops = autotile(g, TS, 1);
    expect(frameAt(ops, 0, 1)!.frame).toBe('top');
    expect(frameAt(ops, 3, 1)!.frame).toBe('top'); // правий край межує з «твердим» кордоном
    expect(frameAt(ops, 1, 2)!.frame).toBe('fill');
  });

  it('стовп посеред порожнечі: TRL → TR, RL → R', () => {
    const g = parseRoom(['...', '.#.', '.#.', '###'], ROOM_LEGEND).grid;
    const ops = autotile(g, TS, 1);
    expect(frameAt(ops, 1, 1)!.frame).toBe('tr'); // TRL → найбільша підмаска TR
    const mid = frameAt(ops, 1, 2)!; // RL → R
    expect(mid.frame).toBe('right');
  });

  it('тонкий шар скелі (TB) використовує набір підлоги', () => {
    const g = parseRoom(['...', '###', '...', '###'], ROOM_LEGEND).grid;
    expect(frameAt(autotile(g, TS, 1), 1, 1)!.frame).toBe('top');
  });

  it('distanceToEmpty: BFS-відстань до порожнечі по 8 напрямках', () => {
    const g = parseRoom(['#####', '#####', '##.##', '#####', '#####'], ROOM_LEGEND).grid;
    const d = distanceToEmpty(g);
    expect(d[2 * 5 + 2]).toBe(0);
    expect(d[1 * 5 + 1]).toBe(1);
    expect(d[0]).toBe(2);
    expect(distanceToEmpty(parseRoom(['##'], ROOM_LEGEND).grid)[0]).toBe(Infinity);
  });

  it('depthShade: заповнення темнішає вглиб, краї завжди яскраві', () => {
    const g = parseRoom(['.####', '#####', '#####'], ROOM_LEGEND).grid;
    const ops = autotile(g, { ...TS, depthShade: [1, 0.5, 0.25] }, 1);
    const fillShade = (x: number, y: number) => ops.find((o) => o.frame === 'fill' && o.x === x * 16 && o.y === y * 16)!.shade;
    expect(fillShade(2, 0)).toBe(0.5);
    expect(fillShade(4, 2)).toBe(0.25);
    expect(ops.filter((o) => o.frame !== 'fill').every((o) => o.shade === 1)).toBe(true);
  });

  it('той самий seed — той самий візерунок, інший seed — інший', () => {
    const ts: TilesetDef = { ...TS, solid: { ...TS.solid, '': ['a', 'b', 'c', 'd'].map((frame) => ({ frame })) } };
    const grid = parseRoom(testCave.rows, ROOM_LEGEND).grid;
    const a = autotile(grid, ts, 42).map((o) => o.frame).join();
    expect(autotile(grid, ts, 42).map((o) => o.frame).join()).toBe(a);
    expect(autotile(grid, ts, 43).map((o) => o.frame).join()).not.toBe(a);
  });
});

describe('autotile: дошки, риштування, декор', () => {
  const WOOD: TilesetDef = {
    ...TS,
    plank: { left: [{ frame: 'pl' }], mid: [{ frame: 'pm' }], right: [{ frame: 'pr' }] },
    scaffold: { frames: ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'], minRun: 3, doubleRun: 8, maxDepth: 10 },
  };

  it('дошка: лівий край, середина, правий край; одиночна — середина', () => {
    const g = parseRoom(['......', '.===.=', '......', '######'], ROOM_LEGEND).grid;
    const ops = autotile(g, WOOD, 1);
    expect([1, 2, 3, 5].map((x) => frameAt(ops, x, 1)!.frame)).toEqual(['pl', 'pm', 'pr', 'pm']);
  });

  it('риштування: 3 стовпці під центром дошки до землі, візерунок повторюється кожні 3 рядки', () => {
    const rows = ['.......', '.=====.', '.......', '.......', '.......', '.......', '#######'];
    const cells = scaffoldCells(parseRoom(rows, ROOM_LEGEND).grid, WOOD.scaffold!);
    // дошка x=1..5 (довжина 5) → опора x=2..4; глибина 4 рядки (y=2..5)
    expect(new Set(cells.map((c) => c.x))).toEqual(new Set([2, 3, 4]));
    expect(cells.filter((c) => c.x === 2).map((c) => c.frame)).toEqual(['s0', 's3', 's6', 's0']);
  });

  it('риштування: довга дошка — дві опори; без землі в межах maxDepth — нічого', () => {
    const long = ['..........', '=========.', '..........', '##########'];
    const xs = new Set(scaffoldCells(parseRoom(long, ROOM_LEGEND).grid, WOOD.scaffold!).map((c) => c.x));
    expect(xs).toEqual(new Set([0, 1, 2, 6, 7, 8]));
    const air = ['.....', '.===.', '.....', '.....'];
    expect(scaffoldCells(parseRoom(air, ROOM_LEGEND).grid, { ...WOOD.scaffold!, maxDepth: 2 })).toEqual([]);
  });

  it('сталактити: лише під клітинками з порожнечею знизу, з заданим шансом', () => {
    const rows = ['#'.repeat(40), '#'.repeat(40), '.'.repeat(40), '#'.repeat(40)];
    const g = parseRoom(rows, ROOM_LEGEND).grid;
    const always = autotile(g, { ...TS, decor: [{ side: 'bottom', chance: 1, pieces: [{ frame: 'st' }] }] }, 1);
    const st = always.filter((o) => o.frame === 'st');
    expect(st).toHaveLength(40);
    expect(st.every((o) => o.y === 2 * 16)).toBe(true); // висять у клітинці під стелею
    const never = autotile(g, { ...TS, decor: [{ side: 'bottom', chance: 0, pieces: [{ frame: 'st' }] }] }, 1);
    expect(never.some((o) => o.frame === 'st')).toBe(false);
    // прохід заввишки 1 клітинка, а треба 2 — сталактитів немає
    const low = autotile(g, { ...TS, decor: [{ side: 'bottom', chance: 1, minClear: 2, pieces: [{ frame: 'st' }] }] }, 1);
    expect(low.some((o) => o.frame === 'st')).toBe(false);
  });

  it('порядок шарів: риштування → скеля → декор → дошки', () => {
    const rows = ['.....', '.===.', '.....', '#####'];
    const ops = autotile(parseRoom(rows, ROOM_LEGEND).grid, WOOD, 1);
    const firstRock = ops.findIndex((o) => o.frame === 'top');
    expect(ops.findIndex((o) => o.frame.startsWith('s'))).toBeLessThan(firstRock);
    expect(ops.findIndex((o) => o.frame.startsWith('p'))).toBeGreaterThan(firstRock);
  });
});

describe('rng', () => {
  it('mulberry32 відтворюваний і в [0,1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hash32 стабільний і чутливий до кожного аргумента', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(1, 3, 2));
  });

  it('weightedPick поважає ваги', () => {
    const counts = { a: 0, b: 0 };
    const r = mulberry32(1);
    for (let i = 0; i < 10000; i++) counts[weightedPick(['a', 'b'] as const, [3, 1], r())]++;
    expect(counts.a / 10000).toBeGreaterThan(0.72);
    expect(counts.a / 10000).toBeLessThan(0.78);
  });
});
