/**
 * Boot: вантажить лише індекс асетів (його генерує `npm run pack`),
 * щоб Preload знав, які атласи і зображення існують — без хардкоду в коді.
 */
import Phaser from 'phaser';
import { SCENES } from './keys';

export interface AssetIndex {
  atlases: string[];
  images: string[];
}

export const ASSET_INDEX_KEY = 'asset-index';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  preload(): void {
    this.load.json(ASSET_INDEX_KEY, 'assets/index.json');
  }

  create(): void {
    this.scene.start(SCENES.preload);
  }
}
