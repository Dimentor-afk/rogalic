/**
 * Тестова печера — бойовий полігон: рух, бій, вороги всіх архетипів, манекен.
 * Доступна з головного меню («Тренування»). Смерть тут нічого не коштує.
 */
import Phaser from 'phaser';
import { ROOM_LEGEND } from '../config/legend';
import { CAVE_TILESET } from '../config/tilesets';
import { ARMOR_DAMAGE_REDUCTION } from '../config/economy';
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
  /** Підказка тренування: який прийом у руках і скільки шкоди зрізає броня. */
  private loadoutText!: Phaser.GameObjects.Text;

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
    this.loadoutText = this.add
      .text(this.scale.width - 4, 22, '', { fontFamily: 'Tiny5, monospace', fontSize: '8px', color: '#c8c0b4', align: 'right' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.bindKeys();
  }

  update(_time: number, delta: number): void {
    if (this.gameplayUpdate(delta) && this.player.y > this.level.heightPx + 64) this.respawn();
    const p = this.player;
    const armor = Math.round((ARMOR_DAMAGE_REDUCTION[p.loadout.armor] ?? 0) * 100);
    this.loadoutText.setText(`1–4 прийом: ${p.weapon.name}\nT броня: −${armor}% шкоди\nH хітбокси  Esc — меню`);
    if (this.debugOn) this.updateDebugText();
  }

  protected hudExtras(): Partial<HudState> {
    return {
      chips: this.combat.runChips(),
      hint: 'J удар (у стрибку — пікірування)  S присід (на бігу — підкат)  L перекат  K блок  Q фляга',
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
    // 1–4: прийом меча; T: наступний рівень броні (лише характеристика — зменшує шкоду, спрайт той самий)
    ['ONE', 'TWO', 'THREE', 'FOUR'].forEach((k, i) => {
      kb.on(`keydown-${k}`, () => this.player.setLoadout(WEAPON_KEYS[i]!, this.player.loadout.armor));
    });
    kb.on('keydown-T', () => this.player.setLoadout(this.player.loadout.weapon, (this.player.loadout.armor + 1) % ARMOR_DAMAGE_REDUCTION.length));
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
        `стан ${p.stateName}  хітбокс ${b.width}×${b.height}`,
        `R — на старт, G — галерея`,
        `проблем з асетами: ${problems.length}`,
      ].join('\n'),
    );
  }
}
