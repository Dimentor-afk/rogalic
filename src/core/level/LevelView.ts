/**
 * Phaser-частина рівня: малює результат автотайлінгу і створює невидимі шари колізій.
 *
 * Візуал і колізії розділені навмисно: шматки скелі вилазять за межі клітинок (обідки, сталактити),
 * а фізика працює по рівній сітці 16×16 — так рух гравця передбачуваний.
 * Два шари колізій: суцільна скеля і односторонні дошки (колізія тільки з верхньою гранню).
 */
import Phaser from 'phaser';
import { autotile, type TilesetDef } from './autotile';
import type { Grid } from './grid';

const COLLISION_TEXTURE = '__collision_tile';

export class LevelView {
  readonly solid: Phaser.Tilemaps.TilemapLayer;
  readonly oneWay: Phaser.Tilemaps.TilemapLayer;
  readonly widthPx: number;
  readonly heightPx: number;
  private blitter: Phaser.GameObjects.Blitter;

  constructor(scene: Phaser.Scene, grid: Grid, tileset: TilesetDef, seed: number) {
    const ts = tileset.tileSize;
    this.widthPx = grid.width * ts;
    this.heightPx = grid.height * ts;

    // --- візуал: Blitter — найдешевший спосіб намалювати тисячі статичних кадрів з одного атласу ---
    this.blitter = scene.add.blitter(0, 0, tileset.atlas);
    for (const op of autotile(grid, tileset, seed)) {
      const bob = this.blitter.create(op.x, op.y, op.frame);
      bob.setFlipX(op.flipX);
      if (op.shade < 1) {
        const c = Math.round(op.shade * 255);
        bob.setTint((c << 16) | (c << 8) | c); // сірий tint = затемнення
      }
    }

    // --- колізії ---
    if (!scene.textures.exists(COLLISION_TEXTURE)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xff00ff, 0.35).fillRect(0, 0, ts, ts);
      g.generateTexture(COLLISION_TEXTURE, ts, ts);
      g.destroy();
    }
    this.solid = LevelView.makeLayer(scene, grid.solid, grid, ts);
    this.oneWay = LevelView.makeLayer(scene, grid.oneWay, grid, ts);
    // дошка тримає тільки згори: збоку і знизу крізь неї проходимо
    this.oneWay.forEachTile((t) => {
      if (t.index >= 0) t.setCollision(false, false, true, false);
    });
  }

  /** Тайлмапа з маски клітинок: 0 = є тайл (колізія), -1 = порожньо. */
  private static makeLayer(scene: Phaser.Scene, cells: Uint8Array, grid: Grid, ts: number): Phaser.Tilemaps.TilemapLayer {
    const data: number[][] = [];
    for (let y = 0; y < grid.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < grid.width; x++) row.push(cells[y * grid.width + x] ? 0 : -1);
      data.push(row);
    }
    const map = scene.make.tilemap({ data, tileWidth: ts, tileHeight: ts });
    const tiles = map.addTilesetImage(COLLISION_TEXTURE, COLLISION_TEXTURE, ts, ts, 0, 0)!;
    const layer = map.createLayer(0, tiles, 0, 0)!;
    layer.setCollision(0);
    layer.setVisible(false);
    return layer;
  }

  /** Показати/сховати сітку колізій (дебаг). */
  setCollisionVisible(v: boolean): void {
    this.solid.setVisible(v);
    this.oneWay.setVisible(v);
  }

  setDepth(depth: number): this {
    this.blitter.setDepth(depth);
    this.solid.setDepth(depth + 1);
    this.oneWay.setDepth(depth + 1);
    return this;
  }
}
