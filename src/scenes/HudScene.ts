/**
 * HUD поверх ігрової сцени (окрема сцена: тряска камери і зум рівня його не чіпають).
 * Ігрова сцена щокадру викликає sync(...) з поточним станом.
 */
import Phaser from 'phaser';
import { COLORS, icon, txt } from '../ui/text';
import { SCENES } from './keys';

export interface HudState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  flasks: number;
  /** Фішки забігу (undefined — не показувати). */
  chips?: number;
  depth?: number;
  /** Рядок підказки внизу екрана (напр. «E — ліфт нагору»). */
  hint?: string;
}

interface Heart {
  empty: Phaser.GameObjects.Image;
  full: Phaser.GameObjects.Image;
}

export class HudScene extends Phaser.Scene {
  private hearts: Heart[] = [];
  private heartsMax = -1;
  private stamina!: Phaser.GameObjects.Graphics;
  private flaskText!: Phaser.GameObjects.Text;
  private chipsText!: Phaser.GameObjects.Text;
  private depthText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private shownChips = 0;

  constructor() {
    super(SCENES.hud);
  }

  create(): void {
    this.hearts = [];
    this.heartsMax = -1;
    this.stamina = this.add.graphics();
    icon(this, 6, 34, 'props', 'item/hp/0');
    this.flaskText = txt(this, 22, 41, 'x3', 8, COLORS.text);
    txt(this, 6, 23, 'НЕРВИ', 8, COLORS.dim);
    this.chipsText = txt(this, this.scale.width - 6, 6, '', 8, COLORS.gold).setOrigin(1, 0);
    this.depthText = txt(this, this.scale.width - 6, 16, '', 8, COLORS.dim).setOrigin(1, 0);
    this.hintText = txt(this, this.scale.width / 2, this.scale.height - 14, '', 8, COLORS.text).setOrigin(0.5, 0);
    this.bannerText = txt(this, this.scale.width / 2, this.scale.height * 0.36, '', 16, COLORS.gold, { stroke: '#000000', strokeThickness: 3, align: 'center' })
      .setOrigin(0.5)
      .setAlpha(0);
  }

  sync(s: HudState): void {
    if (!this.stamina) return;
    this.syncHearts(s.hp, s.maxHp);
    // стаміна «Нерви»: смужка, жовтіє/червоніє, коли закінчується
    const w = Math.round(s.maxStamina * 0.6);
    const fill = Math.max(0, Math.round((s.stamina / s.maxStamina) * w));
    const ratio = s.stamina / s.maxStamina;
    const color = ratio > 0.5 ? 0x8de08a : ratio > 0.2 ? 0xe0c25a : 0xe0645a;
    this.stamina.clear();
    this.stamina.fillStyle(0x000000, 0.6).fillRect(36, 25, w + 2, 6);
    this.stamina.fillStyle(color, 1).fillRect(37, 26, fill, 4);
    this.flaskText.setText(`x${s.flasks}`).setColor(s.flasks > 0 ? COLORS.text : COLORS.red);

    if (s.chips !== undefined) {
      // лічильник «доганяє» реальне значення — приємно дивитися, як ростуть фішки
      this.shownChips += (s.chips - this.shownChips) * 0.2;
      if (Math.abs(s.chips - this.shownChips) < 0.5) this.shownChips = s.chips;
      this.chipsText.setText(`ФІШКИ ЗАБІГУ: ${Math.round(this.shownChips)}`);
    } else this.chipsText.setText('');
    this.depthText.setText(s.depth !== undefined ? `ГЛИБИНА ${s.depth}` : '');
    this.hintText.setText(s.hint ?? '');
  }

  /** Великий напис посеред екрана («Майже!», «ПОВЕРХ 2»…). */
  banner(text: string, color: string = COLORS.gold, ms = 1800): void {
    this.tweens.killTweensOf(this.bannerText);
    this.bannerText.setText(text).setColor(color).setAlpha(0).setScale(0.8);
    this.tweens.add({ targets: this.bannerText, alpha: 1, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.bannerText, alpha: 0, delay: ms, duration: 400 });
  }

  private syncHearts(hp: number, maxHp: number): void {
    if (maxHp !== this.heartsMax) {
      for (const h of this.hearts) {
        h.empty.destroy();
        h.full.destroy();
      }
      this.hearts = [];
      const n = Math.ceil(maxHp / 2);
      for (let i = 0; i < n; i++) {
        const x = 6 + i * 16;
        this.hearts.push({
          empty: icon(this, x, 6, 'props', 'hud/heart_empty/0'),
          full: icon(this, x, 6, 'props', 'hud/heart_full/0'),
        });
      }
      this.heartsMax = maxHp;
    }
    // кожне серце = 2 HP: повне, половинка (обрізаємо повне серце навпіл) або порожнє
    this.hearts.forEach((h, i) => {
      const v = Math.max(0, Math.min(2, hp - i * 2));
      h.full.setVisible(v > 0);
      const fw = h.full.frame.width;
      h.full.setCrop(0, 0, v === 1 ? Math.ceil(fw / 2) : fw, h.full.frame.height);
    });
  }
}
