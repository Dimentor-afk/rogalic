/**
 * ТЕМП ПОКАЗУ СЛОТА: звичайний і турбо. Турбо прискорює лише анімацію і паузи —
 * результат спіна вже пораховано до анімації, тож RNG і RTP від темпу не залежать.
 */
import { SLOT } from '../../config/slot';

export interface SlotTempo {
  /** Барабани: тривалість першого, затримка кожного наступного, додаток near-miss на барабан (мс). */
  reelMs: number;
  staggerMs: number;
  nearMissMs: number;
  /** Лічильник виграшу: база + мс на фішку, але не довше max. */
  countUpBaseMs: number;
  countUpPerChipMs: number;
  countUpMaxMs: number;
  /** Пауза перед наступним автоспіном: без виграшу / з виграшем / з великим виграшем. */
  autoPauseMs: number;
  autoPauseWinMs: number;
  autoPauseBigMs: number;
  /** Затримка напису про прокляття і переходу в бонуску. */
  curseMsgMs: number;
  bonusDelayMs: number;
}

export const NORMAL_TEMPO: SlotTempo = {
  reelMs: 700,
  staggerMs: 180,
  nearMissMs: SLOT.nearMiss.extraMs,
  countUpBaseMs: 200,
  countUpPerChipMs: 4,
  countUpMaxMs: 1200,
  autoPauseMs: 350,
  autoPauseWinMs: 900,
  autoPauseBigMs: 1500,
  curseMsgMs: 400,
  bonusDelayMs: 1600,
};

/** Турбо ≈ утричі швидше; near-miss лишає коротку «напругу». */
export const TURBO_TEMPO: SlotTempo = {
  reelMs: 230,
  staggerMs: 60,
  nearMissMs: 300,
  countUpBaseMs: 70,
  countUpPerChipMs: 1.3,
  countUpMaxMs: 400,
  autoPauseMs: 120,
  autoPauseWinMs: 350,
  autoPauseBigMs: 700,
  curseMsgMs: 150,
  bonusDelayMs: 900,
};

export function slotTempo(turbo: boolean): SlotTempo {
  return turbo ? TURBO_TEMPO : NORMAL_TEMPO;
}

/** Скільки крутиться спін без near-miss: зупинка останнього барабана. */
export function spinMs(t: SlotTempo): number {
  return t.reelMs + (SLOT.cols - 1) * t.staggerMs;
}

export function countUpMs(t: SlotTempo, win: number): number {
  return Math.min(t.countUpMaxMs, t.countUpBaseMs + win * t.countUpPerChipMs);
}

/** Фріспіни: множник усіх тривалостей. Турбо з налаштувань і «пробіл — ще швидше» складаються. */
export function freeSpinsTimeScale(turbo: boolean, rush: boolean): number {
  if (turbo) return rush ? 0.2 : 0.35;
  return rush ? 0.4 : 1;
}
