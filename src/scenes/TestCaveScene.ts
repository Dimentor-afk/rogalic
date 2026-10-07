/**
 * Тестова печера — бойовий полігон: рух, бій, вороги всіх архетипів, манекен.
 * Справжній забіг (згенероване підземелля) — у DungeonScene; ця сцена лишається для тренування і дебагу.
 */
import Phaser from 'phaser';
import { CAVE_PARALLAX } from '../config/game';
import { ROOM_LEGEND } from '../config/legend';
import { CAVE_TILESET } from '../config/tilesets';
import { PLAYER_ARMOR_LEVELS } from '../config/assets';
import { TEXTS, pick } from '../config/texts';
import type { WeaponId } from '../config/weapons';
import { InputMap } from '../core/input/InputMap';
import { parseRoom } from '../core/level/grid';
import { LevelView } from '../core/level/LevelView';
import { Parallax } from '../core/level/Parallax';
import { Fx } from '../core/fx/Fx';
import { CombatSystem } from '../core/combat/CombatSystem';
import { Player } from '../entities/Player';
import testCave from '../levels/test-cave.json';
import type { HudScene } from './HudScene';
import { COLORS } from '../ui/text';
import { ASSET_PROBLEMS_KEY } from './PreloadScene';
import { SCENES } from './keys';

const WEAPON_KEYS: WeaponId[] = ['sword', 'axe', 'scepter', 'special'];
/** Захист від «телепорту» після паузи вкладки: довгий кадр рахуємо як 50 мс. */
const MAX_DT_MS = 50;

export class TestCaveScene extends Phaser.Scene {
  private inputMap!: InputMap;
  private player!: Player;
  private level!: LevelView;
  private parallax!: Parallax;
  private fx!: Fx;
  private combat!: CombatSystem;
  private hud!: HudScene;
  private spawnPoint = new Phaser.Math.Vector2();
  private debugText!: Phaser.GameObjects.Text;
  private debugOn = false;

  constructor() {
    super(SCENES.testCave);
  }

  create(): void {
    const ts = CAVE_TILESET.tileSize;
    const room = parseRoom(testCave.rows, ROOM_LEGEND);
    this.debugOn = false;

    this.level = new LevelView(this, room.grid, CAVE_TILESET, testCave.seed).setDepth(0);
    this.parallax = new Parallax(this, CAVE_PARALLAX, this.level.heightPx);
    this.physics.world.setBounds(0, 0, this.level.widthPx, this.level.heightPx);
    this.inputMap = new InputMap(this);
    this.fx = new Fx(this);
    this.combat = new CombatSystem(this, this.level, room.grid, ts, this.fx, {
      onPlayerDeath: () => this.onPlayerDeath(),
    });

    for (const s of room.spawns) {
      // точка появи — низ клітинки по центру (origin спрайтів — під ногами)
      const x = (s.x + 0.5) * ts;
      const y = (s.y + 1) * ts;
      if (s.type === 'player') {
        this.spawnPoint.set(x, y);
        this.player = new Player(this, x, y, this.inputMap, this.fx, this.combat.playerHooks);
        this.player.setDepth(10);
      } else if (s.type.startsWith('enemy:')) {
        this.combat.spawnEnemy(s.type.slice(6), x, y, 1);
      }
    }
    if (!this.player) throw new Error('У рівні немає точки появи гравця (P)');
    this.combat.attachPlayer(this.player);

    this.physics.add.collider(this.player, this.level.solid);
    // Дошки: тримають, лише якщо на попередньому кроці ноги були над дошкою і гравець не зістрибує.
    this.physics.add.collider(
      this.player,
      this.level.oneWay,
      () => (this.player.oneWayContactAt = this.time.now),
      (_p, t) => {
        const tile = t as Phaser.Tilemaps.Tile;
        const b = this.player.body;
        return !this.player.isDroppingThrough() && b.prev.y + b.height <= tile.pixelY + 4;
      },
    );

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.level.widthPx, this.level.heightPx);
    cam.startFollow(this.player, true, 0.15, 0.15, 0, 12);
    cam.setDeadzone(24, 24);

    this.scene.launch(SCENES.hud);
    this.hud = this.scene.get(SCENES.hud) as HudScene;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(SCENES.hud);
      this.combat.destroy();
    });

    this.debugText = this.add
      .text(4, 60, '', { fontFamily: 'Tiny5, monospace', fontSize: '8px', color: '#9fe0a0', backgroundColor: '#000000aa' })
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.bindDebugKeys();
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, MAX_DT_MS);
    // hitstop: заморожуємо і логіку (таймери, AI), не лише фізику; ввід теж не читаємо — натискання не загубиться
    if (!this.fx.frozen) {
      this.inputMap.update();
      this.combat.beginFrame();
      this.player.update(dt);
      this.combat.update(dt);
      this.fx.update(dt);
      if (this.player.y > this.level.heightPx + 64) this.respawn();
    }
    this.parallax.update();
    this.syncHud();
    if (this.debugOn) this.updateDebugText();
  }

  private syncHud(): void {
    const p = this.player;
    this.hud.sync({
      hp: p.hp,
      maxHp: p.loadout.maxHp,
      stamina: p.stamina.value,
      maxStamina: p.stamina.max,
      flasks: p.flasks,
      chips: this.combat.runChips(),
      hint: 'J атака  L/Shift перекат  K блок (вчасно — паріру)  Q фляга  S+Space вниз',
    });
  }

  private onPlayerDeath(): void {
    this.hud.banner(pick(TEXTS.death), COLORS.red, 1600);
    this.time.delayedCall(2200, () => this.respawn());
  }

  private respawn(): void {
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y);
    this.player.body.reset(this.spawnPoint.x, this.spawnPoint.y);
    this.player.restore();
  }

  private bindDebugKeys(): void {
    const kb = this.input.keyboard!;
    kb.on('keydown-H', () => this.toggleDebug());
    kb.on('keydown-G', () => this.scene.start(SCENES.gallery));
    kb.on('keydown-R', () => this.respawn());
    // 1–4: зброя, T: наступний рівень броні — перевірка мувсетів і варіантів спрайтів
    ['ONE', 'TWO', 'THREE', 'FOUR'].forEach((k, i) => {
      kb.on(`keydown-${k}`, () => this.player.setLoadout(WEAPON_KEYS[i]!, this.player.loadout.armor));
    });
    kb.on('keydown-T', () => this.player.setLoadout(this.player.loadout.weapon, (this.player.loadout.armor + 1) % PLAYER_ARMOR_LEVELS));
  }

  private toggleDebug(): void {
    this.debugOn = !this.debugOn;
    const world = this.physics.world;
    if (!world.debugGraphic) world.createDebugGraphic();
    world.drawDebug = this.debugOn;
    world.debugGraphic.setVisible(this.debugOn);
    world.debugGraphic.clear();
    this.level.setCollisionVisible(this.debugOn);
    this.combat.debug = this.debugOn;
    this.debugText.setVisible(this.debugOn);
  }

  private updateDebugText(): void {
    const p = this.player;
    const b = p.body;
    const problems = (this.registry.get(ASSET_PROBLEMS_KEY) as string[] | undefined) ?? [];
    this.debugText.setText(
      [
        `fps ${this.game.loop.actualFps.toFixed(0)}  ворогів ${this.combat.enemies.countActive()}`,
        `pos ${p.x.toFixed(0)},${p.y.toFixed(0)}  vel ${b.velocity.x.toFixed(0)},${b.velocity.y.toFixed(0)}  ground ${b.blocked.down}`,
        `sprite ${p.key}  ${p.weapon.name}`,
        `1-4 зброя, T броня (${p.loadout.armor}), R — на старт`,
        `проблем з асетами: ${problems.length}`,
      ].join('\n'),
    );
  }
}
