/**
 * Тестова печера — бойовий полігон: рух, бій, вороги всіх архетипів, манекен.
 * Доступна з головного меню («Тренування»). Смерть тут нічого не коштує.
 */
import Phaser from 'phaser';
import { ROOM_LEGEND } from '../config/legend';
import { CAVE_TILESET } from '../config/tilesets';
import { PLAYER_ARMOR_LEVELS } from '../config/assets';
import { TEXTS, pick } from '../config/texts';
import type { WeaponId } from '../config/weapons';
import { parseRoom } from '../core/level/grid';
import testCave from '../levels/test-cave.json';
import { COLORS } from '../ui/text';
import { GameplayScene } from './GameplayScene';
import type { HudState } from './HudScene';
import { ASSET_PROBLEMS_KEY } from './PreloadScene';
import { SCENES } from './keys';

const WEAPON_KEYS: WeaponId[] = ['sword', 'axe', 'scepter', 'special'];

export class TestCaveScene extends GameplayScene {
  private spawnPoint = new Phaser.Math.Vector2();
  private debugText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.testCave);
  }

  create(): void {
    const ts = CAVE_TILESET.tileSize;
    const room = parseRoom(testCave.rows, ROOM_LEGEND);
    this.buildWorld(room.grid, testCave.seed, { onPlayerDeath: () => this.onPlayerDeath() });

    for (const s of room.spawns) {
      const x = (s.x + 0.5) * ts;
      const y = (s.y + 1) * ts;
      if (s.type === 'player') {
        this.spawnPoint.set(x, y);
        this.createPlayer(x, y);
      } else if (s.type.startsWith('enemy:')) {
        this.combat.spawnEnemy(s.type.slice(6), x, y, 1);
      }
    }
    if (!this.player) throw new Error('У рівні немає точки появи гравця (P)');

    this.debugText = this.add
      .text(4, 60, '', { fontFamily: 'Tiny5, monospace', fontSize: '8px', color: '#9fe0a0', backgroundColor: '#000000aa' })
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.bindKeys();
  }

  update(_time: number, delta: number): void {
    if (this.gameplayUpdate(delta) && this.player.y > this.level.heightPx + 64) this.respawn();
    if (this.debugOn) this.updateDebugText();
  }

  protected hudExtras(): Partial<HudState> {
    return {
      chips: this.combat.runChips(),
      hint: 'J атака  L/Shift перекат  K блок (вчасно — паріру)  Q фляга  Esc — меню',
    };
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

  private bindKeys(): void {
    const kb = this.input.keyboard!;
    kb.on('keydown-G', () => this.scene.start(SCENES.gallery));
    kb.on('keydown-R', () => this.respawn());
    kb.on('keydown-ESC', () => this.fadeTo(SCENES.menu));
    // 1–4: зброя, T: наступний рівень броні — перевірка мувсетів і варіантів спрайтів
    ['ONE', 'TWO', 'THREE', 'FOUR'].forEach((k, i) => {
      kb.on(`keydown-${k}`, () => this.player.setLoadout(WEAPON_KEYS[i]!, this.player.loadout.armor));
    });
    kb.on('keydown-T', () => this.player.setLoadout(this.player.loadout.weapon, (this.player.loadout.armor + 1) % PLAYER_ARMOR_LEVELS));
  }

  protected override toggleDebug(): void {
    super.toggleDebug();
    this.debugText?.setVisible(this.debugOn);
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
        `1-4 зброя, T броня (${p.loadout.armor}), R — на старт, G — галерея`,
        `проблем з асетами: ${problems.length}`,
      ].join('\n'),
    );
  }
}
