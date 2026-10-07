/**
 * ASSET MANIFEST — які спрайти є в грі, з якого атласу, які в них анімації і хітбокси.
 *
 * Як додати нового ворога/боса:
 *   1. Покласти пак у assets-src/ і додати джерело в tools/pack.config.json → `npm run pack`.
 *   2. Додати сюди запис SpriteDef з префіксами кадрів.
 *   3. (з M2+) Додати запис у конфіг ворогів з посиланням на ключ спрайта.
 * Код гри при цьому не змінюється. Відсутні анімації (напр. немає "attack") — замінюються fallback-ефектами.
 */
import type { AnimDef, SpriteDef, SpriteManifest } from '../core/assets/manifest';

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

  return m;
}

export const SPRITES: SpriteManifest = buildManifest();
