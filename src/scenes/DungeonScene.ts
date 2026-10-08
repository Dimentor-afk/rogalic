/**
 * ПІДЗЕМЕЛЛЯ: один поверх, згенерований за seed. Фарм фішок, ліфт нагору, двері глибше, мішок смерті.
 * Між поверхами переносяться фішки забігу, HP і фляги (нові поверхи — без відпочинку).
 */
import Phaser from 'phaser';
import { CAVE_TILESET } from '../config/tilesets';
import { ROOM_SIZE } from '../config/dungeon';
import { CURSES, type CurseDef } from '../config/curses';
import { TEXTS, pick } from '../config/texts';
import { generateDungeon, type DungeonLevel, type RoomTemplate } from '../core/dungeon/generator';
import { hash32 } from '../core/rng';
import { finishRun, loadoutOf } from '../core/state/GameState';
import { gameState, persist } from '../core/state/store';
import { Barrel, Chest, DeathBag, Door, Trigger } from '../entities/props';
import rooms from '../levels/rooms.json';
import { COLORS } from '../ui/text';
import { GameplayScene } from './GameplayScene';
import type { HudState, MinimapRoom } from './HudScene';
import { SCENES } from './keys';
import { sfx } from '../core/audio/Sfx';

export interface DungeonRun {
  depth: number;
  /** Seed забігу; seed поверху = hash(seed, глибина). */
  seed: number;
  curse: string | null;
  chips: number;
  /** HP і фляги з попереднього поверху (null — повні). */
  hp: number | null;
  flasks: number | null;
  bagPicked: boolean;
}

export interface HubArrival {
  /** start — з меню; slot — від автомата; bossLost — бонуска згоріла. */
  kind: 'elevator' | 'death' | 'start' | 'slot' | 'bossLost';
  banked?: number;
  bagChips?: number;
  bagBurned?: number;
  interest?: number;
  depth?: number;
}

const TEMPLATES = rooms as RoomTemplate[];

export class DungeonScene extends GameplayScene {
  private run!: DungeonRun;
  private dungeon!: DungeonLevel;
  private curse: CurseDef | null = null;
  private bag: DeathBag | null = null;
  private bagPicked = false;
  private finished = false;
  private visited = new Set<string>();
  private darkness?: Phaser.GameObjects.RenderTexture;
  private lightImg?: Phaser.GameObjects.Image;

  constructor() {
    super(SCENES.dungeon);
  }

  create(data: DungeonRun): void {
    const save = gameState();
    this.run = data;
    this.finished = false;
    this.bagPicked = data.bagPicked;
    this.visited = new Set();
    this.bag = null;
    this.curse = data.curse ? (CURSES[data.curse] ?? null) : null;
    const floorSeed = hash32(data.seed, data.depth);
    this.dungeon = generateDungeon({
      seed: floorSeed,
      depth: data.depth,
      templates: TEMPLATES,
      curse: this.curse,
      bag: data.bagPicked ? null : save.deathBag,
    });

    this.buildWorld(this.dungeon.grid, floorSeed, {
      onPlayerDeath: () => this.onDeath(),
    });
    this.combat.enemySpeedMultiplier = this.curse?.enemySpeed ?? 1;

    const ts = CAVE_TILESET.tileSize;
    const loadout = loadoutOf(save, this.curse?.maxHpDelta ?? 0);
    if (this.curse?.noFlasks) loadout.flasks = 0;
    for (const s of this.dungeon.spawns) {
      const x = (s.x + 0.5) * ts;
      const y = (s.y + 1) * ts;
      switch (s.kind) {
        case 'player':
          this.createPlayer(x, y, loadout);
          break;
        case 'enemy':
          this.combat.spawnEnemy(s.enemyId!, x + Phaser.Math.Between(-4, 4), y, data.depth);
          break;
        case 'barrel':
          this.combat.breakables.push(new Barrel(this, x, y, s.chips ?? 1, this.combat, this.fx));
          break;
        case 'chest': {
          const chest = new Chest(this, x, y, s.chips ?? 10, !!s.flask && !this.curse?.noFlasks, this.combat, this.fx, () => {
            this.player.flasks++;
          });
          this.combat.breakables.push(chest);
          this.interactables.push(chest);
          break;
        }
        case 'door': {
          const door = new Door(this, x, y, this.fx);
          this.blockers.add(door.zone);
          this.combat.breakables.push(door);
          this.interactables.push(door);
          break;
        }
        case 'elevator':
          this.add.image(x, y, 'cave', 'cave/mine_frame/0').setOrigin(0.5, 1).setDepth(2);
          this.add.image(x, y, 'ph/elevator').setOrigin(0.5, 1).setDepth(3);
          this.interactables.push(
            new Trigger(x, y - 8, 30, () => `E — ліфт нагору (зарахувати ${this.combat.runChips()} фішок)`, () => this.useElevator()),
          );
          break;
        case 'descent': {
          const d = this.add.sprite(x, y + 1, 'props', 'door/dungeon_master_door/closed/0').setOrigin(0.5, 1).setDepth(2);
          if (this.anims.exists('fx:deepDoor')) d.play('fx:deepDoor');
          this.interactables.push(new Trigger(x, y - 8, 30, () => `E — глибше (глибина ${data.depth + 1}: сильніші вороги, більше фішок)`, () => this.descend()));
          break;
        }
        case 'bag':
          this.bag = new DeathBag(this, x, y, s.chips ?? 0);
          break;
      }
    }
    // перенесені з попереднього поверху HP/фляги/фішки
    if (data.hp !== null) this.player.hp = Math.min(data.hp, this.player.loadout.maxHp);
    if (data.flasks !== null) this.player.flasks = this.curse?.noFlasks ? 0 : data.flasks;
    this.combat.setChips(data.chips);

    if (this.curse?.lightRadius) this.createDarkness();

    this.cameras.main.fadeIn(400, 0, 0, 0);
    this.time.delayedCall(250, () => {
      this.hud.banner(`ГЛИБИНА ${data.depth}`, COLORS.gold, 1400);
      if (this.curse) this.time.delayedCall(1500, () => this.hud.banner(this.curse!.name, COLORS.red, 1800));
    });
  }

  update(_t: number, delta: number): void {
    if (this.gameplayUpdate(delta)) {
      this.checkBag();
      // впав у нікуди (не мало б статися) — вважаємо смертю
      if (this.player.alive && this.player.y > this.level.heightPx + 64) this.player.receiveHit({ damage: 999, fromX: this.player.x, blockable: false });
    }
    if (this.darkness) this.updateDarkness();
  }

  protected hudExtras(): Partial<HudState> {
    return { chips: this.combat.runChips(), depth: this.run.depth, map: this.minimap() };
  }

  // ---------------- мінікарта ----------------

  private minimap(): { rooms: MinimapRoom[] } {
    const tx = Math.floor(this.player.x / CAVE_TILESET.tileSize);
    const ty = Math.floor((this.player.y - 1) / CAVE_TILESET.tileSize);
    const cmx = Math.floor(tx / (ROOM_SIZE.w - 1));
    const cmy = Math.floor(ty / (ROOM_SIZE.h - 1));
    this.visited.add(`${cmx},${cmy}`);
    return {
      rooms: this.dungeon.rooms.map((r) => ({
        mx: r.mx,
        my: r.my,
        type: r.node.type,
        visited: this.visited.has(`${r.mx},${r.my}`),
        current: r.mx === cmx && r.my === cmy,
        exits: r.exits,
      })),
    };
  }

  // ---------------- мішок смерті ----------------

  private checkBag(): void {
    const b = this.bag;
    if (!b || !b.alive || !this.player.alive) return;
    if (Math.abs(b.x - this.player.x) < 14 && Math.abs(b.y - this.player.y) < 24) {
      b.pickUp(this.fx);
      sfx.play('bonus');
      this.bagPicked = true;
      this.combat.addChips(b.chips, b.x, b.y - 16, 'мішок +');
      this.hud.banner('Мішок повернуто!', COLORS.gold, 1200);
    }
  }

  // ---------------- темрява (прокляття) ----------------

  private createDarkness(): void {
    const { width, height } = this.scale;
    this.darkness = this.add.renderTexture(0, 0, width, height).setOrigin(0, 0).setScrollFactor(0).setDepth(500);
    // м'яке коло світла — текстура з радіальним градієнтом (див. placeholders.ts)
    this.lightImg = this.make.image({ x: 0, y: 0, key: 'ph/light' }, false);
    this.lightImg.setScale((this.curse!.lightRadius! * 2) / this.lightImg.width);
  }

  private updateDarkness(): void {
    const rt = this.darkness!;
    const cam = this.cameras.main;
    rt.clear();
    rt.fill(0x000000, 0.94);
    // «витираємо» темряву колом світла навколо гравця
    this.lightImg!.setPosition(this.player.x - cam.worldView.x, this.player.y - 16 - cam.worldView.y);
    rt.erase(this.lightImg!);
  }

  // ---------------- кінець поверху ----------------

  private useElevator(): void {
    if (this.finished) return;
    this.finished = true;
    sfx.play('door');
    const save = gameState();
    const summary = finishRun(save, { chips: this.combat.runChips(), died: false, depth: this.run.depth, bagPicked: this.bagPicked });
    persist();
    this.fadeTo(SCENES.hub, { kind: 'elevator', ...summary, depth: this.run.depth } satisfies HubArrival, 600);
  }

  private descend(): void {
    if (this.finished) return;
    this.finished = true;
    const next: DungeonRun = {
      ...this.run,
      depth: this.run.depth + 1,
      chips: this.combat.runChips(),
      hp: this.player.hp,
      flasks: this.player.flasks,
      bagPicked: this.bagPicked,
    };
    this.fadeTo(SCENES.dungeon, next, 500);
  }

  private onDeath(): void {
    if (this.finished) return;
    this.finished = true;
    this.hud.banner(pick(TEXTS.death), COLORS.red, 1800);
    const save = gameState();
    const summary = finishRun(save, { chips: this.combat.runChips(), died: true, depth: this.run.depth, bagPicked: this.bagPicked });
    persist();
    this.time.delayedCall(2200, () => this.fadeTo(SCENES.hub, { kind: 'death', ...summary, depth: this.run.depth } satisfies HubArrival, 700));
  }
}
