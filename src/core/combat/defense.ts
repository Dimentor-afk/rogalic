/**
 * Що стається, коли по гравцю прилітає удар. Чиста функція — вся логіка паріру/блоку в одному місці.
 *
 * Порядок перевірок:
 *  1. i-frames (перекат або невразливість після удару) → 'dodged', нічого не відбувається;
 *  2. блок натиснуто не раніше ніж parryWindowMs до удару і гравець дивиться на атакувального → 'parried':
 *     атакувальник оглушений, наступний удар гравця по ньому критичний; стаміна не тратиться;
 *  3. блок тримається і гравець дивиться на атакувального → 'blocked': шкода = 0, стаміна -= шкода·k;
 *     якщо стаміни не вистачило → 'guardBreak': блок пробито, гравець отримує решту шкоди і короткий стан;
 *  4. інакше → 'hit'.
 */

export type DefenseOutcome = 'dodged' | 'parried' | 'blocked' | 'guardBreak' | 'hit';

export interface IncomingHit {
  now: number;
  damage: number;
  /** Чи можна цей удар парирувати/блокувати (напр. снаряд «рулетки» — ні). */
  blockable: boolean;
  /** Атакувальник праворуч (1) чи ліворуч (-1) від гравця. */
  fromSide: 1 | -1;
}

export interface DefenderState {
  invulnerable: boolean;
  blockHeld: boolean;
  /** Час натискання блоку (мс), -Infinity якщо не натискали. */
  blockPressedAt: number;
  facing: 1 | -1;
  stamina: number;
}

export interface DefenseRules {
  parryWindowMs: number;
  /** Скільки стаміни коштує заблокувати 1 одиницю шкоди. */
  staminaPerDamage: number;
}

export interface DefenseResult {
  outcome: DefenseOutcome;
  damageTaken: number;
  staminaCost: number;
}

export function resolveHit(hit: IncomingHit, d: DefenderState, rules: DefenseRules): DefenseResult {
  if (d.invulnerable) return { outcome: 'dodged', damageTaken: 0, staminaCost: 0 };

  const facingAttacker = d.facing === hit.fromSide;
  if (hit.blockable && facingAttacker) {
    const sincePress = hit.now - d.blockPressedAt;
    if (sincePress >= 0 && sincePress <= rules.parryWindowMs) {
      return { outcome: 'parried', damageTaken: 0, staminaCost: 0 };
    }
    if (d.blockHeld) {
      const cost = hit.damage * rules.staminaPerDamage;
      if (d.stamina >= cost) return { outcome: 'blocked', damageTaken: 0, staminaCost: cost };
      // стаміни не вистачило: решта шкоди проходить пропорційно
      const unblocked = Math.ceil(hit.damage * (1 - d.stamina / cost));
      return { outcome: 'guardBreak', damageTaken: Math.max(1, unblocked), staminaCost: d.stamina };
    }
  }
  return { outcome: 'hit', damageTaken: hit.damage, staminaCost: 0 };
}
