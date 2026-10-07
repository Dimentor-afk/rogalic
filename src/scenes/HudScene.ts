/**
 * HUD поверх ігрової сцени (окрема сцена: тряска камери і зум рівня його не чіпають).
 * Ігрова сцена щокадру викликає sync(...) з поточним станом.
 */
import Phaser from 'phaser';
import { COLORS, icon, txt } from '../ui/text';
import { SCENES } from './keys';

export interface MinimapRoom {
  mx: number;
  my: number;
  type: string;
  visited: boolean;
  current: boolean;
  exits: string[];
}

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
  /** Мінікарта поверху. */
  map?: { rooms: MinimapRoom[] };
  /** Хаб: замість бойового HUD — баланс, борг, колекція босів, шкала гаранту. */
  hub?: HubInfo;
}

export interface HubInfo {
  balance: number;
  debt: number;
  /** Шкала гаранту 0..100. */
  guarantee: number;
  bosses: { name: string; defeated: boolean; final: boolean }[];
  curse?: string | null;
}

const MAP_COLORS: Record<string, number> = { start: 0x6fbf6a, combat: 0x8a8f9c, treasure: 0xffd25a, exit: 0x6fb6ff };

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
  private mapG!: Phaser.GameObjects.Graphics;
  private mapKey = '';
  private combatUi: Phaser.GameObjects.GameObject[] = [];
  private hubUi!: Phaser.GameObjects.Container;
  private hubText!: Phaser.GameObjects.Text;
  private hubCurse!: Phaser.GameObjects.Text;
  private hubG!: Phaser.GameObjects.Graphics;
  private bossIcons: Phaser.GameObjects.Text[] = [];

  constructor() {
    super(SCENES.hud);
  }

  create(): void {
    this.hearts = [];
    this.bossIcons = [];
    this.heartsMax = -1;
    this.stamina = this.add.graphics();
    this.mapG = this.add.graphics();
    this.mapKey = '';
    const flaskIcon = icon(this, 6, 34, 'props', 'item/hp/0');
    this.flaskText = txt(this, 22, 41, 'x3', 8, COLORS.text);
    const nerves = txt(this, 6, 23, 'НЕРВИ', 8, COLORS.dim);
    this.combatUi = [this.stamina, flaskIcon, this.flaskText, nerves];

    // хабовий HUD
    this.hubG = this.add.graphics();
    this.hubText = txt(this, 6, 6, '', 8, COLORS.text, { lineSpacing: 2 });
    this.hubCurse = txt(this, 6, 52, '', 8, COLORS.red);
    this.bossIcons = [];
    this.hubUi = this.add.container(0, 0, [this.hubG, this.hubText, this.hubCurse]).setVisible(false);
    this.chipsText = txt(this, this.scale.width - 6, 6, '', 8, COLORS.gold).setOrigin(1, 0);
    this.depthText = txt(this, this.scale.width - 6, 16, '', 8, COLORS.dim).setOrigin(1, 0);
    this.hintText = txt(this, this.scale.width / 2, this.scale.height - 14, '', 8, COLORS.text).setOrigin(0.5, 0);
    this.bannerText = txt(this, this.scale.width / 2, this.scale.height * 0.36, '', 16, COLORS.gold, { stroke: '#000000', strokeThickness: 3, align: 'center' })
      .setOrigin(0.5)
      .setAlpha(0);
  }

  sync(s: HudState): void {
    if (!this.stamina) return;
    const hubMode = !!s.hub;
    this.hubUi.setVisible(hubMode);
    for (const o of this.combatUi) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!hubMode);
    for (const h of this.hearts) {
      h.empty.setVisible(!hubMode);
      if (hubMode) h.full.setVisible(false);
    }
    if (s.hub) {
      this.syncHub(s.hub);
      this.hintText.setText(s.hint ?? '');
      return;
    }
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
    this.drawMap(s.map?.rooms);
  }

  /** Мінікарта: відвідані кімнати — заповнені, сусідні з ними — контуром, поточна — біла рамка. */
  private drawMap(rooms: MinimapRoom[] | undefined): void {
    const key = rooms ? rooms.map((r) => `${r.visited ? 1 : 0}${r.current ? 1 : 0}`).join('') : '';
    if (key === this.mapKey) return;
    this.mapKey = key;
    const g = this.mapG;
    g.clear();
    if (!rooms) return;
    const cw = 8;
    const ch = 5;
    const maxX = Math.max(...rooms.map((r) => r.mx));
    const ox = this.scale.width - 6 - (maxX + 1) * (cw + 1);
    const oy = 30;
    const at = (mx: number, my: number) => rooms.find((r) => r.mx === mx && r.my === my);
    const known = (r: MinimapRoom) =>
      r.visited ||
      r.exits.some((d) => {
        const n = at(r.mx + (d === 'R' ? 1 : d === 'L' ? -1 : 0), r.my + (d === 'D' ? 1 : d === 'U' ? -1 : 0));
        return n?.visited;
      });
    for (const r of rooms) {
      if (!known(r)) continue;
      const x = ox + r.mx * (cw + 1);
      const y = oy + r.my * (ch + 1);
      const color = MAP_COLORS[r.type] ?? 0x888888;
      if (r.visited) g.fillStyle(color, 0.9).fillRect(x, y, cw, ch);
      else g.lineStyle(1, color, 0.6).strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      if (r.current) g.lineStyle(1, 0xffffff, 1).strokeRect(x - 0.5, y - 0.5, cw + 1, ch + 1);
    }
  }

  private syncHub(h: HubInfo): void {
    this.hubText.setText([`БАЛАНС: ${h.balance} фішок`, `БОРГ:   ${h.debt}`].join('\n'));
    this.hubText.setColor(h.debt > 0 ? COLORS.text : COLORS.green);
    this.hubCurse.setText(h.curse ? `Прокляття на спуск: ${h.curse}` : '');
    // шкала гаранту
    const g = this.hubG;
    g.clear();
    const w = 90;
    g.fillStyle(0x000000, 0.6).fillRect(6, 30, w + 2, 6);
    g.fillStyle(h.guarantee >= 100 ? 0xffd25a : 0xc0a050, 1).fillRect(7, 31, Math.round((Math.min(100, h.guarantee) / 100) * w), 4);
    if (!this.bossIcons.length) {
      const label = txt(this, 6, 39, 'ГАРАНТ', 8, COLORS.dim);
      this.hubUi.add(label);
      txt(this, this.scale.width - 6, 6, 'КОЛЕКЦІЯ БОСІВ', 8, COLORS.dim).setOrigin(1, 0).setName('bossTitle');
      h.bosses.forEach((_, i) => {
        const t = txt(this, this.scale.width - 6, 17 + i * 9, '', 8, COLORS.dim).setOrigin(1, 0);
        this.bossIcons.push(t);
        this.hubUi.add(t);
      });
      this.hubUi.add(this.children.getByName('bossTitle')!);
    }
    h.bosses.forEach((b, i) => {
      const t = this.bossIcons[i];
      if (!t) return;
      t.setText(b.defeated ? `* ${b.name}` : b.final ? '??? (фінал)' : '???');
      t.setColor(b.defeated ? COLORS.gold : COLORS.dim);
    });
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
