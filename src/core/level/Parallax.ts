/**
 * Паралакс-фон: кілька шарів TileSprite, прив'язаних до екрана (scrollFactor 0).
 * Кожен шар зсуває текстуру на cameraX · factor — дальні шари рухаються повільніше.
 */
import Phaser from 'phaser';

export class Parallax {
  private layers: { sprite: Phaser.GameObjects.TileSprite; factor: number }[] = [];

  constructor(
    private scene: Phaser.Scene,
    defs: readonly { key: string; factor: number }[],
    /** Висота рівня в px — щоб вертикально показувати відповідну частину фону. */
    private levelHeight: number,
  ) {
    const { width, height } = scene.scale;
    defs.forEach((d, i) => {
      if (!scene.textures.exists(d.key)) return;
      const s = scene.add.tileSprite(0, 0, width, height, d.key).setOrigin(0, 0).setScrollFactor(0).setDepth(-100 + i);
      this.layers.push({ sprite: s, factor: d.factor });
    });
  }

  update(): void {
    const cam = this.scene.cameras.main;
    const viewH = this.scene.scale.height;
    // t = 0 коли камера вгорі рівня, 1 — внизу
    const t = this.levelHeight > viewH ? Phaser.Math.Clamp(cam.scrollY / (this.levelHeight - viewH), 0, 1) : 0.5;
    for (const l of this.layers) {
      const texH = l.sprite.texture.getSourceImage().height;
      l.sprite.tilePositionX = Math.round(cam.scrollX * l.factor);
      l.sprite.tilePositionY = Math.round(Math.max(0, texH - viewH) * t);
    }
  }
}
