/**
 * АРЕНА БОСА (бонуска слота). Кат-сцена → бій → результат:
 *   програв — «бонуска згоріла», повернення в хаб;
 *   переміг — панель множників (без шкоди / без фляг / швидко) → 10 фріспінів.
 * Арена — один екран (30×17 тайлів), камера не рухається: видно всі телеграфи.
 */
import Phaser from 'phaser';
import { BOSSES, FIGHT_MULTIPLIERS, type BossDef } from '../config/bosses';
import { CAVE_TILESET } from '../config/tilesets';
import { TEXTS, pick } from '../config/texts';
import { sfx } from '../core/audio/Sfx';
import { parseRoom, type Legend } from '../core/level/grid';
import { recordBossWin } from '../core/slot/session';
import { startMultiplierFor } from '../core/slot/slot';
import { loadoutOf } from '../core/state/GameState';
import { gameState, persist } from '../core/state/store';
import { Boss, type BossWorld } from '../entities/boss/Boss';
import type { Enemy } from '../entities/enemies/Enemy';
import arenas from '../levels/arenas.json';
import { COLORS, txt } from '../ui/text';
import type { HubArrival } from './DungeonScene';
import type { FreeSpinsStart } from './FreeSpinsScene';
import { GameplayScene, MAX_DT_MS } from './GameplayScene';
import { formatTime, type HudState } from './HudScene';
import { openMenu } from './MenuScene';
import { SCENES } from './keys';

export interface BossFightStart {
  bossId: string;
  bet: number;
  /** Куплена бонуска (для статистики/текстів). */
  bought: boolean;
}

const ARENA_LEGEND: Legend = {
  '#': { solid: true },
  '.': {},
  '=': { oneWay: true },
  P: { spawn: 'player' },
  O: { spawn: 'boss' },
};

/** Скільки міньйонів може бути одночасно (щоб «виклик» не перетворився на орду). */
const MAX_MINIONS = 4;

type FightState = 'intro' | 'fight' | 'won' | 'lost';

export class BossArenaScene extends GameplayScene {
  private start!: BossFightStart;
  private def!: BossDef;
  private boss!: Boss;
  private fight: FightState = 'intro';
  private elapsedMs = 0;
  private lastHp = 0;
  private startFlasks = 0;
  private tookDamage = false;
  private usedFlask = false;
  private skipIntro?: () => void;
  private arena = { left: 0, right: 0, floorY: 0, top: 0 };

  constructor() {
    super(SCENES.bossArena);
  }

  create(data: BossFightStart): void {
    this.start = data;
    this.def = BOSSES[data.bossId]!;
    this.fight = 'intro';
    this.elapsedMs = 0;
    this.tookDamage = false;
    this.usedFlask = false;
    const ts = CAVE_TILESET.tileSize;
    const layout = arenas.find((a) => a.id === this.def.arena) ?? arenas[0]!;
    const room = parseRoom(layout.rows, ARENA_LEGEND);
    this.buildWorld(room.grid, layout.seed, { onPlayerDeath: () => this.lose() });
    this.combat.rewardChips = false;
    this.computeArena(room.grid.width, room.grid.height, layout.rows);

    let bossAt = { x: (room.grid.width - 6) * ts, y: this.arena.floorY };
    for (const s of room.spawns) {
      const x = (s.x + 0.5) * ts;
      const y = (s.y + 1) * ts;
      if (s.type === 'player') this.createPlayer(x, y, loadoutOf(gameState()));
      else if (s.type === 'boss') bossAt = { x, y };
    }
    this.boss = new Boss(this, bossAt.x, bossAt.y, this.def, this.bossWorld());
    this.boss.y = this.boss.spriteYFor(this.boss.restBottom());
    this.physics.add.collider(this.boss, this.level.solid);
    this.combat.targets.push(this.boss);
    this.lastHp = this.player.hp;
    this.startFlasks = this.player.flasks;

    this.input.keyboard!.on('keydown-ESC', () => this.pauseMenu());
    this.cameras.main.fadeIn(500, 0, 0, 0);
    this.intro();
  }

  /** Межі арени з шаблону: перший/останній вільний стовпчик над підлогою, верх і підлога. */
  private computeArena(w: number, h: number, rows: readonly string[]): void {
    const ts = CAVE_TILESET.tileSize;
    let floorRow = h - 1;
    while (floorRow > 0 && rows[floorRow - 1]![Math.floor(w / 2)] === '#') floorRow--;
    let topRow = 0;
    while (topRow < h && rows[topRow]![Math.floor(w / 2) - 3] === '#') topRow++;
    const above = rows[floorRow - 2]!;
    const first = above.search(/[^#]/);
    const last = above.length - 1 - [...above].reverse().join('').search(/[^#]/);
    Object.assign(this.arena, { left: first * ts, right: (last + 1) * ts, floorY: floorRow * ts, top: topRow * ts });
  }

  // ---------------- кат-сцена ----------------

  private intro(): void {
    const { width, height } = this.scale;
    this.player.inputLocked = true;
    const bars = [
      this.add.rectangle(0, -28, width, 28, 0x000000).setOrigin(0, 0).setScrollFactor(0).setDepth(900),
      this.add.rectangle(0, height, width, 28, 0x000000).setOrigin(0, 0).setScrollFactor(0).setDepth(900),
    ];
    this.tweens.add({ targets: bars[0], y: 0, duration: 400 });
    this.tweens.add({ targets: bars[1], y: height - 28, duration: 400 });
    const name = txt(this, width / 2, height * 0.3, this.def.name.toUpperCase(), 16, COLORS.red, { stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(901)
      .setAlpha(0);
    const taunt = txt(this, width / 2, height * 0.3 + 18, `«${this.def.taunt}»`, 8, COLORS.text, { stroke: '#000000', strokeThickness: 2, align: 'center', wordWrap: { width: 360 } })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(901)
      .setAlpha(0);
    const skip = txt(this, width - 6, height - 18, 'пробіл — пропустити', 8, COLORS.dim).setOrigin(1, 0).setScrollFactor(0).setDepth(901);

    this.time.delayedCall(450, () => {
      sfx.play('boss');
      this.fx.shake(500, 0.01);
      this.fx.playFx('smoke', this.boss.x, this.arena.floorY - 8, { scale: 1.6 });
      this.tweens.add({ targets: name, alpha: 1, duration: 300 });
    });
    this.time.delayedCall(1100, () => this.tweens.add({ targets: taunt, alpha: 1, duration: 300 }));

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.skipIntro = undefined;
      this.tweens.add({ targets: bars[0], y: -28, duration: 300 });
      this.tweens.add({ targets: bars[1], y: height, duration: 300 });
      this.tweens.add({ targets: [name, taunt, skip], alpha: 0, duration: 250, onComplete: () => [name, taunt, skip].forEach((o) => o.destroy()) });
      this.hud.banner('БІЙ!', COLORS.gold, 700);
      this.player.inputLocked = false;
      this.inputMap.suppress();
      this.boss.begin();
      this.fight = 'fight';
    };
    this.skipIntro = finish;
    this.time.delayedCall(3200, finish);
    this.time.delayedCall(500, () => {
      this.input.keyboard!.once('keydown-SPACE', () => this.skipIntro?.());
    });
  }

  // ---------------- кадр ----------------

  update(_t: number, delta: number): void {
    const running = this.gameplayUpdate(delta);
    if (!running) return;
    this.boss.update(Math.min(delta, MAX_DT_MS));
    if (this.fight !== 'fight') return;
    this.elapsedMs += Math.min(delta, MAX_DT_MS);
    // критерії стартового множника фріспінів
    const p = this.player;
    if (p.hp < this.lastHp) this.tookDamage = true;
    this.lastHp = p.hp;
    if (p.flasks < this.startFlasks) this.usedFlask = true;
    if (!this.boss.alive) this.onBossDying();
  }

  protected hudExtras(): Partial<HudState> {
    return {
      boss: { name: this.def.name, hp: Math.max(0, this.boss?.hp ?? 0), maxHp: this.def.hp, timeMs: this.elapsedMs, targetMs: this.def.targetTimeMs },
    };
  }

  // ---------------- BossWorld: що бос може робити зі світом ----------------

  private bossWorld(): BossWorld {
    return {
      player: this.player,
      fx: this.fx,
      combat: this.combat,
      arena: this.arena,
      shout: (t) => this.shout(t),
      spawnMinion: (id, x, y) => this.spawnMinion(id, x, y),
      addBlocker: (x, y, w, h) => this.addBlocker(x, y, w, h),
      onBossDefeated: () => this.showResults(),
    };
  }

  private shout(text: string): void {
    this.hud.banner(text, COLORS.red, 1300);
  }

  private spawnMinion(id: string, x: number, y: number): void {
    const alive = this.combat.enemies.getChildren().filter((e) => (e as Enemy).alive).length;
    if (alive >= MAX_MINIONS) return;
    const e = this.combat.spawnEnemy(id, x, y, 1);
    if (e) e.aggro = true;
  }

  private addBlocker(x: number, y: number, w: number, h: number): Phaser.GameObjects.Zone {
    const z = this.add.zone(x, y, w, h);
    this.physics.add.existing(z, true);
    this.blockers.add(z);
    return z;
  }

  // ---------------- результат ----------------

  /** Бос щойно впав: зупиняємо таймер, прибираємо загрози і міньйонів. */
  private onBossDying(): void {
    this.fight = 'won';
    this.combat.clearThreats();
    for (const obj of this.combat.enemies.getChildren()) {
      const e = obj as Enemy;
      if (e.alive) e.takeHit({ damage: 99999, knockback: 0, dir: 1, x: e.x, y: e.y - 10 });
    }
    this.hud.banner('ПЕРЕМОГА!', COLORS.gold, 1600);
  }

  private showResults(): void {
    const s = gameState();
    const fightRes = {
      noDamage: !this.tookDamage,
      noFlasks: !this.usedFlask,
      fast: this.elapsedMs <= this.def.targetTimeMs,
    };
    const mult = startMultiplierFor(fightRes, FIGHT_MULTIPLIERS);
    const isNew = recordBossWin(s, this.def.id);
    persist();
    sfx.play('bonus');

    const { width, height } = this.scale;
    const panel = this.add.container(0, 0).setScrollFactor(0).setDepth(950);
    const bg = this.add.rectangle(width / 2, height / 2, 300, 168, 0x0a0608, 0.94).setStrokeStyle(2, 0xd4a35a);
    panel.add(bg);
    const line = (y: number, label: string, ok: boolean, value: string) => {
      panel.add(txt(this, width / 2 - 130, y, `${ok ? '+' : '-'} ${label}`, 8, ok ? COLORS.text : COLORS.dim));
      panel.add(txt(this, width / 2 + 130, y, ok ? value : '—', 8, ok ? COLORS.gold : COLORS.dim).setOrigin(1, 0));
    };
    panel.add(txt(this, width / 2, height / 2 - 76, `${this.def.name} переможений`, 16, COLORS.gold).setOrigin(0.5, 0));
    line(height / 2 - 48, 'Без отриманої шкоди', fightRes.noDamage, `x${FIGHT_MULTIPLIERS.noDamage}`);
    line(height / 2 - 36, 'Без фляг', fightRes.noFlasks, `+x${FIGHT_MULTIPLIERS.noFlasks}`);
    line(height / 2 - 24, `Швидше за ${formatTime(this.def.targetTimeMs)} (${formatTime(this.elapsedMs)})`, fightRes.fast, `+x${FIGHT_MULTIPLIERS.fast}`);
    panel.add(txt(this, width / 2, height / 2 - 4, `СТАРТОВИЙ МНОЖНИК ФРІСПІНІВ: x${mult}`, 8, COLORS.white).setOrigin(0.5, 0));
    panel.add(
      txt(this, width / 2, height / 2 + 14, isNew ? 'Новий бос у колекції!' : 'Повторна перемога — лише фріспіни', 8, isNew ? COLORS.green : COLORS.dim).setOrigin(0.5, 0),
    );
    panel.add(txt(this, width / 2, height / 2 + 30, `Фріспіни: ${this.def.freeSpins.name}`, 8, COLORS.text).setOrigin(0.5, 0));
    const go = txt(this, width / 2, height / 2 + 56, 'E / пробіл — 10 ФРІСПІНІВ', 8, COLORS.gold).setOrigin(0.5, 0);
    panel.add(go);
    this.tweens.add({ targets: go, alpha: { from: 1, to: 0.4 }, yoyo: true, repeat: -1, duration: 400 });
    panel.setAlpha(0);
    this.tweens.add({ targets: panel, alpha: 1, duration: 300 });

    const next: FreeSpinsStart = { bossId: this.def.id, bet: this.start.bet, startMultiplier: mult, newBoss: isNew };
    let left = false;
    const proceed = () => {
      if (left) return;
      left = true;
      this.player.inputLocked = true;
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.freeSpins, next));
    };
    this.time.delayedCall(700, () => {
      const kb = this.input.keyboard!;
      for (const k of ['E', 'SPACE', 'ENTER', 'J']) kb.once(`keydown-${k}`, proceed);
      this.input.once('pointerdown', proceed);
    });
  }

  private lose(): void {
    if (this.fight === 'lost' || this.fight === 'won') return;
    this.fight = 'lost';
    const s = gameState();
    s.stats.bossLosses++;
    persist();
    this.hud.banner(pick(TEXTS.bossLost), COLORS.red, 2000);
    this.time.delayedCall(2400, () => this.fadeTo(SCENES.hub, { kind: 'bossLost' } satisfies HubArrival, 700));
  }

  private pauseMenu(): void {
    if (this.fight !== 'fight') return;
    openMenu(this, {
      title: 'ПАУЗА',
      subtitle: () => this.def.name,
      items: () => [
        { label: 'Продовжити', action: () => 'close' as const },
        {
          label: 'Здатися (бонуска згорить)',
          action: () => (this.time.delayedCall(0, () => this.lose()), 'close' as const),
        },
      ],
    });
  }
}
