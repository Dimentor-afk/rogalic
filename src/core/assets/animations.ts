/**
 * Реєстрація анімацій Phaser з маніфесту. Викликається один раз після завантаження атласів.
 */
import Phaser from 'phaser';
import { SPRITES } from '../../config/assets';
import { animKey, selectFrames, type AnimName } from './manifest';

/** Повертає список проблем (відсутні атласи/кадри), щоб показати їх у дебаг-оверлеї. */
export function registerAnimations(scene: Phaser.Scene): string[] {
  const problems: string[] = [];
  const frameCache = new Map<string, string[]>();

  for (const [spriteKey, def] of Object.entries(SPRITES)) {
    if (!scene.textures.exists(def.atlas)) {
      problems.push(`${spriteKey}: немає атласу "${def.atlas}"`);
      continue;
    }
    let names = frameCache.get(def.atlas);
    if (!names) {
      names = scene.textures.get(def.atlas).getFrameNames();
      frameCache.set(def.atlas, names);
    }
    for (const [anim, a] of Object.entries(def.anims)) {
      if (!a) continue;
      const key = animKey(spriteKey, anim);
      if (scene.anims.exists(key)) continue;
      const frames = selectFrames(names, a.prefix);
      if (frames.length === 0) {
        problems.push(`${spriteKey}:${anim}: немає кадрів "${a.prefix}*"`);
        continue;
      }
      scene.anims.create({
        key,
        frames: frames.map((frame) => ({ key: def.atlas, frame })),
        frameRate: a.fps,
        repeat: a.loop ? -1 : 0,
      });
    }
  }

  for (const p of problems) console.warn('[assets]', p);
  return problems;
}

export function hasAnim(scene: Phaser.Scene, spriteKey: string, anim: AnimName): boolean {
  return scene.anims.exists(animKey(spriteKey, anim));
}
