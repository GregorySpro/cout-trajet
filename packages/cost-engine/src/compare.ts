import { roundEur } from './estimate';
import type { Estimate } from './types';

export interface Comparison {
  /** Surcoût de l'itinéraire rapide par rapport à l'itinéraire économique (peut être négatif). */
  extraCostEur: number;
  /** Minutes gagnées par l'itinéraire rapide (négatif s'il est en réalité plus lent). */
  minutesSaved: number;
  /** Coût de l'heure gagnée ; `null` si aucun temps n'est gagné ou si ce n'est pas plus cher. */
  eurPerHourSaved: number | null;
  cheapest: 'fast' | 'economical' | 'equal';
  fastest: 'fast' | 'economical' | 'equal';
}

/** Compare un itinéraire « rapide » à un itinéraire « économique » (ex. sans péage). */
export function compareRoutes(fast: Estimate, economical: Estimate): Comparison {
  const extraCostEur = roundEur(fast.totalCostEur - economical.totalCostEur);
  const minutesSaved = economical.durationMin - fast.durationMin;
  return {
    extraCostEur,
    minutesSaved,
    eurPerHourSaved:
      minutesSaved > 0 && extraCostEur > 0 ? roundEur((extraCostEur / minutesSaved) * 60) : null,
    cheapest:
      fast.totalCostEur === economical.totalCostEur
        ? 'equal'
        : fast.totalCostEur < economical.totalCostEur
          ? 'fast'
          : 'economical',
    fastest:
      fast.durationMin === economical.durationMin
        ? 'equal'
        : fast.durationMin < economical.durationMin
          ? 'fast'
          : 'economical',
  };
}
