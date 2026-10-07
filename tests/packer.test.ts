import { describe, expect, it } from 'vitest';
import { shelfPack, type PackItem } from '../tools/pack/packer';
import { frameName } from '../tools/pack/naming';

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('shelfPack', () => {
  it('кладе всі кадри без перетинів і в межах атласу', () => {
    const items: PackItem[] = Array.from({ length: 60 }, (_, i) => ({ id: `f${i}`, w: 5 + ((i * 7) % 30), h: 4 + ((i * 13) % 25) }));
    const r = shelfPack(items, 128, 2);
    const rects = items.map((it) => ({ ...r.placements.get(it.id)!, w: it.w, h: it.h }));
    expect(rects).toHaveLength(60);
    for (const a of rects) {
      expect(a.x + a.w).toBeLessThanOrEqual(r.width);
      expect(a.y + a.h).toBeLessThanOrEqual(r.height);
      expect(r.width).toBeLessThanOrEqual(128);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
  });

  it('тримає відступ padding між кадрами', () => {
    const r = shelfPack([{ id: 'a', w: 10, h: 10 }, { id: 'b', w: 10, h: 10 }], 100, 3);
    const a = r.placements.get('a')!;
    const b = r.placements.get('b')!;
    expect(Math.abs(b.x - a.x)).toBe(13);
  });

  it('занадто широкий кадр — помилка', () => {
    expect(() => shelfPack([{ id: 'big', w: 200, h: 1 }], 100, 0)).toThrow(/big/);
  });

  it('детермінований: однаковий вхід — однаковий атлас', () => {
    const items = [{ id: 'x', w: 3, h: 9 }, { id: 'y', w: 9, h: 3 }, { id: 'z', w: 9, h: 9 }];
    expect(shelfPack(items, 16, 1)).toEqual(shelfPack([...items].reverse(), 16, 1));
  });
});

describe('frameName', () => {
  it('підставляє групи регулярки і {i}, приводить до нижнього регістру', () => {
    const m = /^(\w+)\/Defence(\d)\/Player_(\w+?)_\w+_(\d+)\.png$/.exec('Sword/Defence2/Player_Idle_Sword_Defence2_3.png')!;
    expect(frameName('player/$1/d$2/$3/$4', m)).toBe('player/sword/d2/idle/3');
    expect(frameName('Dummy Hit/{i}', [], 5)).toBe('dummy_hit/5');
    expect(() => frameName('$3', ['a'])).toThrow();
  });
});
