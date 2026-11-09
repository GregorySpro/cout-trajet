import type { VehicleClass } from '@cout-trajet/shared';
import type { PriceConflict, PricePair, Reliability } from './types';

const RELIABILITY_RANK: Readonly<Record<Reliability, number>> = {
  official: 3,
  derived: 2,
  'third-party': 1,
  estimate: 0,
};

function rank(pair: PricePair): number {
  return pair.source ? RELIABILITY_RANK[pair.source.reliability] : -1;
}

/** Même prix pour les cinq classes, au centime près. */
function samePrices(a: PricePair, b: PricePair): boolean {
  return ([1, 2, 3, 4, 5] as const).every((c) => Math.abs(a.prices[c] - b.prices[c]) < 0.005);
}

/**
 * Choisit entre deux tarifs du même couple de gares :
 *  1. le plus récent (dates d'application connues et différentes) ;
 *  2. sinon le plus fiable (officiel > dérivé > tiers > estimation) ;
 *  3. sinon le premier chargé.
 */
function resolve(
  existing: PricePair,
  incoming: PricePair,
): { winner: PricePair; reason: PriceConflict['reason'] } {
  const a = existing.source?.effectiveFrom ?? null;
  const b = incoming.source?.effectiveFrom ?? null;
  if (a !== null && b !== null && a !== b) {
    return b > a ? { winner: incoming, reason: 'newer' } : { winner: existing, reason: 'newer' };
  }
  const ra = rank(existing);
  const rb = rank(incoming);
  if (ra !== rb) {
    return rb > ra
      ? { winner: incoming, reason: 'more-reliable' }
      : { winner: existing, reason: 'more-reliable' };
  }
  return { winner: existing, reason: 'first-loaded' };
}

/**
 * Livre de tarifs : prix entre deux gares d'un même réseau, par classe de véhicule.
 * Quand plusieurs sources donnent des prix différents pour le même couple, la valeur retenue est la
 * plus récente, puis la plus fiable ; chaque désaccord est conservé dans `conflicts`.
 */
export class TollBook {
  private readonly byKey = new Map<string, PricePair>();
  private readonly conflictList: PriceConflict[] = [];

  constructor(pairs: Iterable<PricePair> = []) {
    this.add(pairs);
  }

  get size(): number {
    return this.byKey.size;
  }

  /** Désaccords rencontrés entre sources, avec la valeur retenue. */
  get conflicts(): readonly PriceConflict[] {
    return this.conflictList;
  }

  /** Ajoute des tarifs ; en cas de désaccord avec un tarif existant, applique la règle de résolution. */
  add(pairs: Iterable<PricePair>): void {
    for (const p of pairs) {
      const key = `${p.from}>${p.to}`;
      const existing = this.byKey.get(key);
      if (!existing) {
        this.byKey.set(key, p);
        continue;
      }
      if (samePrices(existing, p)) {
        // Même prix : on garde la source la plus récente (information de traçabilité).
        const newer = (p.source?.effectiveFrom ?? '') > (existing.source?.effectiveFrom ?? '');
        if (newer) this.byKey.set(key, p);
        continue;
      }
      const { winner, reason } = resolve(existing, p);
      const loser = winner === existing ? p : existing;
      this.conflictList.push({
        from: p.from,
        to: p.to,
        kept: { sourceId: winner.source?.id ?? null, class1Eur: winner.prices[1] },
        dropped: { sourceId: loser.source?.id ?? null, class1Eur: loser.prices[1] },
        reason,
      });
      this.byKey.set(key, winner);
    }
  }

  /** Cherche d'abord le sens demandé, puis le sens inverse (grilles symétriques). */
  find(from: string, to: string): PricePair | undefined {
    return this.byKey.get(`${from}>${to}`) ?? this.byKey.get(`${to}>${from}`);
  }

  priceBetween(from: string, to: string, vehicleClass: VehicleClass): number | undefined {
    return this.find(from, to)?.prices[vehicleClass];
  }

  /** Identifiants de toutes les gares présentes dans le livre. */
  gates(): Set<string> {
    const out = new Set<string>();
    for (const p of this.byKey.values()) {
      out.add(p.from);
      out.add(p.to);
    }
    return out;
  }

  has(gate: string): boolean {
    return this.gates().has(gate);
  }

  /** Toutes les paires, pour sérialiser le livre (JSON). */
  toArray(): PricePair[] {
    return [...this.byKey.values()];
  }
}
