/**
 * Автотайлінг: тверда/порожня сітка → список «що і де намалювати».
 *
 * Печерний тайлсет — не класичний 47-тайловий набір, а шматки скелі з «наростами»,
 * що вилазять за межі клітинки. Тому алгоритм простий і пошаровий:
 *   1. кожна тверда клітинка → тайл заповнення (fill);
 *   2. для кожної відкритої сторони твердої клітинки (сусід порожній) → крайовий шматок
 *      (left / right / bottom / top) зі своїм зсувом, щоб наріст ліз у порожню клітинку;
 *   3. малюємо шарами: fill → стіни → стеля → підлога (підлога останньою, щоб її верх перекривав усе).
 * Варіант шматка обирається хешем (seed, x, y, роль) — візерунок стабільний і не залежить від порядку обходу.
 *
 * Модуль без Phaser — тестується в Vitest.
 */
import { hash32, weightedPick } from '../rng';
import { isSolid, type Grid } from './grid';

export interface PieceSet {
  /** Імена кадрів атласу. */
  frames: readonly string[];
  /** Необов'язкові ваги варіантів (той самий порядок, що й frames). */
  weights?: readonly number[];
  /** Зсув малювання відносно лівого верхнього кута клітинки, px. */
  offsetX?: number;
  offsetY?: number;
}

export interface TilesetDef {
  atlas: string;
  tileSize: number;
  fill: PieceSet;
  /** Відкрита сторона зверху (підлога, по якій ходять). */
  top: PieceSet;
  /** Відкрита сторона знизу (стеля). */
  bottom: PieceSet;
  /** Відкрита ліва сторона. */
  left: PieceSet;
  /** Відкрита права сторона. */
  right: PieceSet;
  /**
   * Затемнення заповнення вглиб скелі: [яскравість на відстані 1, 2, 3, …] від порожнечі.
   * Останнє значення діє для всіх глибших клітинок. Без поля — без затемнення.
   */
  depthShade?: readonly number[];
}

export interface DrawOp {
  frame: string;
  /** Лівий верхній кут, px. */
  x: number;
  y: number;
  /** Яскравість 0..1 (1 — без затемнення). */
  shade: number;
}

type Role = 'fill' | 'left' | 'right' | 'bottom' | 'top';

/** Порядок шарів малювання. */
const LAYERS: readonly Role[] = ['fill', 'left', 'right', 'bottom', 'top'];

/** Яку сусідню клітинку перевіряти для кожної ролі (dx, dy). fill — без сусіда. */
const NEIGHBOR: Record<Exclude<Role, 'fill'>, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  bottom: [0, 1],
  top: [0, -1],
};

/**
 * Відстань кожної клітинки до найближчої порожньої (у кроках по 8 напрямках).
 * Багатоджерельний BFS: стартуємо одночасно з усіх порожніх клітинок (відстань 0),
 * хвиля розходиться в скелю — кожна клітинка отримує відстань, коли хвиля вперше до неї дійде. O(w·h).
 * Порожніх клітинок нема взагалі — усім Infinity.
 */
export function distanceToEmpty(grid: Grid): Float32Array {
  const { width: w, height: h } = grid;
  const dist = new Float32Array(w * h).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!grid.solid[i]) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (dist[j] === Infinity) {
          dist[j] = dist[i]! + 1;
          queue.push(j);
        }
      }
    }
  }
  return dist;
}

export function autotile(grid: Grid, tileset: TilesetDef, seed: number): DrawOp[] {
  const ts = tileset.tileSize;
  const ops: DrawOp[] = [];
  const shades = tileset.depthShade;
  const dist = shades?.length ? distanceToEmpty(grid) : undefined;
  const shadeAt = (x: number, y: number): number => {
    if (!dist || !shades) return 1;
    const d = dist[y * grid.width + x]!;
    return shades[Math.min(Math.max(d, 1), shades.length) - 1]!;
  };

  LAYERS.forEach((role, roleIndex) => {
    const set = tileset[role];
    if (set.frames.length === 0) return;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!isSolid(grid, x, y)) continue;
        if (role !== 'fill') {
          const [dx, dy] = NEIGHBOR[role];
          if (isSolid(grid, x + dx, y + dy)) continue; // сторона закрита — край не потрібен
        }
        const r = hash32(seed, x, y, roleIndex) / 4294967296;
        ops.push({
          frame: weightedPick(set.frames, set.weights, r),
          x: x * ts + (set.offsetX ?? 0),
          y: y * ts + (set.offsetY ?? 0),
          shade: role === 'fill' ? shadeAt(x, y) : 1,
        });
      }
    }
  });

  return ops;
}
