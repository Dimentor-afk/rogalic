/**
 * Кнопка екрана слота на піксельних заглушках: фон 'slotui/button' або «увімкнений» 'slotui/button_on',
 * необов'язкова іконка зліва, підпис і (за потреби) знак ∞ окремою картинкою — у шрифті Tiny5 його немає.
 * Іконка, підпис і ∞ центруються як один рядок.
 */
import Phaser from 'phaser';
import { COLORS, txt } from '../text';

export class SlotButton {
  private bg: Phaser.GameObjects.Image;
  private icon?: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private inf: Phaser.GameObjects.Image;
  private infinite = false;
  private lit = false;

  constructor(
    scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    w: number,
    h: number,
    text: string,
    onClick: () => void,
    iconKey?: string,
  ) {
    this.bg = scene.add.image(x, y, 'slotui/button').setDisplaySize(w, h).setInteractive({ useHandCursor: true });
    // stopPropagation — щоб клік по кнопці не дійшов до «клік будь-де» сцени (у фріспінах це «швидше»)
    this.bg.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      onClick();
    });
    if (iconKey) this.icon = scene.add.image(0, y, iconKey).setOrigin(0, 0.5);
    this.label = txt(scene, 0, y, text, 8, COLORS.text).setOrigin(0, 0.5);
    this.inf = scene.add.image(0, y, 'slotui/inf').setOrigin(0, 0.5).setVisible(false);
    this.layout();
  }

  /** Підпис; infinite — дописати знак ∞ після тексту. */
  setLabel(text: string, infinite = false): this {
    this.label.setText(text);
    this.infinite = infinite;
    this.layout();
    return this;
  }

  /** «Увімкнена» кнопка: інший фон і білий підпис. */
  setLit(on: boolean): this {
    this.lit = on;
    const w = this.bg.displayWidth;
    const h = this.bg.displayHeight;
    this.bg.setTexture(on ? 'slotui/button_on' : 'slotui/button').setDisplaySize(w, h);
    this.layout();
    return this;
  }

  setDepth(d: number): this {
    for (const o of this.parts()) o.setDepth(d);
    return this;
  }

  setVisible(v: boolean): this {
    for (const o of this.parts()) o.setVisible(v);
    if (v) this.inf.setVisible(this.infinite);
    return this;
  }

  private parts(): (Phaser.GameObjects.Image | Phaser.GameObjects.Text)[] {
    return [this.bg, this.label, this.inf, ...(this.icon ? [this.icon] : [])];
  }

  /** Розкладка рядка: [іконка] 3px [підпис] 2px [∞], весь рядок — по центру кнопки. */
  private layout(): void {
    const color = this.lit ? COLORS.white : COLORS.text;
    this.label.setColor(color);
    this.inf.setTint(Phaser.Display.Color.HexStringToColor(color).color);
    const iconW = this.icon ? this.icon.width + 3 : 0;
    const textW = this.label.text ? this.label.width : 0;
    const infW = this.infinite ? (textW ? 2 : 0) + this.inf.width : 0;
    let x = Math.round(this.x - (iconW + textW + infW) / 2);
    this.icon?.setX(x);
    x += iconW;
    this.label.setX(x);
    x += textW + (textW ? 2 : 0);
    this.inf.setX(x).setVisible(this.infinite && this.bg.visible);
  }
}
