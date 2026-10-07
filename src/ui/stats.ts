/**
 * Рядки статистики для меню і фінального екрана.
 */
import type { SaveData } from '../core/state/GameState';
import { BOSS_ORDER } from '../config/bosses';

export function playerRtp(s: SaveData): string {
  return s.stats.wagered > 0 ? `${((s.stats.won / s.stats.wagered) * 100).toFixed(1)}%` : '—';
}

export function statsLines(s: SaveData): { label: string; value: string }[] {
  const st = s.stats;
  return [
    { label: 'Задепано всього', value: `${st.wagered}` },
    { label: 'Виграно на слоті', value: `${st.won}` },
    { label: 'Виведено на борг', value: `${st.paidDebt}` },
    { label: 'Твій RTP', value: playerRtp(s) },
    { label: 'Днів без додепу', value: `${st.daysWithoutDodep}` },
    { label: 'Спінів / бонусок', value: `${st.spins} / ${st.bonuses}` },
    { label: 'Босів переможено', value: `${s.bosses.length} з ${BOSS_ORDER.length}` },
    { label: 'Спусків / смертей', value: `${st.runs} / ${st.deaths}` },
    { label: 'Найглибше', value: `${st.deepest}` },
    { label: 'Нафармлено фішок', value: `${st.chipsFarmed}` },
    { label: 'Сплачено відсотків', value: `${st.interestPaid}` },
  ];
}
