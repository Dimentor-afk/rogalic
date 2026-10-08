/**
 * Тайлсети: які кадри атласу використовувати для кожного випадку автотайлінгу.
 * Кадри нарізає tools/pack.config.json з PixelFantasy Caves (mainlev_build.png):
 *  - сіра скеля з холодним обідком — основна земля, стіни, стеля;
 *  - коричневі шматки — лише декор (сталактити під стелею);
 *  - дошки — односторонні платформи, риштування — опори під довшими з них.
 */
import type { Piece, TilesetDef } from '../core/level/autotile';

const frames = (prefix: string, n: number, extra: Omit<Piece, 'frame'> = {}): Piece[] =>
  Array.from({ length: n }, (_, i) => ({ frame: `${prefix}${i}`, ...extra }));

/** Дзеркальні копії: з правої стіни — ліва, з правого кута — лівий. */
const mirror = (pieces: Piece[]): Piece[] => pieces.map((p) => ({ ...p, flipX: !p.flipX }));

/** Шматок і його дзеркальна копія як два варіанти (більше різноманіття для симетричних випадків). */
const both = (pieces: Piece[]): Piece[] => [...pieces, ...mirror(pieces)];

const right = frames('cave/r/', 7);
const topRight = frames('cave/tr/', 3);
const rightBottom = frames('cave/rb/', 2);

export const CAVE_TILESET: TilesetDef = {
  atlas: 'cave',
  tileSize: 16,
  solid: {
    // заповнення: гладкі тайли частіше, тайли з прожилками — рідше
    '': both([...frames('cave/fill/', 9, { weight: 3 }), ...frames('cave/fill_d/', 22)]),
    T: both([...frames('cave/t/', 2), { frame: 'cave/t_tall/0', dy: -16 }]),
    R: right,
    L: mirror(right),
    B: both(frames('cave/b/', 4)),
    TR: topRight,
    TL: mirror(topRight),
    RB: rightBottom,
    BL: mirror(rightBottom),
    // тонкі уступи (висотою в одну клітинку)
    TRB: [{ frame: 'cave/trb/0' }, { frame: 'cave/tbl/0', flipX: true }],
    TBL: [{ frame: 'cave/tbl/0' }, { frame: 'cave/trb/0', flipX: true }],
    TRBL: both(frames('cave/trbl/', 1)),
    // "TB", "RL", "TRL"… не задані — автотайлер візьме найближчий (див. buildMaskTable)
  },
  // глибше в скелю — темніше: рівень краще читається, печера виглядає об'ємною
  depthShade: [1, 0.7, 0.45, 0.28],
  decor: [{ side: 'bottom', chance: 0.08, minClear: 4, pieces: frames('cave/stalactite/', 4) }],
  plank: {
    left: frames('cave/plank_l/', 1),
    mid: frames('cave/plank_m/', 9),
    right: frames('cave/plank_r/', 1),
  },
  // риштування — лише під довгими дошками (місток, платформа), невисоке і завжди на скелі
  scaffold: {
    frames: Array.from({ length: 9 }, (_, i) => `cave/scaffold/${i}`),
    minRun: 5,
    doubleRun: 10,
    maxDepth: 5,
  },
};
