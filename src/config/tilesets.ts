/**
 * Тайлсети: які кадри атласу використовувати для кожної «ролі» автотайлінгу.
 * Кадри нарізає tools/pack.config.json з PixelFantasy Caves (mainlev_build.png).
 */
import type { TilesetDef } from '../core/level/autotile';

const range = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

export const CAVE_TILESET: TilesetDef = {
  atlas: 'cave',
  tileSize: 16,
  fill: { frames: range('cave/fill/', 16) },
  // Шматки 16×32: верхня половина — наріст, що стирчить у порожню клітинку над підлогою.
  top: { frames: range('cave/top/', 12), offsetY: -16 },
  // 16×32: нижня половина — сталактити, що звисають у порожню клітинку під стелею.
  bottom: { frames: range('cave/bottom/', 12), offsetY: 0 },
  // 32×16: ті самі верхні шматки, повернуті на 90° (див. rotate у конфігу пакування).
  left: { frames: range('cave/wall_l/', 12), offsetX: -16 },
  right: { frames: range('cave/wall_r/', 12), offsetX: 0 },
  // глибше в скелю — темніше: рівень краще читається, а печера виглядає об'ємною
  depthShade: [1, 0.75, 0.5, 0.32, 0.2],
};
