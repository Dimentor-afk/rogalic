/**
 * Тестовий печерний рівень (Milestone 1): гравець бігає і стрибає.
 * У Milestone 3 його замінить згенероване підземелля, але LevelView/Parallax/Player лишаться ті самі.
 */
import Phaser from 'phaser';
import { CAVE_PARALLAX } from '../config/game';
import { ROOM_LEGEND } from '../config/legend';
import { CAVE_TILESET } from '../config/tilesets';
import { PLAYER_ARMOR_LEVELS } from '../config/assets';
import { InputMap } from '../core/input/InputMap';
import { parseRoom } from '../core/level/grid';
import { LevelView } from '../core/level/LevelView';
import { Parallax } from '../core/level/Parallax';
import { ManifestSprite } from '../entities/ManifestSprite';
import { Player, type PlayerWeapon } from '../entities/Player';
import testCave from '../levels/test-cave.json';
import { ASSET_PROBLEMS_KEY } from './PreloadScene';
import { SCENES } from './keys';

const WEAPONS: PlayerWeapon[] = ['sword', 'axe', 'scepter', 'special'];
/** Захист від «телепорту» після паузи вкладки: довгий кадр рахуємо як 50 мс. */
const MAX_DT_MS = 50;

export class TestCaveScene extends Phaser.Scene {
  private inputMap!: InputMap;
  private player!: Player;
  private level!: LevelView;
  private parallax!: Parallax;
  private spawnPoint = new Phaser.Math.Vector2();
  private debugText!: Phaser.GameObjects.Text;
  private debugOn = false;

  constructor() {
    super(SCENES.testCave);
  }

  create(): void {
    const ts = CAVE_TILESET.tileSize;
    const room = parseRoom(testCave.rows, ROOM_LEGEND);

    this.level = new LevelView(this, room.grid, CAVE_TILESET, testCave.seed).setDepth(0);
    this.parallax = new Parallax(this, CAVE_PARALLAX, this.level.heightPx);
    this.physics.world.setBounds(0, 0, this.level.widthPx, this.level.heightPx);
    this.inputMap = new InputMap(this);

    const props = this.physics.add.group();
    for (const s of room.spawns) {
      // точка появи — низ клітинки по центру (origin спрайтів — під ногами)
      const x = (s.x + 0.5) * ts;
      const y = (s.y + 1) * ts;
      if (s.type === 'player') {
        this.spawnPoint.set(x, y);
        this.player = new Player(this, x, y, this.inputMap);
        this.player.setDepth(10);
      } else if (s.type === 'dummy') {
        const d = new ManifestSprite(this, x, y, 'dummy');
        props.add(d);
        d.setDepth(5).playAnim('idle');
        d.body.setImmovable(true);
      }
    }
    if (!this.player) throw new Error('У рівні немає точки появи гравця (P)');

    this.physics.add.collider(this.player, this.level.collision);
    this.physics.add.collider(props, this.level.collision);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.level.widthPx, this.level.heightPx);
    cam.startFollow(this.player, true, 0.15, 0.15, 0, 12);
    cam.setDeadzone(24, 24);

    this.createHud();
    this.bindDebugKeys();
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, MAX_DT_MS);
    this.inputMap.update();
    this.player.update(dt);
    this.parallax.update();

    // випав за межі світу (на всяк випадок) — повертаємо на старт
    if (this.player.y > this.level.heightPx + 64) this.respawn();

    if (this.debugOn) this.updateDebugText();
  }

  private respawn(): void {
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y);
    this.player.body.reset(this.spawnPoint.x, this.spawnPoint.y);
  }

  private createHud(): void {
    const hint = 'A/D ←/→ — рух   Space/Z — стрибок   H — дебаг   G — галерея асетів';
    this.add
      .text(4, 4, hint, { fontFamily: 'monospace', fontSize: '8px', color: '#d8c3a5' })
      .setScrollFactor(0)
      .setDepth(1000);
    this.debugText = this.add
      .text(4, 16, '', { fontFamily: 'monospace', fontSize: '8px', color: '#9fe0a0', backgroundColor: '#000000aa' })
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
  }

  private bindDebugKeys(): void {
    const kb = this.input.keyboard!;
    kb.on('keydown-H', () => this.toggleDebug());
    kb.on('keydown-G', () => this.scene.start(SCENES.gallery));
    kb.on('keydown-R', () => this.respawn());
    // 1–4: зброя, T: наступний рівень броні — перевірка, що маніфест і варіанти спрайтів працюють
    ['ONE', 'TWO', 'THREE', 'FOUR'].forEach((k, i) => {
      kb.on(`keydown-${k}`, () => this.player.setLoadout(WEAPONS[i]!, this.player.armor));
    });
    kb.on('keydown-T', () => this.player.setLoadout(this.player.weapon, (this.player.armor + 1) % PLAYER_ARMOR_LEVELS));
  }

  private toggleDebug(): void {
    this.debugOn = !this.debugOn;
    const world = this.physics.world;
    if (!world.debugGraphic) world.createDebugGraphic();
    world.drawDebug = this.debugOn;
    world.debugGraphic.setVisible(this.debugOn);
    world.debugGraphic.clear();
    this.level.setCollisionVisible(this.debugOn);
    this.debugText.setVisible(this.debugOn);
  }

  private updateDebugText(): void {
    const p = this.player;
    const b = p.body;
    const problems = (this.registry.get(ASSET_PROBLEMS_KEY) as string[] | undefined) ?? [];
    this.debugText.setText(
      [
        `fps ${this.game.loop.actualFps.toFixed(0)}`,
        `pos ${p.x.toFixed(0)},${p.y.toFixed(0)}  vel ${b.velocity.x.toFixed(0)},${b.velocity.y.toFixed(0)}  ground ${b.blocked.down}`,
        `sprite ${p.key}  anim ${p.anims.isPlaying ? p.anims.currentAnim?.key : '(fallback: тримаємо кадр)'}`,
        `1-4 зброя, T броня (${p.armor}), R — на старт`,
        `проблем з асетами: ${problems.length}`,
      ].join('\n'),
    );
  }
}
