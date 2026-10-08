/**
 * Головне меню: продовжити / нова гра / тренування / статистика / галерея асетів.
 */
import Phaser from 'phaser';
import { ECONOMY } from '../config/economy';
import { CAVE_PARALLAX } from '../config/game';
import { gameState, persist, resetGame } from '../core/state/store';
import { MenuList, type MenuItem } from '../ui/MenuList';
import { playerRtp } from '../ui/stats';
import { COLORS, txt } from '../ui/text';
import { openMenu } from './MenuScene';
import { statsLines } from '../ui/stats';
import { SCENES } from './keys';

export class MainMenuScene extends Phaser.Scene {
  private list?: MenuList;
  private bg: Phaser.GameObjects.TileSprite[] = [];
  private t = 0;

  constructor() {
    super(SCENES.menu);
  }

  create(): void {
    const { width, height } = this.scale;
    this.bg = CAVE_PARALLAX.filter((l) => this.textures.exists(l.key)).map((l) =>
      this.add.tileSprite(0, 0, width, height, l.key).setOrigin(0, 0).setTilePosition(0, 120),
    );
    this.add.rectangle(0, 0, width, height, 0x000000, 0.45).setOrigin(0, 0);

    const title = txt(this, width / 2, 34, 'ДОДЕП', 32, '#ff5a8a', { stroke: '#2a0010', strokeThickness: 4 }).setOrigin(0.5, 0);
    this.tweens.add({ targets: title, alpha: { from: 1, to: 0.7 }, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
    txt(this, width / 2, 74, 'soulslike-рогалик про борг перед підземним казино', 8, COLORS.dim).setOrigin(0.5, 0);

    const s = gameState();
    // будь-який прогрес: спуски, спіни, сплачений борг, змінений баланс
    const started = s.stats.runs > 0 || s.stats.spins > 0 || s.stats.paidDebt > 0 || s.balance !== ECONOMY.startBalance;
    txt(this, width / 2, height - 40, started ? `Борг: ${s.debt}   Баланс: ${s.balance}   Твій RTP: ${playerRtp(s)}` : 'Борг сам себе не поверне.', 8, COLORS.text).setOrigin(0.5, 0);
    txt(this, width / 2, height - 14, 'A/D рух  Space стрибок  J атака  L перекат  K блок  Q фляга  E взаємодія', 8, COLORS.dim).setOrigin(0.5, 0);

    const items = (): MenuItem[] => [
      { label: started ? 'Продовжити' : 'Почати', action: () => this.go(SCENES.hub) },
      { label: 'Нова гра', enabled: started, action: () => this.confirmNew() },
      { label: 'Тренування (полігон)', action: () => this.go(SCENES.testCave) },
      { label: 'Статистика', action: () => this.stats() },
      { label: 'Галерея асетів', action: () => this.go(SCENES.gallery) },
    ];
    this.list = new MenuList(this, width / 2 - 70, 104, 140, items, undefined, 14);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.list?.destroy());
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.list?.refresh());
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  update(_t: number, delta: number): void {
    this.t += delta;
    this.bg.forEach((b, i) => (b.tilePositionX = (this.t / 1000) * (4 + i * 6)));
    this.list?.pollGamepad();
  }

  private go(scene: string): void {
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, { kind: 'start' }));
  }

  private confirmNew(): void {
    openMenu(this, {
      title: 'НОВА ГРА?',
      subtitle: () => 'Борг, прокачка і колекція босів обнуляться',
      items: () => [
        { label: 'Так, почати з нуля', action: () => (resetGame(), persist(), this.time.delayedCall(0, () => this.scene.restart()), 'close' as const) },
        { label: 'Ні', action: () => 'close' as const },
      ],
    });
  }

  private stats(): void {
    openMenu(this, {
      title: 'СТАТИСТИКА',
      width: 320,
      items: () => [...statsLines(gameState()).map((l) => ({ label: l.label, right: l.value, action: () => {} })), { label: 'Назад', action: () => 'close' as const }],
    });
  }
}
