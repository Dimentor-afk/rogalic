import { describe, expect, it } from 'vitest';
import { bodyOffset, selectFrames, trailingNumber } from '../src/core/assets/manifest';
import { ARMOR_LOOK, SPRITES, PLAYER_SPRITE } from '../src/config/assets';
import { ARMOR_DAMAGE_REDUCTION } from '../src/config/economy';
import { WEAPONS } from '../src/config/weapons';
import { readFileSync } from 'node:fs';
import { CAVE_TILESET } from '../src/config/tilesets';

describe('manifest helpers', () => {
  it('selectFrames: тільки кадри з префіксом + число, у числовому порядку', () => {
    const names = ['a/walk/10', 'a/walk/2', 'a/walk/0', 'a/walking/1', 'a/walk/x', 'b/walk/1'];
    expect(selectFrames(names, 'a/walk/')).toEqual(['a/walk/0', 'a/walk/2', 'a/walk/10']);
  });

  it('trailingNumber', () => {
    expect(trailingNumber('x/y/12')).toBe(12);
    expect(trailingNumber('none')).toBe(0);
  });

  it('bodyOffset: хітбокс по центру, низ на bottomPad над низом кадру', () => {
    expect(bodyOffset({ w: 12, h: 28, bottomPad: 2 }, 80, 80)).toEqual({ x: 34, y: 50 });
  });
});

describe('asset manifest vs запаковані атласи', () => {
  // Перевіряє, що кожна анімація маніфесту знаходить кадри у public/assets/atlases/*.json.
  // Падає, якщо після зміни pack.config.json забули оновити маніфест (або навпаки).
  const atlasFrames = new Map<string, string[]>();
  const framesOf = (atlas: string) => {
    if (!atlasFrames.has(atlas)) {
      const json = JSON.parse(readFileSync(`public/assets/atlases/${atlas}.json`, 'utf8')) as { frames: Record<string, unknown> };
      atlasFrames.set(atlas, Object.keys(json.frames));
    }
    return atlasFrames.get(atlas)!;
  };

  for (const [key, def] of Object.entries(SPRITES)) {
    it(`${key}: усі анімації мають кадри`, () => {
      for (const [anim, a] of Object.entries(def.anims)) {
        expect(selectFrames(framesOf(def.atlas), a!.prefix).length, `${key}:${anim}`).toBeGreaterThan(0);
      }
    });
  }

  it('у лицаря є анімація атаки для кожної зброї (прийому)', () => {
    const def = SPRITES[PLAYER_SPRITE]!;
    for (const w of Object.values(WEAPONS)) expect(def.anims[w.anim], w.id).toBeDefined();
  });
});

describe('тайлсет vs запакований атлас', () => {
  it('усі кадри CAVE_TILESET є в атласі', () => {
    const json = JSON.parse(readFileSync(`public/assets/atlases/${CAVE_TILESET.atlas}.json`, 'utf8')) as { frames: Record<string, unknown> };
    const t = CAVE_TILESET;
    const used = [
      ...Object.values(t.solid).flat(),
      ...(t.decor ?? []).flatMap((d) => d.pieces),
      ...(t.plank ? [...t.plank.left, ...t.plank.mid, ...t.plank.right] : []),
    ].map((p) => p.frame);
    used.push(...(t.scaffold?.frames ?? []));
    const missing = used.filter((f) => !(f in json.frames));
    expect(missing).toEqual([]);
  });
});

describe('вигляд броні', () => {
  it('для кожного рівня броні є колір лат', () => {
    expect(ARMOR_LOOK.length).toBe(ARMOR_DAMAGE_REDUCTION.length);
    expect(ARMOR_LOOK[0]!.amount).toBe(0);
    for (const l of ARMOR_LOOK.slice(1)) expect(l.amount).toBeGreaterThan(0);
  });
});
