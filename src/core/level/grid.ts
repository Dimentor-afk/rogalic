/**
 * Рівень як сітка клітинок + точки появи об'єктів.
 * Шаблони кімнат пишемо ASCII-рядками (пізніше — Tiled), легенда символів — у конфігу.
 * Модуль без Phaser: його використовують і гра, і тести, і (пізніше) генератор підземелля.
 */

export interface Grid {
  width: number;
  height: number;
  /** 1 — тверда клітинка, 0 — порожня. Row-major: index = y * width + x. */
  solid: Uint8Array;
  /** 1 — одностороння платформа (дерев'яна дошка): стоїш зверху, знизу проходиш наскрізь. */
  oneWay: Uint8Array;
}

export interface Spawn {
  /** Тип з легенди, напр. "player", "dummy". */
  type: string;
  /** Координати клітинки. */
  x: number;
  y: number;
}

export interface LegendEntry {
  solid?: boolean;
  oneWay?: boolean;
  spawn?: string;
}

export type Legend = Record<string, LegendEntry>;

export interface ParsedRoom {
  grid: Grid;
  spawns: Spawn[];
}

export function createGrid(width: number, height: number): Grid {
  return { width, height, solid: new Uint8Array(width * height), oneWay: new Uint8Array(width * height) };
}

/** Клітинки за межами сітки вважаємо твердими (за замовчуванням): рівень «замкнений» у скелі. */
export function isSolid(g: Grid, x: number, y: number, outside = true): boolean {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return outside;
  return g.solid[y * g.width + x] === 1;
}

export function setSolid(g: Grid, x: number, y: number, v: boolean): void {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return;
  g.solid[y * g.width + x] = v ? 1 : 0;
}

/** За межами сітки односторонніх платформ немає. */
export function isOneWay(g: Grid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return false;
  return g.oneWay[y * g.width + x] === 1;
}

/** Розбирає ASCII-кімнату. Усі рядки мають бути однакової довжини. */
export function parseRoom(rows: readonly string[], legend: Legend): ParsedRoom {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const grid = createGrid(width, height);
  const spawns: Spawn[] = [];

  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Рядок ${y} має довжину ${row.length}, очікувалось ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const ch = row[x]!;
      const entry = legend[ch];
      if (!entry) throw new Error(`Невідомий символ "${ch}" у (${x}, ${y})`);
      if (entry.solid) setSolid(grid, x, y, true);
      if (entry.oneWay) grid.oneWay[y * width + x] = 1;
      if (entry.spawn) spawns.push({ type: entry.spawn, x, y });
    }
  });

  return { grid, spawns };
}
