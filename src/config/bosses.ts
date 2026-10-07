/**
 * БОСИ. Логіка знає лише патерни атак і фази; конкретні боси — тут.
 * (Патерни, фази і арени — Milestone 6–7.)
 */
export interface BossDef {
  id: string;
  name: string;
  /** Двері-трофей у хабі (ім'я дверей у атласі props). */
  trophyDoor: string;
  /** Фінальний бос: його скатер з'являється лише після перемоги над усіма іншими. */
  final?: boolean;
}

export const BOSSES: Record<string, BossDef> = {
  goblinKing: { id: 'goblinKing', name: 'Король Колекторів', trophyDoor: 'goblin_door' },
  slimeKing: { id: 'slimeKing', name: 'Король Кредитів', trophyDoor: 'slime_door' },
  skeletonKing: { id: 'skeletonKing', name: 'Кістяний Банкір', trophyDoor: 'skeleton_door' },
  dungeonMaster: { id: 'dungeonMaster', name: 'Майстер Ставок', trophyDoor: 'dungeon_master_door' },
  casino: { id: 'casino', name: 'КАЗИНО', trophyDoor: 'door', final: true },
};

export const BOSS_ORDER = ['goblinKing', 'slimeKing', 'skeletonKing', 'dungeonMaster', 'casino'] as const;
