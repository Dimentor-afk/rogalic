import { describe, expect, it } from 'vitest';
import {
  buyUpgrade,
  buyWeapon,
  canExit,
  defaultSettings,
  equipWeapon,
  finishRun,
  interestFor,
  loadGame,
  loadoutOf,
  newGame,
  normalizeSettings,
  payDebt,
  saveGame,
  startRun,
  upgradePrice,
  type KeyValueStorage,
} from '../src/core/state/GameState';
import { ECONOMY, UPGRADES } from '../src/config/economy';
import { SLOT } from '../src/config/slot';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('борг і відсотки', () => {
  it('відсотки: частка боргу з округленням вгору, але не менше мінімуму; без боргу — 0', () => {
    expect(interestFor(25000)).toBe(Math.ceil(25000 * ECONOMY.interestRate));
    expect(interestFor(10)).toBe(ECONOMY.minInterest);
    expect(interestFor(0)).toBe(0);
  });

  it('каса: гасить будь-яку суму, не більше балансу і боргу', () => {
    const s = newGame(1);
    s.balance = 300;
    s.debt = 1000;
    expect(payDebt(s, 120)).toBe(120);
    expect([s.balance, s.debt, s.stats.paidDebt]).toEqual([180, 880, 120]);
    expect(payDebt(s, 9999)).toBe(180);
    expect(s.balance).toBe(0);
    s.balance = 5000;
    expect(payDebt(s, 5000)).toBe(700);
    expect(s.debt).toBe(0);
  });
});

describe('повернення з підземелля', () => {
  it('ліфт: фішки на баланс + відсотки на борг + минає день', () => {
    const s = newGame(1);
    const before = s.balance;
    const r = finishRun(s, { chips: 80, died: false, depth: 2, bagPicked: false });
    expect(r.banked).toBe(80);
    expect(s.balance).toBe(before + 80);
    expect(s.debt).toBe(ECONOMY.startDebt + r.interest);
    expect(s.stats.days).toBe(1);
    expect(s.stats.deepest).toBe(2);
  });

  it('смерть: фішки лишаються мішком на глибині; новий мішок спалює старий; підібраний мішок зникає', () => {
    const s = newGame(1);
    finishRun(s, { chips: 50, died: true, depth: 3, bagPicked: false });
    expect(s.deathBag).toEqual({ depth: 3, chips: 50 });
    const r = finishRun(s, { chips: 20, died: true, depth: 1, bagPicked: false });
    expect(r.bagBurned).toBe(50);
    expect(s.deathBag).toEqual({ depth: 1, chips: 20 });
    finishRun(s, { chips: 70, died: false, depth: 1, bagPicked: true });
    expect(s.deathBag).toBeNull();
  });

  it('«днів без додепу»: росте, якщо між поверненнями не крутив слот, і скидається, якщо крутив', () => {
    const s = newGame(1);
    finishRun(s, { chips: 0, died: false, depth: 1, bagPicked: false });
    finishRun(s, { chips: 0, died: false, depth: 1, bagPicked: false });
    expect(s.stats.daysWithoutDodep).toBe(2);
    s.spunSinceReturn = true;
    finishRun(s, { chips: 0, died: false, depth: 1, bagPicked: false });
    expect(s.stats.daysWithoutDodep).toBe(0);
  });

  it('startRun: кожен спуск — новий seed; прокляття діє на один забіг', () => {
    const s = newGame(7);
    s.nextCurse = 'darkness';
    const a = startRun(s);
    const b = startRun(s);
    expect(a.seed).not.toBe(b.seed);
    expect(a.curse).toBe('darkness');
    expect(b.curse).toBeNull();
  });
});

describe('прокачка', () => {
  it('купівля рівнів за зростаючими цінами до максимуму', () => {
    const s = newGame(1);
    s.balance = 100000;
    const prices: number[] = [];
    while (upgradePrice(s, 'armor') !== null) {
      prices.push(upgradePrice(s, 'armor')!);
      expect(buyUpgrade(s, 'armor')).toBe('ok');
    }
    expect(prices).toEqual([...UPGRADES.armor.prices]);
    expect(buyUpgrade(s, 'armor')).toBe('max');
    s.balance = 0;
    expect(buyUpgrade(s, 'hp')).toBe('noMoney');
  });

  it('зброя: купівля, повторна купівля, екіпірування', () => {
    const s = newGame(1);
    s.balance = 10000;
    expect(equipWeapon(s, 'axe')).toBe(false);
    expect(buyWeapon(s, 'axe')).toBe('ok');
    expect(s.equipped).toBe('axe');
    expect(buyWeapon(s, 'axe')).toBe('owned');
    expect(equipWeapon(s, 'sword')).toBe(true);
  });

  it('loadout враховує прокачку і прокляття', () => {
    const s = newGame(1);
    const base = loadoutOf(s);
    s.upgrades.hp = 2;
    s.upgrades.flask = 1;
    s.upgrades.stamina = 3;
    const up = loadoutOf(s);
    expect(up.maxHp).toBe(base.maxHp + 4);
    expect(up.flasks).toBe(base.flasks + 1);
    expect(up.maxStamina).toBe(base.maxStamina + 60);
    expect(loadoutOf(s, -2).maxHp).toBe(up.maxHp - 2);
  });
});

describe('збереження', () => {
  it('зберегти → завантажити дає те саме; битий сейв → нова гра', () => {
    const st = memoryStorage();
    const s = newGame(5);
    s.balance = 777;
    s.bosses.push('slimeKing');
    saveGame(st, s);
    expect(loadGame(st)).toEqual(s);
    st.setItem('dodep.save', '{not json');
    expect(loadGame(st).balance).toBe(ECONOMY.startBalance);
  });

  it('старий сейв без нових полів доповнюється значеннями за замовчуванням', () => {
    const st = memoryStorage();
    st.setItem('dodep.save', JSON.stringify({ version: 1, balance: 10, debt: 5 }));
    const s = loadGame(st);
    expect(s.balance).toBe(10);
    expect(s.stats.spins).toBe(0);
    expect(s.upgrades.armor).toBe(0);
  });
});

describe('налаштування (турбо, автоспін)', () => {
  it('нова гра: турбо вимкнено, автоспін 10, стоп на заносі увімкнено', () => {
    expect(newGame(1).settings).toEqual({ slotTurbo: false, autoSpins: 10, autoStopBigWin: true });
    expect(defaultSettings()).toEqual(newGame(1).settings);
  });

  it('старий сейв без налаштувань завантажується зі значеннями за замовчуванням', () => {
    const st = memoryStorage();
    const old = { ...newGame(3), balance: 1234 } as Record<string, unknown>;
    delete old.settings;
    st.setItem('dodep.save', JSON.stringify(old));
    const s = loadGame(st);
    expect(s.balance).toBe(1234);
    expect(s.settings).toEqual(defaultSettings());
  });

  it('вибір гравця зберігається і завантажується', () => {
    const st = memoryStorage();
    const s = newGame(4);
    s.settings = { slotTurbo: true, autoSpins: 0, autoStopBigWin: false };
    saveGame(st, s);
    expect(loadGame(st).settings).toEqual({ slotTurbo: true, autoSpins: 0, autoStopBigWin: false });
  });

  it('зіпсовані поля замінюються за замовчуванням поштучно, правильні лишаються', () => {
    expect(normalizeSettings({ slotTurbo: 'так', autoSpins: 50, autoStopBigWin: 1 })).toEqual({ slotTurbo: false, autoSpins: 50, autoStopBigWin: true });
    expect(normalizeSettings({ slotTurbo: true, autoSpins: -5 })).toEqual({ slotTurbo: true, autoSpins: 10, autoStopBigWin: true });
    expect(normalizeSettings({ autoSpins: 2.5 }).autoSpins).toBe(10);
    expect(normalizeSettings(null)).toEqual(defaultSettings());
    expect(normalizeSettings('турбо')).toEqual(defaultSettings());
  });
});

describe('вихід з казино', () => {
  it('лише коли всі боси переможені і борг = 0', () => {
    const s = newGame(1);
    expect(canExit(s, ['a', 'b'])).toBe(false);
    s.bosses = ['a', 'b'];
    expect(canExit(s, ['a', 'b'])).toBe(false);
    s.debt = 0;
    expect(canExit(s, ['a', 'b'])).toBe(true);
  });
});

describe('ставка в сейві', () => {
  it('нова гра і старий сейв з недопустимою ставкою — найменша ставка з таблиці слота', () => {
    expect(SLOT.bets).toContain(newGame().bet);
    const storage = memoryStorage();
    saveGame(storage, { ...newGame(), bet: 2 });
    expect(loadGame(storage).bet).toBe(SLOT.bets[0]);
    saveGame(storage, { ...newGame(), bet: SLOT.bets[2]! });
    expect(loadGame(storage).bet).toBe(SLOT.bets[2]);
  });
});
