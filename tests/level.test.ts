import { describe, expect, it } from 'vitest';
import { isSolid, parseRoom } from '../src/core/level/grid';
import { autotile, distanceToEmpty, type TilesetDef } from '../src/core/level/autotile';
import { hash32, mulberry32, weightedPick } from '../src/core/rng';
import { ROOM_LEGEND } from '../src/config/legend';
import testCave from '../src/levels/test-cave.json';

const TS: TilesetDef = {
  atlas: 't',
  tileSize: 16,
  fill: { frames: ['fill'] },
  top: { frames: ['top'], offsetY: -16 },
  bottom: { frames: ['bottom'] },
  left: { frames: ['left'], offsetX: -16 },
  right: { frames: ['right'] },
};

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

  it('тестова печера коректна і має гравця', () => {
    const r = parseRoom(testCave.rows, ROOM_LEGEND);
    expect(r.spawns.filter((s) => s.type === 'player')).toHaveLength(1);
  });
});

describe('autotile', () => {
  it('одна тверда клітинка в порожнечі: fill + 4 краї з правильними зсувами і порядком шарів', () => {
    // сітка 3×3, тверда лише середина — усі 4 сторони відкриті
    const r = parseRoom(['...', '.#.', '...'], ROOM_LEGEND);
    const ops = autotile(r.grid, TS, 1);
    // центральна клітинка (1,1) → px (16,16)
    expect(ops).toEqual([
      { frame: 'fill', x: 16, y: 16, shade: 1 },
      { frame: 'left', x: 0, y: 16, shade: 1 },
      { frame: 'right', x: 16, y: 16, shade: 1 },
      { frame: 'bottom', x: 16, y: 16, shade: 1 },
      { frame: 'top', x: 16, y: 0, shade: 1 },
    ]);
  });

  it('закриті сторони не отримують країв', () => {
    const r = parseRoom(['###', '###'], ROOM_LEGEND);
    const ops = autotile(r.grid, TS, 1);
    expect(ops.every((o) => o.frame === 'fill')).toBe(true);
    expect(ops).toHaveLength(6);
  });

  it('distanceToEmpty: BFS-відстань до порожнечі по 8 напрямках', () => {
    const g = parseRoom(['#####', '#####', '##.##', '#####', '#####'], ROOM_LEGEND).grid;
    const d = distanceToEmpty(g);
    expect(d[2 * 5 + 2]).toBe(0); // сама порожня клітинка
    expect(d[1 * 5 + 1]).toBe(1); // діагональний сусід
    expect(d[0]).toBe(2); // кут
    expect(distanceToEmpty(parseRoom(['##'], ROOM_LEGEND).grid)[0]).toBe(Infinity);
  });

  it('depthShade: заповнення темнішає вглиб, краї завжди яскраві', () => {
    const g = parseRoom(['.####', '#####', '#####'], ROOM_LEGEND).grid;
    const ops = autotile(g, { ...TS, depthShade: [1, 0.5, 0.25] }, 1);
    const fillAt = (x: number, y: number) => ops.find((o) => o.frame === 'fill' && o.x === x * 16 && o.y === y * 16)!.shade;
    expect(fillAt(1, 0)).toBe(1);
    expect(fillAt(2, 0)).toBe(0.5);
    expect(fillAt(4, 2)).toBe(0.25); // глибше за довжину масиву — останнє значення
    expect(ops.filter((o) => o.frame !== 'fill').every((o) => o.shade === 1)).toBe(true);
  });

  it('той самий seed — той самий візерунок, інший seed — інший', () => {
    const ts: TilesetDef = { ...TS, fill: { frames: ['a', 'b', 'c', 'd'] } };
    const grid = parseRoom(testCave.rows, ROOM_LEGEND).grid;
    const a = autotile(grid, ts, 42).map((o) => o.frame).join();
    expect(autotile(grid, ts, 42).map((o) => o.frame).join()).toBe(a);
    expect(autotile(grid, ts, 43).map((o) => o.frame).join()).not.toBe(a);
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
