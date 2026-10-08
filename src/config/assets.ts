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

/**
 * Гравець — лицар «2D SL Knight» (кадри 128×64, лицар по центру, ноги на нижньому краї кадру).
 * Броня і зброя на спрайті не змінюються (у паку один лицар з мечем) — рівень броні впливає лише на шкоду,
 * а різна «зброя» — це різні прийоми того самого меча (власна анімація атаки для кожного).
 */
export const PLAYER_SPRITE = 'player';

/** Хітбокс лицаря: 2.75 тайла заввишки (майже до гребеня шолома; прохід 3 тайли) (у присіді — нижчий, див. Player). */
export const PLAYER_BODY: BodyDef = { w: 14, h: 44, bottomPad: 0, offsetX: -2 };

/**
 * Вигляд лат за рівнем броні (0 — рідна сталь пака): колір, у який шейдер перефарбовує сталеві пікселі,
 * і сила перефарбування. Окремих спрайтів броні в паку лицаря немає — див. src/core/fx/ArmorPipeline.ts.
 */
export const ARMOR_LOOK: readonly { name: string; color: readonly [number, number, number]; amount: number }[] = [
  { name: 'сталь', color: [1, 1, 1], amount: 0 },
  { name: 'полірована сталь', color: [0.8, 0.92, 1.12], amount: 0.6 },
  { name: 'воронована сталь', color: [0.5, 0.62, 1.0], amount: 0.85 },
  { name: 'бронза', color: [0.95, 0.6, 0.34], amount: 0.85 },
  { name: 'золото', color: [1.2, 0.95, 0.42], amount: 0.95 },
];

function buildManifest(): SpriteManifest {
  const m: SpriteManifest = {};

  const a = (name: string, fps: number, loop = false): AnimDef => ({ prefix: `player/${name}/`, fps, loop });
  m[PLAYER_SPRITE] = {
    atlas: 'player',
    body: PLAYER_BODY,
    anims: {
      idle: a('idle', 8, true),
      walk: a('walk', 12, true),
      jump: a('jump', 10),
      fall: a('fall', 10, true),
      roll: a('roll', 14),
      hurt: a('hurt', 12),
      death: a('death', 8),
      heal: a('heal', 10),
      pray: a('pray', 10),
      crouch: a('crouch', 8, true),
      crouch_attack: a('crouch_attack', 16),
      air_attack: a('air_attack', 14),
      climb: a('climb', 12),
      hang: a('hang', 8, true),
      slide: a('slide', 14),
      attack_sword: a('attack_sword', 14),
      attack_axe: a('attack_axe', 14),
      attack_wave: a('attack_wave', 14),
      attack_thrust: a('attack_thrust', 14),
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
  for (const c of ['black', 'purple', 'brown', 'aqua']) {
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

  // ---------- боси ----------
  const boss = (base: string, anims: Record<string, [string, number, boolean?]>, body: BodyDef): SpriteDef => ({
    atlas: 'bosses',
    body,
    anims: Object.fromEntries(Object.entries(anims).map(([k, [dir, fps, loop]]) => [k, { prefix: `boss/${base}/${dir}/`, fps, loop }])),
  });
  m['boss_goblin_king'] = boss('goblin_king', { walk: ['walk', 8, true], death: ['death', 6] }, { w: 30, h: 62, bottomPad: 2, offsetX: 4 });
  m['boss_slime_king'] = boss('slime_king', { walk: ['walk', 6, true], death: ['death', 6] }, { w: 110, h: 64, bottomPad: 6 });
  m['boss_skeleton_king'] = boss('skeleton_king', { walk: ['walk', 8, true], death: ['death', 6] }, { w: 80, h: 70, bottomPad: 24, offsetX: -3 });
  m['boss_dungeon_master'] = boss('dungeon_master', { walk: ['walk', 7, true], death: ['death', 8] }, { w: 26, h: 66, bottomPad: 2, offsetX: -1 });
  m['boss_archdemon'] = boss(
    'archdemon',
    { idle: ['idle', 8, true], walk: ['idle', 10, true], attack: ['attack', 30], hurt: ['hurt', 12], death: ['death', 10] },
    { w: 24, h: 54, bottomPad: 48, offsetX: -1 },
  );

  return m;
}

export const SPRITES: SpriteManifest = buildManifest();

/**
 * Одноразові ефекти (іскри удару, дим, монети…): ключ → кадри атласу.
 * Анімація реєструється як "fx:<ключ>".
 */
/** FX, яких немає в паках: малюються кодом-заглушкою (src/core/assets/placeholders.ts), ключ FX → текстура. */
export const PLACEHOLDER_FX: Record<string, string> = { casinoChip: 'ph/chip', boneShard: 'ph/bone' };

export const FX: Record<string, { atlas: string; prefix: string; fps: number; facesLeft?: boolean; loop?: boolean }> = {
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
  slashWave: { atlas: 'player', prefix: 'fx/slash_wave/', fps: 1 },
  waterBall: { atlas: 'fx', prefix: 'fx/water_ball/', fps: 14, loop: true },
  fireball: { atlas: 'enemies', prefix: 'flydemon/projectile/', fps: 1, facesLeft: true },
  // снаряди і вибухи босів
  goblinBolt: { atlas: 'bosses', prefix: 'bossfx/goblin_king/projectile/', fps: 12 },
  goblinBlast: { atlas: 'bosses', prefix: 'bossfx/goblin_king/blast/', fps: 16 },
  masterBoltGreen: { atlas: 'bosses', prefix: 'bossfx/dungeon_master0/projectile/', fps: 12 },
  masterBoltBlue: { atlas: 'bosses', prefix: 'bossfx/dungeon_master1/projectile/', fps: 12 },
  masterBoltRed: { atlas: 'bosses', prefix: 'bossfx/dungeon_master2/projectile/', fps: 12 },
  masterBlast: { atlas: 'bosses', prefix: 'bossfx/dungeon_master0/blast/', fps: 16 },
  // магічні ефекти (Foozle, CC0): шипи з-під землі, каміння, портал, вогняна куля
  earthSpike: { atlas: 'fx', prefix: 'fx/earth_spike/rise/', fps: 14 },
  earthSpikeDeath: { atlas: 'fx', prefix: 'fx/earth_spike/fall/', fps: 12 },
  rockFall: { atlas: 'fx', prefix: 'fx/rocks/fly/', fps: 10, loop: true },
  rockBreak: { atlas: 'fx', prefix: 'fx/rocks/break/', fps: 14 },
  portal: { atlas: 'fx', prefix: 'fx/portal/swirl/', fps: 14, loop: true },
  portalBurst: { atlas: 'fx', prefix: 'fx/portal/burst/', fps: 16 },
  demonFire: { atlas: 'fx', prefix: 'fx/fire_ball/', fps: 14, loop: true },
  // перешкоди на арені
  slimePuddle: { atlas: 'bosses', prefix: 'boss/slime_king/obstacle/', fps: 8, loop: true },
  slimePuddleDeath: { atlas: 'bosses', prefix: 'boss/slime_king/obstacle_death/', fps: 10 },
  bonePillar: { atlas: 'bosses', prefix: 'boss/skeleton_king/obstacle/', fps: 8, loop: true },
  bonePillarDeath: { atlas: 'bosses', prefix: 'boss/skeleton_king/obstacle_death/', fps: 10 },
  // зациклені анімації пропів
  doorClosed: { atlas: 'props', prefix: 'door/door/closed/', fps: 6, loop: true },
  deepDoor: { atlas: 'props', prefix: 'door/dungeon_master_door/closed/', fps: 6, loop: true },
  blacksmith: { atlas: 'props', prefix: 'blacksmith/idle/', fps: 8, loop: true },
};
