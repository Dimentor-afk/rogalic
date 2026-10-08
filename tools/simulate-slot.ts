/**
 * СИМУЛЯЦІЯ СЛОТА: N спінів (за замовчуванням 1 000 000) → RTP, частота бонусок, розподіл виграшів.
 * Запуск: npm run sim   (або npx tsx tools/simulate-slot.ts 2000000 --seed 42)
 *
 * Бонуска в грі — це бій з босом, тому для RTP використовується модель гравця (SIM_PLAYER_MODEL):
 * шанс перемоги і шанси «без шкоди / без фляг / швидко» для стартового множника фріспінів.
 * Код використовує ТІ САМІ функції, що й гра (src/core/slot/slot.ts).
 */
import { SIM_PLAYER_MODEL as M, SLOT, TARGET_RTP } from '../src/config/slot';
import { BOSSES, BOSS_ORDER, FIGHT_MULTIPLIERS } from '../src/config/bosses';
import { SlotRng, nextGuarantee, runFreeSpins, spin, startMultiplierFor } from '../src/core/slot/slot';

const args = process.argv.slice(2);
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 1_000_000);
const seedArg = args.indexOf('--seed');
const seed = seedArg >= 0 ? Number(args[seedArg + 1]) : 12345;
const BET = SLOT.bets[0]!;
const regular = BOSS_ORDER.filter((id) => !BOSSES[id]!.final);

const rng = new SlotRng(seed);

/** Цінність бонуски за моделлю гравця (бій + фріспіни), у фішках. */
function playBonus(boss: string): number {
  if (rng.next() >= M.bossWinRate) return 0;
  const start = startMultiplierFor(
    { noDamage: rng.next() < M.noDamageChance, noFlasks: rng.next() < M.noFlaskChance, fast: rng.next() < M.fastChance },
    FIGHT_MULTIPLIERS,
  );
  return runFreeSpins(BOSSES[boss]!.freeSpins, BET, start, rng).win;
}

let wagered = 0;
let baseWon = 0;
let bonusWon = 0;
let hits = 0;
let naturalBonus = 0;
let guaranteedBonus = 0;
let curses = 0;
let guarantee = 0;
let maxWin = 0;
const buckets = [0, 1, 2, 5, 10, 20, 50, 100, 500];
const hist = new Array(buckets.length).fill(0) as number[];
let noWin = 0;

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  wagered += BET;
  const r = spin({ bet: BET, availableBosses: regular, guaranteeFull: guarantee >= SLOT.guarantee.max, rng });
  guarantee = nextGuarantee(guarantee, r);
  let win = r.win;
  if (r.bonusBoss) {
    if (r.guaranteed) guaranteedBonus++;
    else naturalBonus++;
    const b = playBonus(r.bonusBoss);
    bonusWon += b;
    win += b;
  }
  if (r.curseTriggered) curses++;
  baseWon += r.win;
  if (win > 0) hits++;
  maxWin = Math.max(maxWin, win);
  if (win === 0) {
    noWin++;
    continue;
  }
  const x = win / BET;
  let k = 0;
  while (k + 1 < buckets.length && x >= buckets[k + 1]!) k++;
  hist[k]!++;
}

// Окремо — середня цінність бонуски з великої вибірки (вона ж — цінність купленої бонуски).
// Бонуски рідкісні і з «важким хвостом», тому пряма оцінка за 1 млн спінів гуляє ±1.5%.
// Розклад RTP = основна гра + (бонусок на спін) × (середня цінність бонуски) має набагато меншу дисперсію.
let buyWon = 0;
const BUYS = Math.max(100000, Math.floor(N / 10));
for (let i = 0; i < BUYS; i++) buyWon += playBonus(regular[i % regular.length]!);
const bonusEv = buyWon / BUYS;
const bonusRate = (naturalBonus + guaranteedBonus) / N;
const rtpDecomposed = baseWon / wagered + (bonusRate * bonusEv) / BET;

const rtp = (baseWon + bonusWon) / wagered;
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
console.log(`Спінів: ${N.toLocaleString('uk')}  ставка ${BET}  seed ${seed}  (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
console.log(`RTP (оцінка з розкладом): ${pct(rtpDecomposed)}   ціль ${pct(TARGET_RTP.min)}–${pct(TARGET_RTP.max)}`);
console.log(`  основна гра:            ${pct(baseWon / wagered)}`);
console.log(`  бонуски:                ${pct((bonusRate * bonusEv) / BET)}  (${(bonusEv / BET).toFixed(1)} ставок × 1/${Math.round(1 / bonusRate)} спінів)`);
console.log(`RTP «в лоб» за ці спіни:  ${pct(rtp)}  (бонуски цих спінів: ${pct(bonusWon / wagered)})`);
console.log(`Частота виграшу:      ${pct(hits / N)}`);
console.log(`Бонуска:              1 на ${Math.round(N / (naturalBonus + guaranteedBonus))} спінів (природних 1/${Math.round(N / naturalBonus)}, гарантованих ${guaranteedBonus})`);
console.log(`Прокляття:            1 на ${Math.round(N / Math.max(1, curses))} спінів`);
console.log(`Купити бонус (x${SLOT.buyBonusBets}): RTP ${pct(bonusEv / (SLOT.buyBonusBets * BET))}  (${BUYS.toLocaleString('uk')} бонусок у вибірці)`);
console.log(`Макс. виграш:         ${(maxWin / BET).toFixed(0)} ставок`);
console.log('Розподіл виграшів (у ставках):');
console.log(`  ${'без виграшу'.padEnd(12)} ${pct(noWin / N).padStart(8)}`);
hist.forEach((c, k) => {
  const lo = buckets[k]!;
  const hi = buckets[k + 1];
  const label = k === 0 ? '<1x (менше ставки)' : hi ? `${lo}–${hi}x` : `${lo}x+`;
  console.log(`  ${label.padEnd(12)} ${pct(c / N).padStart(8)}`);
});
const ok = rtpDecomposed >= TARGET_RTP.min && rtpDecomposed <= TARGET_RTP.max;
console.log(ok ? 'RTP у цільовому діапазоні ✔' : 'RTP ПОЗА цільовим діапазоном ✘');
process.exitCode = ok ? 0 : 1;
