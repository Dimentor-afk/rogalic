/**
 * ASSET MANIFEST — які спрайти є в грі, з якого атласу, які в них анімації і хітбокси.
 *
 * Як додати нового ворога/боса:
 *   1. Покласти пак у assets-src/ і додати джерело в tools/pack.config.json → `npm run pack`.
 *   2. Додати сюди запис SpriteDef з префіксами кадрів.
 *   3. (з M2+) Додати запис у конфіг ворогів з посиланням на ключ спрайта.
 * Код гри при цьому не змінюється. Відсутні анімації (напр. немає "attack") — замінюються fallback-ефектами.
 */
import type { AnimDef, BodyDef, SpriteDef, SpriteManifest } from '../core/assets/manifest';

/** Види зброї гравця, для яких у паку є спрайти (з рівнями броні 0..4). */
export const PLAYER_WEAPON_SPRITES = ['sword', 'axe', 'scepter'] as const;
export type PlayerWeaponSprite = (typeof PLAYER_WEAPON_SPRITES)[number];
export const PLAYER_ARMOR_LEVELS = 5;

/** Ключ спрайта гравця для зброї і рівня броні: "player.sword.d2". */
export function playerSpriteKey(weapon: PlayerWeaponSprite, armor: number): string {
  return `player.${weapon}.d${armor}`;
}

// Хітбокс гравця однаковий для всіх варіантів (кадри 80×80 після зменшення паку в 2 рази).
const PLAYER_BODY = { w: 12, h: 28, bottomPad: 2 };

function playerSprite(weapon: PlayerWeaponSprite, armor: number): SpriteDef {
  const p = `player/${weapon}/d${armor}/`;
  const anims: Record<string, AnimDef> = {
    idle: { prefix: `${p}idle/`, fps: 6, loop: true },
    walk: { prefix: `${p}walk/`, fps: 10, loop: true },
    attack: { prefix: `${p}attack/`, fps: 14 },
    // анімація смерті в паку одна на зброю, без варіантів броні
    death: { prefix: `player/${weapon}/death/`, fps: 8 },
  };
  return { atlas: 'player', body: PLAYER_BODY, anims };
}

function buildManifest(): SpriteManifest {
  const m: SpriteManifest = {};

  for (const w of PLAYER_WEAPON_SPRITES) {
    for (let d = 0; d < PLAYER_ARMOR_LEVELS; d++) m[playerSpriteKey(w, d)] = playerSprite(w, d);
  }

  m['player.special'] = {
    atlas: 'player',
    body: PLAYER_BODY,
    anims: {
      idle: { prefix: 'player/special/idle/', fps: 6, loop: true },
      walk: { prefix: 'player/special/walk/', fps: 10, loop: true },
      attack: { prefix: 'player/special/attack/', fps: 14 },
      death: { prefix: 'player/special/death/', fps: 8 },
    },
  };

  // Тренувальний манекен (стрічки 80×48). Немає "walk"/"attack" — для перевірки fallback-логіки.
  m['dummy'] = {
    atlas: 'enemies',
    body: { w: 14, h: 36, bottomPad: 4 },
    anims: {
      idle: { prefix: 'dummy/idle/', fps: 1, loop: true },
      hurt: { prefix: 'dummy/hit/', fps: 14 },
      death: { prefix: 'dummy/death/', fps: 12 },
    },
  };

  // ---------- вороги ----------
  // anims: назва → [папка кадрів у атласі, fps, loop?]. Відсутні анімації не перелічуємо — їх замінить fallback.
  const enemy = (base: string, anims: Record<string, [string, number, boolean?]>, body: BodyDef, facesLeft = false): SpriteDef => ({
    atlas: 'enemies',
    body,
    facesLeft,
    anims: Object.fromEntries(Object.entries(anims).map(([k, [dir, fps, loop]]) => [k, { prefix: `${base}/${dir}/`, fps, loop }])),
  });

  // базовий пак: лише ходьба і смерть → атака/удар/idle через fallback
  for (const v of [0, 1]) {
    m[`goblin${v}`] = enemy(`goblin${v}`, { walk: ['walk', 10, true], death: ['death', 10] }, { w: 12, h: 22, bottomPad: 1, offsetX: 3 });
    m[`skeleton${v}`] = enemy(`skeleton${v}`, { walk: ['walk', 8, true], death: ['death', 10] }, { w: 14, h: 30, bottomPad: 1, offsetX: 1 });
    m[`slime${v}`] = enemy(`slime${v}`, { walk: ['walk', 8, true], death: ['death', 10] }, { w: 30, h: v ? 22 : 16, bottomPad: 0, offsetX: -5 });
  }
  for (const c of ['blue', 'orange']) {
    m[`golem_${c}`] = enemy(
      `golem_${c}`,
      { idle: ['idle', 8, true], walk: ['walk', 9, true], attack: ['attack', 12], hurt: ['hurt', 12], death: ['death', 12] },
      { w: 26, h: 36, bottomPad: 0, offsetX: 1 },
    );
  }
  m['flydemon'] = enemy(
    'flydemon',
    { idle: ['idle', 8, true], walk: ['walk', 10, true], attack: ['attack', 12], hurt: ['hurt', 10], death: ['death', 10] },
    { w: 30, h: 34, bottomPad: 12 },
    true,
  );
  m['cat'] = enemy(
    'cat',
    { idle: ['idle', 8, true], walk: ['walk', 12, true], run: ['run', 14, true], jump: ['jump', 10], attack: ['attack', 16], hurt: ['hurt', 12] },
    { w: 18, h: 18, bottomPad: 16 },
    true,
  );
  for (const c of ['black', 'purple']) {
    m[`spider_${c}`] = enemy(
      `spider_${c}`,
      { idle: ['sleep', 6, true], walk: ['walk', 10, true], attack: ['attack', 12], hurt: ['hurt', 12], death: ['death', 10] },
      { w: 30, h: 18, bottomPad: 0, offsetX: 4 },
      true,
    );
  }
  for (const k of ['imp', 'bloodling']) {
    m[k] = enemy(
      k,
      { idle: ['idle', 8, true], walk: ['walk', 10, true], attack: ['attack', 12], hurt: ['hurt', 12], death: ['death', 10] },
      { w: 12, h: 16, bottomPad: 41, offsetX: 3 },
    );
  }

  return m;
}

export const SPRITES: SpriteManifest = buildManifest();

/**
 * Одноразові ефекти (іскри удару, дим, монети…): ключ → кадри атласу.
 * Анімація реєструється як "fx:<ключ>".
 */
export const FX: Record<string, { atlas: string; prefix: string; fps: number; facesLeft?: boolean }> = {
  impact: { atlas: 'fx', prefix: 'fx/impact/', fps: 24 },
  impactCrit: { atlas: 'fx', prefix: 'fx/impact_crit/', fps: 20 },
  parry: { atlas: 'fx', prefix: 'fx/parry/', fps: 18 },
  smoke: { atlas: 'fx', prefix: 'fx/smoke/', fps: 20 },
  coins: { atlas: 'fx', prefix: 'fx/coins/', fps: 30 },
  sparkle: { atlas: 'fx', prefix: 'fx/sparkle/', fps: 24 },
  firework: { atlas: 'fx', prefix: 'fx/firework/', fps: 20 },
  alert: { atlas: 'fx', prefix: 'fx/alert/', fps: 28 },
  splatter: { atlas: 'fx', prefix: 'fx/splatter/', fps: 24 },
  explosion: { atlas: 'fx', prefix: 'fx/explosion/', fps: 20 },
  heal: { atlas: 'fx', prefix: 'fx/heal/', fps: 24 },
  scepterBolt: { atlas: 'player', prefix: 'fx/scepter_projectile/', fps: 14 },
  scepterBlast: { atlas: 'player', prefix: 'fx/scepter_blast/', fps: 16 },
  fireball: { atlas: 'enemies', prefix: 'flydemon/projectile/', fps: 1, facesLeft: true },
};
