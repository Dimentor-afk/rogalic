import { describe, expect, it } from 'vitest';
import { bodyOffset, selectFrames, trailingNumber } from '../src/core/assets/manifest';
import { SPRITES, PLAYER_ARMOR_LEVELS, PLAYER_WEAPON_SPRITES, playerSpriteKey } from '../src/config/assets';
import { readFileSync } from 'node:fs';

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

  it('є спрайти гравця для кожної зброї і кожного рівня броні', () => {
    for (const w of PLAYER_WEAPON_SPRITES)
      for (let d = 0; d < PLAYER_ARMOR_LEVELS; d++) expect(SPRITES[playerSpriteKey(w, d)]).toBeDefined();
  });
});
