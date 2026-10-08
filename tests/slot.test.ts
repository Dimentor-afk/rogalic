import { describe, expect, it } from 'vitest';
import {
  SlotRng,
  baseTable,
  evaluateLine,
  evaluateLines,
  freeSpin,
  nextGuarantee,
  pickBonusBoss,
  runFreeSpins,
  spin,
  startMultiplierFor,
  unitsToChips,
  type Grid,
  type SpinResult,
} from '../src/core/slot/slot';
import { SLOT, SYMBOLS } from '../src/config/slot';
import { BOSSES, BOSS_ORDER } from '../src/config/bosses';
import { availableBosses, buyBonusCost, chargeBuyBonus, chargeSpin, recordBossWin, settleSpin } from '../src/core/slot/session';
import { newGame } from '../src/core/state/GameState';

const pay = (id: string, n: number) => SYMBOLS.find((s) => s.id === id)!.pays![n - 3]!;
/** Сітка з рядків (кожен рядок — 5 символів зліва направо). */
const rows = (r0: string[], r1: string[], r2: string[]): Grid => [0, 1, 2, 3, 4].map((c) => [r0[c]!, r1[c]!, r2[c]!]);
const MID = SLOT.paylines[0]!; // середній рядок

describe('лінії виплат', () => {
  const filler = ['ten', 'jack', 'queen', 'king', 'chip'];
  it('3 однакових зліва — виплата за 3; розрив — не рахується', () => {
    const g = rows(filler, ['seven', 'seven', 'seven', 'ten', 'seven'], filler);
    expect(evaluateLine(g, MID, 0)).toEqual({ line: 0, symbol: 'seven', count: 3, units: pay('seven', 3) });
    const g2 = rows(filler, ['ten', 'seven', 'seven', 'seven', 'seven'], filler);
    expect(evaluateLine(g2, MID, 0)).toBeNull();
  });

  it('wild підміняє платні символи, в т.ч. на початку лінії', () => {
    const g = rows(filler, ['wild', 'gold', 'wild', 'gold', 'ten'], filler);
    expect(evaluateLine(g, MID, 0)).toMatchObject({ symbol: 'gold', count: 4, units: pay('gold', 4) });
  });

  it('wild не підміняє скатер і прокляття', () => {
    const g = rows(filler, ['sc:goblinKing', 'wild', 'wild', 'sc:goblinKing', 'ten'], filler);
    // перший не-wild — скатер, він не платить по лініях; лишаються тільки wild-и, але їх лише 0 від початку
    expect(evaluateLine(g, MID, 0)).toBeNull();
  });

  it('якщо чисті wild-и платять більше — беремо їх', () => {
    const g = rows(filler, ['wild', 'wild', 'wild', 'ten', 'ten'], filler);
    // wild×3 = 45 > ten×5 = 90? ні → ten×5 вигідніше
    expect(evaluateLine(g, MID, 0)).toMatchObject({ symbol: 'ten', count: 5 });
    const g2 = rows(filler, ['wild', 'wild', 'wild', 'wild', 'jack'], filler);
    expect(evaluateLine(g2, MID, 0)).toMatchObject({ symbol: 'wild', count: 4, units: pay('wild', 4) });
  });

  it('20 ліній, всі в межах сітки; виграш у фішках = ⌊units·ставка/20⌋', () => {
    expect(SLOT.paylines).toHaveLength(20);
    for (const l of SLOT.paylines) {
      expect(l).toHaveLength(SLOT.cols);
      for (const r of l) expect(r >= 0 && r < SLOT.rows).toBe(true);
    }
    expect(unitsToChips(9, 10)).toBe(4); // 9·10/20 = 4.5 → 4
    expect(unitsToChips(9, 10, 3)).toBe(13);
    const all = rows(Array(5).fill('seven'), Array(5).fill('seven'), Array(5).fill('seven'));
    expect(evaluateLines(all)).toHaveLength(20);
  });
});

describe('скатери, бонуска, гарант, прокляття', () => {
  it('бос бонуски — чиїх скатерів найбільше; нічия — випадково серед лідерів', () => {
    const rng = new SlotRng(1);
    expect(pickBonusBoss({ a: 2 }, rng)).toBeNull();
    expect(pickBonusBoss({ a: 2, b: 1 }, rng)).toBe('a');
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(pickBonusBoss({ a: 2, b: 2 }, rng)!);
    expect(seen).toEqual(new Set(['a', 'b']));
  });

  it('повна шкала гаранту → бонуска на цьому ж спіні; потім шкала обнуляється', () => {
    const rng = new SlotRng(5);
    for (let i = 0; i < 30; i++) {
      const r = spin({ bet: 10, availableBosses: ['goblinKing', 'slimeKing'], guaranteeFull: true, rng });
      expect(r.bonusBoss).not.toBeNull();
      expect(r.totalScatters).toBeGreaterThanOrEqual(3);
      expect(nextGuarantee(100, r)).toBe(0);
    }
  });

  it('шкала росте на perScatter за кожен скатер без бонуски і не перевищує max', () => {
    const fake = { totalScatters: 2, bonusBoss: null } as SpinResult;
    expect(nextGuarantee(10, fake)).toBe(10 + 2 * SLOT.guarantee.perScatter);
    expect(nextGuarantee(99.5, fake)).toBe(SLOT.guarantee.max);
  });

  it('скатери лише доступних босів; фінальний — тільки коли всі інші переможені', () => {
    const t = baseTable(['goblinKing']);
    expect(t.ids.filter((id) => id.startsWith('sc:'))).toEqual(['sc:goblinKing']);
    const s = newGame(1);
    expect(availableBosses(s)).not.toContain('casino');
    s.bosses = BOSS_ORDER.filter((id) => !BOSSES[id]!.final);
    s.bosses.pop();
    expect(availableBosses(s)).not.toContain('casino');
    s.bosses = BOSS_ORDER.filter((id) => !BOSSES[id]!.final);
    expect(availableBosses(s)).toContain('casino');
  });

  it('той самий стан RNG — той самий спін (результат відомий до анімації)', () => {
    const a = spin({ bet: 10, availableBosses: ['goblinKing'], guaranteeFull: false, rng: new SlotRng(777) });
    const b = spin({ bet: 10, availableBosses: ['goblinKing'], guaranteeFull: false, rng: new SlotRng(777) });
    expect(a).toEqual(b);
  });

  it('3+ символи прокляття → прокляття на наступний спуск', () => {
    const rng = new SlotRng(3);
    let found = false;
    for (let i = 0; i < 5000 && !found; i++) {
      const r = spin({ bet: 10, availableBosses: ['goblinKing'], guaranteeFull: false, rng });
      if (r.curseTriggered) {
        const s = newGame(1);
        const out = settleSpin(s, r, rng);
        expect(out.curse).not.toBeNull();
        expect(s.nextCurse).toBe(out.curse);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('фріспіни', () => {
  it('у фріспінах немає скатерів і прокляття, зате є множники', () => {
    const rng = new SlotRng(9);
    let multipliers = 0;
    for (let i = 0; i < 300; i++) {
      const r = freeSpin(BOSSES.goblinKing!.freeSpins, rng);
      expect(r.grid.flat().some((id) => id.startsWith('sc:') || id === 'curse')).toBe(false);
      multipliers += r.multipliers.length;
    }
    expect(multipliers).toBeGreaterThan(0);
  });

  it('загальний множник серії = стартовий + сума множників; всі виграші серії множаться на нього', () => {
    const s = runFreeSpins(BOSSES.dungeonMaster!.freeSpins, 10, 7, new SlotRng(11));
    expect(s.spins).toHaveLength(SLOT.freeSpins);
    const sum = s.spins.flatMap((x) => x.multipliers).reduce((a, b) => a + b, 0);
    expect(s.totalMultiplier).toBe(7 + sum);
    expect(s.win).toBe(unitsToChips(s.units, 10, s.totalMultiplier));
  });

  it('стартовий множник: без шкоди x5, без фляг +x2, швидко +x2, інакше x1', () => {
    expect(startMultiplierFor({ noDamage: false, noFlasks: false, fast: false })).toBe(1);
    expect(startMultiplierFor({ noDamage: true, noFlasks: false, fast: false })).toBe(5);
    expect(startMultiplierFor({ noDamage: true, noFlasks: true, fast: true })).toBe(9);
    expect(startMultiplierFor({ noDamage: false, noFlasks: true, fast: false })).toBe(2);
  });
});

describe('сесія: баланс і статистика', () => {
  it('спін списує ставку і рахує статистику; купівля бонусу — x100', () => {
    const s = newGame(1);
    s.balance = 2000;
    chargeSpin(s, 20);
    expect([s.balance, s.stats.wagered, s.stats.spins, s.spunSinceReturn]).toEqual([1980, 20, 1, true]);
    expect(buyBonusCost(10)).toBe(1000);
    expect(chargeBuyBonus(s, 10)).toBe(true);
    expect(s.balance).toBe(980);
    expect(chargeBuyBonus(s, 10)).toBe(false);
  });

  it('перемога над босом: новий — у колекцію, повторний — ні', () => {
    const s = newGame(1);
    expect(recordBossWin(s, 'slimeKing')).toBe(true);
    expect(recordBossWin(s, 'slimeKing')).toBe(false);
    expect(s.bosses).toEqual(['slimeKing']);
    expect(s.stats.bossWins).toBe(2);
  });
});
