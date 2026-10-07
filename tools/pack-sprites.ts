/**
 * Пакувальник спрайтів: збирає окремі PNG / стрічки / шматки тайлсетів з assets-src/
 * в атласи Phaser (PNG + JSON Hash) згідно з tools/pack.config.json.
 *
 * Запуск:  npm run pack            (або: npx tsx tools/pack-sprites.ts --config інший.json)
 * Результат: public/assets/atlases/<atlas>.png|json, public/assets/index.json
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { alphaBounds, blit, createImage, crop, isBlockUniform, rotate, scaleNearest, type RGBAImage } from './pack/image';
import { shelfPack } from './pack/packer';
import { frameName } from './pack/naming';
import type { AtlasConfig, PackConfig, PhaserAtlasJson, SourceEntry } from './pack/types';

// ---------- IO ----------

function readPng(path: string): RGBAImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

function writePng(path: string, img: RGBAImage): void {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || e === '__MACOSX') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/**
 * Знаходить корінь паку. Архіви часто мають «обгортки» (Pack/Pack/…), тому спускаємось,
 * поки тека містить рівно одну підтеку і нічого більше.
 */
function resolvePackRoot(srcRoot: string, folder: string): string {
  let dir = join(srcRoot, folder);
  if (!existsSync(dir)) throw new Error(`Не знайдено пак "${folder}" у ${srcRoot}/. Розпакуй його туди (див. assets-src/README.md).`);
  for (;;) {
    const entries = readdirSync(dir).filter((e) => !e.startsWith('.') && e !== '__MACOSX');
    const only = entries[0];
    if (entries.length === 1 && only !== undefined && statSync(join(dir, only)).isDirectory()) dir = join(dir, only);
    else return dir;
  }
}

// ---------- Збір кадрів ----------

interface Frame {
  name: string;
  img: RGBAImage; // вже обрізаний (trim) кадр
  sourceW: number; // розмір до trim
  sourceH: number;
  offX: number; // зсув обрізаного кадру всередині вихідного
  offY: number;
  extrude: number;
}

interface Ctx {
  cfg: PackConfig;
  packRoots: Map<string, string>;
  warnings: string[];
}

function packPath(ctx: Ctx, pack: string, rel: string): string {
  const root = ctx.packRoots.get(pack);
  if (!root) throw new Error(`Невідомий пак "${pack}" (додай у "packs" конфігу)`);
  return join(root, rel);
}

/** crop → scale → rotate → trim для одного кадру. */
function finishFrame(ctx: Ctx, name: string, raw: RGBAImage, src: SourceEntry, atlas: AtlasConfig): Frame {
  const scale = src.scale ?? atlas.scale ?? 1;
  if (scale < 1 && !isBlockUniform(raw, Math.round(1 / scale))) {
    ctx.warnings.push(`${name}: зменшення x${scale} втрачає пікселі (арт не кратний ${Math.round(1 / scale)})`);
  }
  let img = scaleNearest(raw, scale);
  img = rotate(img, src.rotate ?? 0);
  const sourceW = img.width;
  const sourceH = img.height;
  let offX = 0;
  let offY = 0;
  if (src.trim ?? atlas.trim ?? false) {
    const b = alphaBounds(img);
    if (b) {
      img = crop(img, b);
      offX = b.x;
      offY = b.y;
    } else {
      // повністю прозорий кадр: лишаємо 1×1, щоб анімація не «з'їхала»
      img = createImage(1, 1);
    }
  }
  return { name, img, sourceW, sourceH, offX, offY, extrude: src.extrude ?? atlas.extrude ?? 0 };
}

function collectFrames(ctx: Ctx, atlasName: string, atlas: AtlasConfig): Frame[] {
  const frames: Frame[] = [];
  for (const src of atlas.sources) {
    const before = frames.length;
    if (src.kind === 'frames') {
      const dir = packPath(ctx, src.pack, src.dir);
      const re = new RegExp(src.match);
      for (const file of walk(dir).sort()) {
        const rel = relative(dir, file).split('\\').join('/');
        const m = re.exec(rel);
        if (!m) continue;
        frames.push(finishFrame(ctx, frameName(src.name, m), readPng(file), src, atlas));
      }
    } else if (src.kind === 'strip') {
      const img = readPng(packPath(ctx, src.pack, src.file));
      const count = src.count ?? Math.floor(img.width / src.frameWidth);
      for (let i = 0; i < count; i++) {
        const raw = crop(img, { x: i * src.frameWidth, y: 0, w: src.frameWidth, h: src.frameHeight });
        frames.push(finishFrame(ctx, frameName(src.name, [], i), raw, src, atlas));
      }
    } else {
      const img = readPng(packPath(ctx, src.pack, src.file));
      src.rects.forEach(([col, row, w, h], i) => {
        const raw = crop(img, { x: col * src.cell, y: row * src.cell, w: w * src.cell, h: h * src.cell });
        frames.push(finishFrame(ctx, frameName(src.name, [], i), raw, src, atlas));
      });
    }
    if (frames.length === before) {
      ctx.warnings.push(`[${atlasName}] джерело ${JSON.stringify(src.kind === 'frames' ? src.dir : src.file)} не дало жодного кадру`);
    }
  }
  const seen = new Set<string>();
  for (const f of frames) {
    if (seen.has(f.name)) throw new Error(`[${atlasName}] дубль імені кадру "${f.name}"`);
    seen.add(f.name);
  }
  return frames;
}

// ---------- Атлас ----------

function buildAtlas(ctx: Ctx, name: string, atlas: AtlasConfig, outDir: string): { frames: number; w: number; h: number } {
  const frames = collectFrames(ctx, name, atlas);
  const items = frames.map((f) => ({ id: f.name, w: f.img.width + f.extrude * 2, h: f.img.height + f.extrude * 2 }));
  const packed = shelfPack(items, ctx.cfg.maxWidth, ctx.cfg.padding);
  const sheet = createImage(packed.width, packed.height);

  const json: PhaserAtlasJson = {
    frames: {},
    meta: { app: 'dodep-pack', image: `${name}.png`, format: 'RGBA8888', size: { w: sheet.width, h: sheet.height }, scale: '1' },
  };

  // Кадри в JSON пишемо в порядку імен — так diff атласу в git читабельніший.
  for (const f of [...frames].sort((a, b) => a.name.localeCompare(b.name))) {
    const p = packed.placements.get(f.name)!;
    const x = p.x + f.extrude;
    const y = p.y + f.extrude;
    blit(sheet, f.img, x, y, f.extrude);
    const trimmed = f.img.width !== f.sourceW || f.img.height !== f.sourceH;
    json.frames[f.name] = {
      frame: { x, y, w: f.img.width, h: f.img.height },
      rotated: false,
      trimmed,
      spriteSourceSize: { x: f.offX, y: f.offY, w: f.img.width, h: f.img.height },
      sourceSize: { w: f.sourceW, h: f.sourceH },
    };
  }

  writePng(join(outDir, `${name}.png`), sheet);
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(json, null, 1));
  return { frames: frames.length, w: sheet.width, h: sheet.height };
}

// ---------- main ----------

function main(): void {
  const argi = process.argv.indexOf('--config');
  const cfgPath = resolve(argi > 0 ? process.argv[argi + 1]! : 'tools/pack.config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as PackConfig;

  const ctx: Ctx = { cfg, packRoots: new Map(), warnings: [] };
  for (const [alias, folder] of Object.entries(cfg.packs)) {
    ctx.packRoots.set(alias, resolvePackRoot(cfg.srcRoot, folder));
  }

  const atlasDir = join(cfg.outRoot, 'atlases');
  // Чистимо старі атласи, щоб видалені з конфігу не лишались «привидами».
  rmSync(atlasDir, { recursive: true, force: true });
  mkdirSync(atlasDir, { recursive: true });

  const index = { atlases: [] as string[], images: [] as string[] };
  for (const [name, atlas] of Object.entries(cfg.atlases)) {
    const r = buildAtlas(ctx, name, atlas, atlasDir);
    index.atlases.push(name);
    console.log(`atlas ${name.padEnd(12)} ${String(r.frames).padStart(4)} кадрів  ${r.w}x${r.h}`);
  }

  for (const c of cfg.copy ?? []) {
    const img = scaleNearest(readPng(packPath(ctx, c.pack, c.file)), c.scale ?? 1);
    writePng(join(cfg.outRoot, c.to), img);
    index.images.push(c.to);
    console.log(`image ${c.to}  ${img.width}x${img.height}`);
  }

  writeFileSync(join(cfg.outRoot, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  for (const w of ctx.warnings) console.warn('УВАГА:', w);
  console.log('Готово.');
}

main();
