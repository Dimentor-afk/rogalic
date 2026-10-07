/**
 * Preload: завантажує всі атласи і зображення з індексу, показує прогрес,
 * реєструє анімації з маніфесту.
 */
import Phaser from 'phaser';
import { registerAnimations } from '../core/assets/animations';
import { ASSET_INDEX_KEY, type AssetIndex } from './BootScene';
import { SCENES } from './keys';

/** Ключ у registry: список проблем з асетами (відсутні кадри/атласи) для дебаг-оверлея. */
export const ASSET_PROBLEMS_KEY = 'asset-problems';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENES.preload);
  }

  preload(): void {
    const { width, height } = this.scale;
    const barW = Math.round(width * 0.5);
    const frame = this.add.rectangle(width / 2, height / 2, barW + 4, 10).setStrokeStyle(1, 0x8a6a5a);
    const bar = this.add.rectangle(frame.x - barW / 2, height / 2, 1, 6, 0xd4a35a).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => bar.setSize(Math.max(1, barW * p), 6));

    const index = this.cache.json.get(ASSET_INDEX_KEY) as AssetIndex | undefined;
    if (!index) throw new Error('Немає public/assets/index.json — запусти `npm run pack`');
    for (const name of index.atlases) {
      this.load.atlas(name, `assets/atlases/${name}.png`, `assets/atlases/${name}.json`);
    }
    for (const path of index.images) {
      // ключ — шлях без розширення: "backgrounds/cave_1"
      this.load.image(path.replace(/\.png$/, ''), `assets/${path}`);
    }
  }

  create(): void {
    this.registry.set(ASSET_PROBLEMS_KEY, registerAnimations(this));
    this.scene.start(SCENES.testCave);
  }
}
