/**
 * ХАБ — печерне казино «всередині скелі»: автомати, каса, коваль, ліфт у підземелля,
 * галерея трофеїв босів і двері «Вихід» (відчиняються, коли всі боси переможені і борг = 0).
 * У хабі не б'ються: HUD показує баланс, борг, колекцію босів і шкалу гаранту. Фляги тут поповнюються.
 */
import { CAVE_TILESET } from '../config/tilesets';
import { BOSSES, BOSS_ORDER } from '../config/bosses';
import { CURSES } from '../config/curses';
import { UPGRADES, WEAPON_PRICES, type UpgradeId } from '../config/economy';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { TEXTS, pick } from '../config/texts';
import { parseRoom, type Legend } from '../core/level/grid';
import { buyUpgrade, buyWeapon, canExit, equipWeapon, loadoutOf, payDebt, startRun, upgradePrice } from '../core/state/GameState';
import { gameState, persist } from '../core/state/store';
import { Trigger } from '../entities/props';
import hub from '../levels/hub.json';
import type { MenuItem } from '../ui/MenuList';
import { statsLines } from '../ui/stats';
import { COLORS, txt } from '../ui/text';
import type { DungeonRun, HubArrival } from './DungeonScene';
import { GameplayScene } from './GameplayScene';
import type { HudState } from './HudScene';
import { openMenu } from './MenuScene';
import { SCENES } from './keys';

const HUB_LEGEND: Legend = {
  '#': { solid: true },
  '.': {},
  '=': { oneWay: true },
  P: { spawn: 'player' },
  V: { spawn: 'descent' },
  B: { spawn: 'board' },
  S: { spawn: 'slot' },
  K: { spawn: 'cashier' },
  M: { spawn: 'smith' },
  X: { spawn: 'exit' },
  '1': { spawn: 'trophy:0' },
  '2': { spawn: 'trophy:1' },
  '3': { spawn: 'trophy:2' },
  '4': { spawn: 'trophy:3' },
  '5': { spawn: 'trophy:4' },
};

export class HubScene extends GameplayScene {
  constructor() {
    super(SCENES.hub);
  }

  create(arrival: HubArrival = { kind: 'start' }): void {
    const save = gameState();
    const ts = CAVE_TILESET.tileSize;
    const room = parseRoom(hub.rows, HUB_LEGEND);
    this.buildWorld(room.grid, hub.seed, {});

    for (const s of room.spawns) {
      const x = (s.x + 0.5) * ts;
      const y = (s.y + 1) * ts;
      if (s.type === 'player') this.createPlayer(x, y, loadoutOf(save));
      else this.spawnObject(s.type, x, y);
    }
    this.decorate();
    this.input.keyboard!.on('keydown-ESC', () => this.pauseMenu());
    this.cameras.main.fadeIn(500, 0, 0, 0);
    this.time.delayedCall(300, () => this.greet(arrival));
  }

  update(_t: number, delta: number): void {
    this.gameplayUpdate(delta);
  }

  protected hudExtras(): Partial<HudState> {
    const s = gameState();
    return {
      hub: {
        balance: s.balance,
        debt: s.debt,
        guarantee: s.guarantee,
        bosses: BOSS_ORDER.map((id) => ({ name: BOSSES[id]!.name, defeated: s.bosses.includes(id), final: !!BOSSES[id]!.final })),
        curse: s.nextCurse ? CURSES[s.nextCurse]?.name : null,
      },
    };
  }

  // ---------------- об'єкти хабу ----------------

  private spawnObject(type: string, x: number, y: number): void {
    const save = gameState();
    switch (type) {
      case 'descent':
        this.add.image(x, y, 'cave', 'cave/mine_frame/0').setOrigin(0.5, 1).setDepth(2);
        this.add.image(x, y, 'ph/elevator').setOrigin(0.5, 1).setDepth(3);
        this.label(x, y - 70, 'СПУСК', COLORS.dim);
        this.interactables.push(new Trigger(x, y - 8, 30, () => this.descentPrompt(), () => this.startDescent()));
        break;
      case 'board':
        this.add.image(x, y, 'ph/board').setOrigin(0.5, 1).setDepth(2);
        this.interactables.push(new Trigger(x, y - 8, 26, () => 'E — дошка рекордів', () => this.showStats()));
        break;
      case 'slot': {
        const m = this.add.image(x, y, 'ph/slot_machine').setOrigin(0.5, 1).setDepth(2);
        // «живі» лампи автомата
        this.tweens.add({ targets: m, alpha: { from: 1, to: 0.85 }, yoyo: true, repeat: -1, duration: 260 + Math.random() * 200 });
        this.interactables.push(new Trigger(x, y - 8, 24, () => `E — грати (ставка ${save.bet})`, () => this.fadeTo(SCENES.slot, {}, 300)));
        break;
      }
      case 'cashier':
        this.add.image(x, y, 'ph/cashier').setOrigin(0.5, 1).setDepth(2);
        this.label(x, y - 40, 'КАСА', COLORS.gold);
        this.interactables.push(new Trigger(x, y - 8, 30, () => 'E — каса (погасити борг)', () => this.cashier()));
        break;
      case 'smith': {
        const b = this.add.sprite(x, y + 1, 'props', 'blacksmith/idle/0').setOrigin(0.5, 1).setDepth(2);
        if (this.anims.exists('fx:blacksmith')) b.play('fx:blacksmith');
        this.label(x, y - 60, 'КОВАЛЬ', COLORS.dim);
        this.interactables.push(new Trigger(x, y - 8, 34, () => 'E — коваль (прокачка і зброя)', () => this.smith()));
        break;
      }
      case 'exit': {
        const open = canExit(save, BOSS_ORDER);
        this.add.sprite(x, y + 1, 'props', open ? 'door/door/open/0' : 'door/door/closed/0').setOrigin(0.5, 1).setDepth(2);
        this.label(x, y - 66, 'ВИХІД', open ? COLORS.green : COLORS.red);
        this.interactables.push(new Trigger(x, y - 8, 30, () => this.exitPrompt(), () => this.tryExit()));
        break;
      }
      default:
        if (type.startsWith('trophy:')) {
          const id = BOSS_ORDER[Number(type.slice(7))]!;
          const boss = BOSSES[id]!;
          const won = save.bosses.includes(id);
          const door = boss.trophyDoor;
          const frame = won ? (this.textures.get('props').has(`door/${door}/open/0`) ? `door/${door}/open/0` : `door/${door}/open/03`) : `door/${door}/closed/0`;
          this.add.sprite(x, y + 1, 'props', frame).setOrigin(0.5, 1).setDepth(2).setScale(0.6).setAlpha(won ? 1 : 0.6);
          this.interactables.push(
            new Trigger(x, y - 8, 14, () => (won ? `${boss.name} — переможений` : boss.final ? '??? — фінальний бос. Спершу всі інші' : '??? — вибий бонуску на слоті'), () => {}),
          );
        }
    }
  }

  private label(x: number, y: number, text: string, color: string): void {
    txt(this, x, y, text, 8, color, { stroke: '#000000', strokeThickness: 2 }).setOrigin(0.5, 1).setDepth(4);
  }

  /** Неонові вивіски — «казино всередині скелі». */
  private decorate(): void {
    const neon = txt(this, 28 * 16 + 8, 7 * 16, 'ДОДЕП 24/7', 16, '#ff5a8a', { stroke: '#3a0010', strokeThickness: 3 }).setOrigin(0.5).setDepth(4);
    this.tweens.add({ targets: neon, alpha: { from: 1, to: 0.55 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    const sub = txt(this, 28 * 16 + 8, 7 * 16 + 14, 'наступна точно зайде', 8, '#ffd25a').setOrigin(0.5).setDepth(4);
    this.tweens.add({ targets: sub, alpha: { from: 0.9, to: 0.4 }, yoyo: true, repeat: -1, duration: 1300, delay: 400 });
  }

  private greet(a: HubArrival): void {
    const s = gameState();
    if (a.kind === 'elevator') {
      this.hud.banner(`+${a.banked ?? 0} фішок на баланс`, COLORS.gold, 1600);
      this.time.delayedCall(1900, () => this.hud.banner(`Відсотки: борг +${a.interest ?? 0}`, COLORS.red, 1500));
    } else if (a.kind === 'death') {
      const bag = a.bagChips ? `Мішок (${a.bagChips}) лишився на глибині ${a.depth}` : 'Помер з порожніми кишенями';
      this.hud.banner(pick(TEXTS.death), COLORS.red, 1400);
      this.time.delayedCall(1700, () => this.hud.banner(bag, COLORS.text, 1800));
      if (a.bagBurned) this.time.delayedCall(3700, () => this.hud.banner(`Старий мішок (${a.bagBurned}) згорів`, COLORS.red, 1500));
      this.time.delayedCall(a.bagBurned ? 5400 : 3700, () => this.hud.banner(`Відсотки: борг +${a.interest ?? 0}`, COLORS.red, 1400));
    } else if (s.stats.runs === 0 && s.stats.spins === 0) {
      this.hud.banner('Борг сам себе не поверне', COLORS.gold, 2000);
    }
  }

  // ---------------- спуск ----------------

  private descentPrompt(): string {
    const s = gameState();
    const bag = s.deathBag ? `  (мішок ${s.deathBag.chips} на глибині ${s.deathBag.depth})` : '';
    return `E — спуститися в підземелля${bag}`;
  }

  private startDescent(): void {
    const s = gameState();
    const { seed, curse } = startRun(s);
    persist();
    const run: DungeonRun = { depth: 1, seed: urlSeed() ?? seed, curse, chips: 0, hp: null, flasks: null, bagPicked: false };
    this.fadeTo(SCENES.dungeon, run, 600);
  }

  // ---------------- каса ----------------

  private cashier(): void {
    const s = gameState();
    const pay = (n: number) => () => {
      const paid = payDebt(s, n);
      persist();
      if (paid > 0) this.fx.floatText(this.player.x, this.player.y - 40, `-${paid} боргу`, COLORS.green);
      if (s.debt === 0) this.hud.banner(pick(TEXTS.debtPaid), COLORS.green, 2400);
    };
    openMenu(this, {
      title: 'КАСА',
      subtitle: () => `Баланс: ${s.balance}   Борг: ${s.debt}`,
      items: (): MenuItem[] => {
        const max = Math.min(s.balance, s.debt);
        const opts = [10, 50, 250, 1000].filter((n) => n < max);
        return [
          ...opts.map((n) => ({ label: `Погасити ${n}`, enabled: s.balance >= n && s.debt > 0, action: pay(n), description: 'Погашення боргу будь-якою сумою.' })),
          { label: `Погасити все можливе (${max})`, enabled: max > 0, action: pay(max), description: 'Найрозумніша кнопка в цьому закладі.' },
          { label: 'Назад', action: () => 'close' as const },
        ];
      },
    });
  }

  // ---------------- коваль ----------------

  private smith(): void {
    const s = gameState();
    const buy = (id: UpgradeId) => () => {
      const r = buyUpgrade(s, id);
      persist();
      if (r === 'ok') this.refreshLoadout();
    };
    const weapon = (w: WeaponId) => () => {
      if (s.weapons.includes(w)) equipWeapon(s, w);
      else buyWeapon(s, w);
      persist();
      this.refreshLoadout();
    };
    openMenu(this, {
      title: 'КОВАЛЬ',
      subtitle: () => `Баланс: ${s.balance} фішок`,
      width: 340,
      items: (): MenuItem[] => [
        ...(Object.keys(UPGRADES) as UpgradeId[]).map((id) => {
          const u = UPGRADES[id];
          const price = upgradePrice(s, id);
          return {
            label: `${u.name}  [${s.upgrades[id]}/${u.prices.length}]`,
            right: price === null ? 'МАКС' : `${price}`,
            enabled: price !== null && s.balance >= price,
            description: u.description,
            action: buy(id),
          };
        }),
        ...(Object.keys(WEAPONS) as WeaponId[]).map((w) => {
          const owned = s.weapons.includes(w);
          return {
            label: `${WEAPONS[w].name}${s.equipped === w ? '  (у руках)' : ''}`,
            right: owned ? (s.equipped === w ? '' : 'взяти') : `${WEAPON_PRICES[w]}`,
            enabled: owned ? s.equipped !== w : s.balance >= WEAPON_PRICES[w],
            description: WEAPONS[w].description,
            action: weapon(w),
          };
        }),
        { label: 'Назад', action: () => 'close' as const },
      ],
    });
  }

  /** Прокачка видна одразу: броня — на спрайті, зброя — в руках. */
  private refreshLoadout(): void {
    this.player.applyLoadout(loadoutOf(gameState()));
  }

  // ---------------- статистика, вихід, пауза ----------------

  private showStats(): void {
    openMenu(this, {
      title: 'ДОШКА РЕКОРДІВ',
      width: 320,
      items: () => [...statsLines(gameState()).map((l) => ({ label: l.label, right: l.value, action: () => {} })), { label: 'Назад', action: () => 'close' as const }],
    });
  }

  private exitPrompt(): string {
    const s = gameState();
    if (canExit(s, BOSS_ORDER)) return 'E — ВИЙТИ З КАЗИНО';
    const left = BOSS_ORDER.filter((id) => !s.bosses.includes(id)).length;
    return `Зачинено. Борг: ${s.debt}, босів лишилось: ${left}`;
  }

  private tryExit(): void {
    const s = gameState();
    if (!canExit(s, BOSS_ORDER)) {
      this.hud.banner('Охорона: «Спершу розрахуйся»', COLORS.red, 1500);
      return;
    }
    s.victory = true;
    persist();
    this.fadeTo(SCENES.ending, {}, 1200);
  }

  private pauseMenu(): void {
    openMenu(this, {
      title: 'ПАУЗА',
      items: () => [
        { label: 'Продовжити', action: () => 'close' as const },
        {
          label: 'Головне меню',
          // час сцени хабу стоїть, поки відкрите меню, — перехід спрацює одразу після закриття
          action: () => (this.time.delayedCall(0, () => this.fadeTo(SCENES.menu)), 'close' as const),
        },
      ],
    });
  }
}

/** ?seed=123 у адресі — фіксований seed підземелля (демонстрація відтворюваності). */
function urlSeed(): number | null {
  const v = new URLSearchParams(window.location.search).get('seed');
  return v && /^\d+$/.test(v) ? Number(v) >>> 0 : null;
}
