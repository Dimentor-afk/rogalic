/**
 * Список пунктів меню: вибір ↑/↓ (W/S, D-pad), підтвердження E/Space/Enter/J, мишею — клік.
 * Використовується модальною панеллю (MenuScene) і головним меню.
 */
import Phaser from 'phaser';
import { COLORS, txt } from './text';
import { sfx } from '../core/audio/Sfx';

export interface MenuItem {
  label: string;
  /** Текст праворуч (ціна, рівень…). */
  right?: string;
  /** Пояснення внизу панелі, коли пункт вибрано. */
  description?: string;
  enabled?: boolean;
  /** Повертає 'close', щоб закрити меню після дії. */
  action: () => void | 'close';
}

export class MenuList {
  private rows: { label: Phaser.GameObjects.Text; right: Phaser.GameObjects.Text; hit: Phaser.GameObjects.Zone }[] = [];
  private cursor!: Phaser.GameObjects.Text;
  private items: MenuItem[] = [];
  index = 0;
  private keys: Phaser.Input.Keyboard.Key[] = [];
  private padPrev = { up: false, down: false, ok: false, back: false };

  constructor(
    private scene: Phaser.Scene,
    private x: number,
    private y: number,
    private width: number,
    private getItems: () => MenuItem[],
    private onBack?: () => void,
    private lineH = 12,
    private onSelect?: (item: MenuItem | undefined) => void,
  ) {
    this.cursor = txt(scene, x, y, '>', 8, COLORS.gold);
    this.refresh();
    const kb = scene.input.keyboard!;
    const on = (name: string, fn: () => void) => {
      const k = kb.addKey(name, true);
      k.on('down', fn);
      this.keys.push(k);
    };
    for (const k of ['UP', 'W']) on(k, () => this.move(-1));
    for (const k of ['DOWN', 'S']) on(k, () => this.move(1));
    for (const k of ['E', 'SPACE', 'ENTER', 'J', 'Z']) on(k, () => this.confirm());
    for (const k of ['ESC', 'SHIFT', 'BACKSPACE']) on(k, () => this.onBack?.());
  }

  /** Перебудувати рядки (після покупки ціни/стан змінюються). */
  refresh(): void {
    for (const r of this.rows) {
      r.label.destroy();
      r.right.destroy();
      r.hit.destroy();
    }
    this.items = this.getItems();
    this.index = Math.min(this.index, this.items.length - 1);
    this.rows = this.items.map((it, i) => {
      const y = this.y + i * this.lineH;
      const enabled = it.enabled !== false;
      const label = txt(this.scene, this.x + 10, y, it.label, 8, enabled ? COLORS.text : COLORS.dim);
      const right = txt(this.scene, this.x + this.width, y, it.right ?? '', 8, enabled ? COLORS.gold : COLORS.dim).setOrigin(1, 0);
      const hit = this.scene.add.zone(this.x, y - 1, this.width, this.lineH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => this.select(i));
      hit.on('pointerdown', () => {
        this.select(i);
        this.confirm();
      });
      return { label, right, hit };
    });
    this.select(this.index);
  }

  private select(i: number): void {
    if (!this.items.length) return;
    this.index = (i + this.items.length) % this.items.length;
    this.cursor.setPosition(this.x, this.y + this.index * this.lineH);
    this.rows.forEach((r, j) => r.label.setColor(j === this.index ? COLORS.white : this.items[j]!.enabled === false ? COLORS.dim : COLORS.text));
    this.onSelect?.(this.items[this.index]);
  }

  private move(d: number): void {
    this.select(this.index + d);
    sfx.play('tick');
  }

  private confirm(): void {
    const it = this.items[this.index];
    if (!it || it.enabled === false) {
      this.scene.cameras.main.shake(80, 0.004);
      return;
    }
    sfx.play('click');
    if (it.action() === 'close') this.onBack?.();
    else this.refresh();
  }

  get selected(): MenuItem | undefined {
    return this.items[this.index];
  }

  /** Геймпад: опитування в update сцени. */
  pollGamepad(): void {
    const pad = this.scene.input.gamepad?.getPad(0);
    if (!pad) return;
    const now = {
      up: pad.up || pad.leftStick.y < -0.5,
      down: pad.down || pad.leftStick.y > 0.5,
      ok: pad.A,
      back: pad.B,
    };
    if (now.up && !this.padPrev.up) this.move(-1);
    if (now.down && !this.padPrev.down) this.move(1);
    if (now.ok && !this.padPrev.ok) this.confirm();
    if (now.back && !this.padPrev.back) this.onBack?.();
    this.padPrev = now;
  }

  destroy(): void {
    for (const k of this.keys) k.removeAllListeners();
    for (const r of this.rows) {
      r.label.destroy();
      r.right.destroy();
      r.hit.destroy();
    }
    this.cursor.destroy();
  }
}
