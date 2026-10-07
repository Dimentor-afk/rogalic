import { describe, expect, it } from 'vitest';
import { alphaBounds, blit, createImage, crop, isBlockUniform, rotate, scaleNearest, type RGBAImage } from '../tools/pack/image';

/** Зображення w×h, де піксель (x,y) має R = x, G = y, A = 255 — легко перевіряти, куди що переїхало. */
function coords(w: number, h: number): RGBAImage {
  const img = createImage(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = x;
      img.data[i + 1] = y;
      img.data[i + 3] = 255;
    }
  return img;
}
const px = (img: RGBAImage, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

describe('image', () => {
  it('crop копіює потрібну область', () => {
    const c = crop(coords(4, 4), { x: 1, y: 2, w: 2, h: 2 });
    expect(c.width).toBe(2);
    expect(px(c, 0, 0)).toEqual([1, 2, 0, 255]);
    expect(px(c, 1, 1)).toEqual([2, 3, 0, 255]);
  });

  it('crop за межами — помилка', () => {
    expect(() => crop(coords(2, 2), { x: 1, y: 1, w: 2, h: 2 })).toThrow();
  });

  it('scaleNearest 0.5 бере кожен 2-й піксель, 2 — дублює', () => {
    const d = scaleNearest(coords(4, 4), 0.5);
    expect([d.width, d.height]).toEqual([2, 2]);
    expect(px(d, 1, 1)).toEqual([2, 2, 0, 255]);
    const u = scaleNearest(coords(2, 2), 2);
    expect([u.width, u.height]).toEqual([4, 4]);
    expect(px(u, 3, 2)).toEqual([1, 1, 0, 255]);
    expect(() => scaleNearest(coords(2, 2), 0.3)).toThrow();
  });

  it('isBlockUniform розпізнає арт, збільшений у k разів', () => {
    expect(isBlockUniform(scaleNearest(coords(3, 3), 4), 4)).toBe(true);
    expect(isBlockUniform(coords(4, 4), 2)).toBe(false);
  });

  it('rotate 90: верх стає правим боком', () => {
    const r = rotate(coords(2, 3), 90); // 2×3 → 3×2
    expect([r.width, r.height]).toEqual([3, 2]);
    // лівий верхній піксель (0,0) → правий верхній
    expect(px(r, 2, 0)).toEqual([0, 0, 0, 255]);
    // лівий нижній (0,2) → лівий верхній
    expect(px(r, 0, 0)).toEqual([0, 2, 0, 255]);
  });

  it('rotate 270 — обернений до 90', () => {
    const src = coords(3, 5);
    expect(rotate(rotate(src, 90), 270)).toEqual(src);
    expect(rotate(rotate(src, 180), 180)).toEqual(src);
  });

  it('alphaBounds знаходить непрозору частину', () => {
    const img = createImage(10, 10);
    img.data[(3 * 10 + 2) * 4 + 3] = 255;
    img.data[(6 * 10 + 7) * 4 + 3] = 1;
    expect(alphaBounds(img)).toEqual({ x: 2, y: 3, w: 6, h: 4 });
    expect(alphaBounds(createImage(4, 4))).toBeNull();
  });

  it('blit з extrude розтягує крайні пікселі', () => {
    const dst = createImage(4, 4);
    blit(dst, coords(2, 2), 1, 1, 1);
    expect(px(dst, 0, 0)).toEqual([0, 0, 0, 255]); // кут розтягнуто з (0,0)
    expect(px(dst, 3, 1)).toEqual([1, 0, 0, 255]); // правий край — копія (1,0)
    expect(px(dst, 2, 2)).toEqual([1, 1, 0, 255]);
  });
});
