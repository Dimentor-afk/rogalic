/**
 * Модальна панель-меню поверх сцени (каса, коваль, статистика, пауза).
 * Сцена, що її відкрила, ставиться на паузу і відновлюється після закриття.
 */
import Phaser from 'phaser';
import { MenuList, type MenuItem } from '../ui/MenuList';
import { COLORS, txt } from '../ui/text';
import { SCENES } from './keys';

export interface MenuConfig {
  title: string;
  /** Рядок під заголовком (баланс, борг…) — функція, бо змінюється після дій. */
  subtitle?: () => string;
  items: () => MenuItem[];
  /** Хто відкрив (буде відновлено). */
  parent: string;
  onClose?: () => void;
  width?: number;
}

export class MenuScene extends Phaser.Scene {
  private list?: MenuList;
  private cfg!: MenuConfig;
  private subtitle!: Phaser.GameObjects.Text;
  private desc!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.menuPanel);
  }

  create(cfg: MenuConfig): void {
    this.cfg = cfg;
    const { width, height } = this.scale;
    const w = cfg.width ?? 300;
    const items = cfg.items();
    const h = Math.min(height - 20, 58 + items.length * 12 + 26);
    const x = Math.round((width - w) / 2);
    const y = Math.round((height - h) / 2);

    this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0, 0).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(0x15100e, 0.97).fillRect(x, y, w, h);
    g.lineStyle(2, 0x8a6a3a, 1).strokeRect(x + 1, y + 1, w - 2, h - 2);
    g.lineStyle(1, 0xd4a35a, 0.6).strokeRect(x + 4, y + 4, w - 8, h - 8);

    txt(this, width / 2, y + 10, cfg.title, 16, COLORS.gold).setOrigin(0.5, 0);
    this.subtitle = txt(this, width / 2, y + 30, '', 8, COLORS.dim).setOrigin(0.5, 0);
    this.desc = txt(this, x + 12, y + h - 20, '', 8, COLORS.dim, { wordWrap: { width: w - 24 } });

    this.list = new MenuList(
      this,
      x + 12,
      y + 46,
      w - 24,
      () => cfg.items(),
      () => this.close(),
      12,
      (it) => this.desc?.setText(it?.description ?? ''),
    );
    this.updateSubtitle();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.list?.destroy());
  }

  update(): void {
    this.list?.pollGamepad();
    this.updateSubtitle();
  }

  private updateSubtitle(): void {
    this.subtitle?.setText(this.cfg.subtitle?.() ?? '');
  }

  close(): void {
    const { parent, onClose } = this.cfg;
    this.scene.stop();
    this.scene.resume(parent);
    onClose?.();
  }
}

/** Відкрити меню поверх сцени scene (вона стає на паузу). */
export function openMenu(scene: Phaser.Scene, cfg: Omit<MenuConfig, 'parent'>): void {
  scene.scene.pause();
  scene.scene.launch(SCENES.menuPanel, { ...cfg, parent: scene.scene.key } satisfies MenuConfig);
}
