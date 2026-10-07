/**
 * Схема конфігу пакувальника (tools/pack.config.json).
 * Конфіг описує, які сирі PNG з assets-src/ потрапляють у які атласи і під якими іменами кадрів.
 */

export type Rotation = 0 | 90 | 180 | 270;

interface SourceBase {
  /** Аліас паку з PackConfig.packs (тека в assets-src/). */
  pack: string;
  /** Перевизначає scale атласу для цього джерела. */
  scale?: number;
  /** Обрізати прозорі краї кадрів (Phaser сам відновить вихідний розмір). */
  trim?: boolean;
  /** На скільки пікселів «розтягнути» краї кадру в атласі (для тайлів). */
  extrude?: number;
  /** Повернути кадр за годинниковою стрілкою. */
  rotate?: Rotation;
}

/**
 * Окремі PNG-файли (по файлу на кадр). Кожен файл у `dir` перевіряється регуляркою `match`
 * (шлях відносно dir, через «/»), ім'я кадру будується з шаблону `name` з групами $1..$9.
 */
export interface FramesSource extends SourceBase {
  kind: 'frames';
  dir: string;
  match: string;
  name: string;
}

/** Горизонтальна стрічка кадрів в одному PNG. `{i}` у name — номер кадру. */
export interface StripSource extends SourceBase {
  kind: 'strip';
  file: string;
  frameWidth: number;
  frameHeight: number;
  name: string;
  /** Скільки кадрів брати (за замовчуванням — усі, що влазять). */
  count?: number;
}

/**
 * Прямокутні шматки з тайлсету за сіткою `cell` px.
 * rects: [колонка, рядок, ширина в клітинках, висота в клітинках]. `{i}` у name — номер шматка.
 */
export interface CellsSource extends SourceBase {
  kind: 'cells';
  file: string;
  cell: number;
  name: string;
  rects: [number, number, number, number][];
}

export type SourceEntry = FramesSource | StripSource | CellsSource;

export interface AtlasConfig {
  scale?: number;
  trim?: boolean;
  extrude?: number;
  sources: SourceEntry[];
}

/** Велике зображення, яке не пакуємо в атлас, а просто копіюємо (фони). */
export interface CopyEntry {
  pack: string;
  file: string;
  /** Шлях відносно outRoot. */
  to: string;
  scale?: number;
}

export interface PackConfig {
  srcRoot: string;
  /** Куди класти результат (атласи — у outRoot/atlases). */
  outRoot: string;
  maxWidth: number;
  padding: number;
  packs: Record<string, string>;
  atlases: Record<string, AtlasConfig>;
  copy?: CopyEntry[];
}

/** Формат Phaser «JSON Hash» (той самий, що генерує TexturePacker). */
export interface PhaserAtlasJson {
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number };
      rotated: false;
      trimmed: boolean;
      spriteSourceSize: { x: number; y: number; w: number; h: number };
      sourceSize: { w: number; h: number };
    }
  >;
  meta: { app: string; image: string; format: 'RGBA8888'; size: { w: number; h: number }; scale: '1' };
}
