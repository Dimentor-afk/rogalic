/**
 * Фінальний екран: вийшов з казино. Статистика і останній іронічний рядок.
 */
import Phaser from 'phaser';
import { gameState } from '../core/state/store';
import { statsLines } from '../ui/stats';
import { COLORS, txt } from '../ui/text';
import { SCENES } from './keys';

export class EndingScene extends Phaser.Scene {
  constructor() {
    super(SCENES.ending);
  }

  create(): void {
    const { width, height } = this.scale;
    const s = gameState();
    this.cameras.main.setBackgroundColor('#0b0a0d');
    txt(this, width / 2, 18, 'ТИ ВИЙШОВ З КАЗИНО', 16, COLORS.gold).setOrigin(0.5, 0);
    txt(this, width / 2, 40, 'Борг погашено. Усі боси переможені. Автомат за спиною тихо блимає.', 8, COLORS.text).setOrigin(0.5, 0);
    statsLines(s).forEach((l, i) => {
      txt(this, width / 2 - 120, 62 + i * 12, l.label, 8, COLORS.dim);
      txt(this, width / 2 + 120, 62 + i * 12, l.value, 8, COLORS.text).setOrigin(1, 0);
    });
    const last = txt(this, width / 2, height - 34, '…але ж наступна точно зайшла б.', 8, '#ff5a8a').setOrigin(0.5, 0);
    this.tweens.add({ targets: last, alpha: { from: 0.4, to: 1 }, yoyo: true, repeat: -1, duration: 1200 });
    txt(this, width / 2, height - 18, 'E — у головне меню (можна крутити далі)', 8, COLORS.dim).setOrigin(0.5, 0);
    this.input.keyboard!.once('keydown-E', () => this.scene.start(SCENES.menu));
    this.input.once('pointerdown', () => this.scene.start(SCENES.menu));
    this.cameras.main.fadeIn(1200, 0, 0, 0);
  }
}
