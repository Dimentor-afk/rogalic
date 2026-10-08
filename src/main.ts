import Phaser from 'phaser';
import { ArmorPipeline } from './core/fx/ArmorPipeline';
import '@fontsource/tiny5/400.css';
import { loadFonts } from './ui/text';
import { HudScene } from './scenes/HudScene';
import { GAME } from './config/game';
import { AssetGalleryScene } from './scenes/AssetGalleryScene';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TestCaveScene } from './scenes/TestCaveScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { HubScene } from './scenes/HubScene';
import { DungeonScene } from './scenes/DungeonScene';
import { MenuScene } from './scenes/MenuScene';
import { EndingScene } from './scenes/EndingScene';
import { SlotScene } from './scenes/SlotScene';
import { BossArenaScene } from './scenes/BossArenaScene';
import { FreeSpinsScene } from './scenes/FreeSpinsScene';
import { installAudioUnlock } from './core/audio/Sfx';
import { gameState } from './core/state/store';

// Браузер дозволяє звук лише після першої дії гравця — «розблоковуємо» WebAudio на перше натискання.
installAudioUnlock();

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
  // шейдер «видимої броні» лицаря (лише WebGL)
  // (PostFX-конструктор приймає game, а не config — тому приведення типу)
  pipeline: { [ArmorPipeline.KEY]: ArmorPipeline } as unknown as Phaser.Types.Core.PipelineConfig,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: GAME.gravity }, debug: false },
  },
  input: { gamepad: true },
  scene: [
    BootScene,
    PreloadScene,
    MainMenuScene,
    HubScene,
    DungeonScene,
    SlotScene,
    BossArenaScene,
    FreeSpinsScene,
    TestCaveScene,
    EndingScene,
    AssetGalleryScene,
    HudScene,
    MenuScene,
  ],
});

// Лише в dev-режимі: доступ до гри і стану з консолі браузера / автотестів
// (window.__game.scene.getScene('TestCave'), window.__state().balance = 5000).
if (import.meta.env.DEV) Object.assign(window, { __game: game, __state: gameState });
