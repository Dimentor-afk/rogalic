/**
 * Базова ігрова сцена: рівень, гравець, бойова система, ефекти, HUD, взаємодія з об'єктами.
 * Від неї успадковуються тестова печера, підземелля і арена боса — кожна додає лише своє.
 */
import Phaser from 'phaser';
import { CAVE_PARALLAX } from '../config/game';
import { CAVE_TILESET } from '../config/tilesets';
import { CombatSystem, type CombatEvents } from '../core/combat/CombatSystem';
import { Fx } from '../core/fx/Fx';
import { InputMap } from '../core/input/InputMap';
import type { Grid } from '../core/level/grid';
import { LevelView } from '../core/level/LevelView';
import { Parallax } from '../core/level/Parallax';
import { Player, type PlayerLoadout } from '../entities/Player';
import type { Interactable } from '../entities/props';
import type { HudScene, HudState } from './HudScene';
import { SCENES } from './keys';

/** Захист від «телепорту» після паузи вкладки: довгий кадр рахуємо як 50 мс. */
export const MAX_DT_MS = 50;

export abstract class GameplayScene extends Phaser.Scene {
  protected inputMap!: InputMap;
  protected player!: Player;
  protected level!: LevelView;
  protected grid!: Grid;
  protected parallax!: Parallax;
  protected fx!: Fx;
  protected combat!: CombatSystem;
  protected hud!: HudScene;
  protected interactables: Interactable[] = [];
  protected blockers!: Phaser.Physics.Arcade.StaticGroup;
  protected debugOn = false;
  private nearest: Interactable | null = null;
  /** Уже йде перехід в іншу сцену (fadeTo) — другий перехід ігноруємо. */
  protected transitioning = false;
  private readonly onResume = (): void => this.inputMap.suppress();

  /** Будує рівень і всі системи. Викликати на початку create(). */
  protected buildWorld(grid: Grid, seed: number, events: CombatEvents): void {
    const ts = CAVE_TILESET.tileSize;
    this.grid = grid;
    this.interactables = [];
    this.nearest = null;
    this.debugOn = false;
    this.transitioning = false;
    this.level = new LevelView(this, grid, CAVE_TILESET, seed).setDepth(0);
    this.parallax = new Parallax(this, CAVE_PARALLAX, this.level.heightPx);
    this.physics.world.setBounds(0, 0, this.level.widthPx, this.level.heightPx);
    this.inputMap = new InputMap(this);
    this.fx = new Fx(this);
    this.combat = new CombatSystem(this, this.level, grid, ts, this.fx, events);
    this.blockers = this.physics.add.staticGroup();
    this.physics.add.collider(this.combat.enemies, this.blockers);

    this.scene.launch(SCENES.hud);
    this.hud = this.scene.get(SCENES.hud) as HudScene;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(SCENES.hud);
      this.combat.destroy();
    });
    this.input.keyboard!.on('keydown-H', () => this.toggleDebug());
    // події сцени живуть між перезапусками — знімаємо старий обробник, щоб не накопичувались
    this.events.off(Phaser.Scenes.Events.RESUME, this.onResume);
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume);
  }

  /** Створює гравця, колізії і камеру. */
  protected createPlayer(x: number, y: number, loadout?: PlayerLoadout): Player {
    const p = new Player(this, x, y, this.inputMap, this.fx, this.combat.playerHooks, loadout);
    p.setDepth(10);
    this.player = p;
    this.combat.attachPlayer(p);
    this.physics.add.collider(p, this.level.solid);
    this.physics.add.collider(p, this.blockers);
    // Дошки: тримають, лише якщо на попередньому кроці ноги були над дошкою і гравець не зістрибує.
    this.physics.add.collider(
      p,
      this.level.oneWay,
      () => (p.oneWayContactAt = this.time.now),
      (_p, t) => {
        const tile = t as Phaser.Tilemaps.Tile;
        const b = p.body;
        return !p.isDroppingThrough() && b.prev.y + b.height <= tile.pixelY + 4;
      },
    );
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.level.widthPx, this.level.heightPx);
    cam.startFollow(p, true, 0.15, 0.15, 0, 12);
    cam.setDeadzone(24, 24);
    return p;
  }

  /** Один кадр гри. Повертає false, якщо кадр «заморожений» (hitstop). */
  protected gameplayUpdate(delta: number): boolean {
    const dt = Math.min(delta, MAX_DT_MS);
    // hitstop: заморожуємо і логіку (таймери, AI); ввід теж не читаємо — натискання не загубиться
    const frozen = this.fx.frozen;
    if (!frozen) {
      this.inputMap.update();
      this.combat.beginFrame();
      this.player.update(dt);
      this.combat.update(dt);
      this.fx.update(dt);
      this.updateInteraction();
    }
    this.parallax.update();
    this.syncHud();
    return !frozen;
  }

  /** Найближчий об'єкт у радіусі → підказка в HUD; «взаємодія» → активувати. */
  private updateInteraction(): void {
    const p = this.player;
    let best: Interactable | null = null;
    let bestD = Infinity;
    if (p.alive) {
      for (const it of this.interactables) {
        if (!it.alive) continue;
        const d = Math.hypot(it.x - p.x, (it.y - p.y) * 1.5);
        if (d <= it.range && d < bestD) {
          best = it;
          bestD = d;
        }
      }
    }
    this.nearest = best;
    if (best && !p.inputLocked && this.inputMap.justPressed('interact')) best.activate();
  }

  protected syncHud(): void {
    const p = this.player;
    const base: HudState = {
      hp: p.hp,
      maxHp: p.loadout.maxHp,
      stamina: p.stamina.value,
      maxStamina: p.stamina.max,
      flasks: p.flasks,
      hint: this.nearest?.prompt(),
    };
    this.hud.sync({ ...base, ...this.hudExtras(), ...(this.nearest ? { hint: this.nearest.prompt() } : {}) });
  }

  /** Що ще показати в HUD (фішки, глибина, мінікарта…). */
  protected abstract hudExtras(): Partial<HudState>;

  protected toggleDebug(): void {
    this.debugOn = !this.debugOn;
    const world = this.physics.world;
    if (!world.debugGraphic) world.createDebugGraphic();
    world.drawDebug = this.debugOn;
    world.debugGraphic.setVisible(this.debugOn);
    world.debugGraphic.clear();
    this.level.setCollisionVisible(this.debugOn);
    this.combat.debug = this.debugOn;
  }

  /** Перехід в іншу сцену з затемненням. */
  protected fadeTo(scene: string, data?: object, ms = 400): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.player.inputLocked = true;
    this.cameras.main.fadeOut(ms, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
