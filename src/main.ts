import Phaser from 'phaser';
import { GAME } from './config/game';
import { AssetGalleryScene } from './scenes/AssetGalleryScene';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TestCaveScene } from './scenes/TestCaveScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME.width,
  height: GAME.height,
  backgroundColor: GAME.backgroundColor,
  // pixelArt: NEAREST-фільтрація текстур, без згладжування; roundPixels — без «дрижання» на півпікселях
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: GAME.gravity }, debug: false },
  },
  input: { gamepad: true },
  scene: [BootScene, PreloadScene, TestCaveScene, AssetGalleryScene],
});

// Лише в dev-режимі: доступ до гри з консолі браузера / автотестів (window.__game.scene.getScene('TestCave')).
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
