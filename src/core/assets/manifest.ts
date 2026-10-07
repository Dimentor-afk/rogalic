/**
 * Типи asset manifest. Сам маніфест (дані) — у src/config/assets.ts.
 *
 * Маніфест зв'язує «логічний» спрайт (гравець, ворог, бос, символ слота) з атласом і анімаціями.
 * Код гри знає тільки ключ спрайта і назву анімації ("idle", "attack"…), а не конкретні файли.
 * Якщо анімації немає в маніфесті (типово для сторонніх паків) — гра використовує fallback-ефект кодом.
 */

/** Стандартні назви анімацій. Можна додавати свої — це просто рядки. */
export type AnimName = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'attack' | 'hurt' | 'death' | 'roll' | 'block' | (string & {});

export interface AnimDef {
  /** Префікс імен кадрів в атласі, напр. "player/sword/d0/idle/". Кадри сортуються за числовим суфіксом. */
  prefix: string;
  fps: number;
  loop?: boolean;
}

/**
 * Хітбокс. Розташовується по центру кадру по горизонталі (тому flipX нічого не ламає),
 * нижній край — на bottomPad px вище низу кадру (де стоять «ноги»).
 */
export interface BodyDef {
  w: number;
  h: number;
  bottomPad?: number;
  /** Зсув центру хітбокса від центру кадру по X (для персонажів, намальованих не по центру). */
  offsetX?: number;
}

export interface SpriteDef {
  atlas: string;
  body: BodyDef;
  anims: Partial<Record<AnimName, AnimDef>>;
  /** Спрайт намальований обличчям вліво (більшість паків — вправо). */
  facesLeft?: boolean;
}

export type SpriteManifest = Record<string, SpriteDef>;

/** Ключ анімації в Phaser: "<спрайт>:<анімація>". */
export function animKey(spriteKey: string, anim: AnimName): string {
  return `${spriteKey}:${anim}`;
}

/** Числовий суфікс кадру ("…/walk/12" → 12) — щоб 2 йшло перед 10. */
export function trailingNumber(name: string): number {
  const m = /(\d+)$/.exec(name);
  return m ? Number(m[1]) : 0;
}

/** Вибирає з усіх кадрів атласу кадри анімації за префіксом, у правильному порядку. */
export function selectFrames(frameNames: readonly string[], prefix: string): string[] {
  return frameNames
    .filter((n) => n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length)))
    .sort((a, b) => trailingNumber(a) - trailingNumber(b));
}

/**
 * Зсув хітбокса відносно лівого верхнього кута кадру frameW×frameH.
 * mirrored — спрайт віддзеркалений (flipX): горизонтальний зсув offsetX теж дзеркалиться.
 */
export function bodyOffset(body: BodyDef, frameW: number, frameH: number, mirrored = false): { x: number; y: number } {
  const shift = (body.offsetX ?? 0) * (mirrored ? -1 : 1);
  return {
    x: Math.round((frameW - body.w) / 2 + shift),
    y: frameH - (body.bottomPad ?? 0) - body.h,
  };
}
