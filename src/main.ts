import Phaser from 'phaser';
import '@fontsource/tiny5/400.css';
import { loadFonts } from './ui/text';
import { HudScene } from './scenes/HudScene';
import { GAME } from './config/game';
import { AssetGalleryScene } from './scenes/AssetGalleryScene';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TestCaveScene } from './scenes/TestCaveScene';

// Шрифт треба дочекатися до створення текстів, інакше перші написи намалюються запасним шрифтом.
await loadFonts();

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
  scene: [BootScene, PreloadScene, TestCaveScene, AssetGalleryScene, HudScene],
});

// Лише в dev-режимі: доступ до гри з консолі браузера / автотестів (window.__game.scene.getScene('TestCave')).
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
