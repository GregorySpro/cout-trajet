import type { VehicleClass } from '@cout-trajet/shared';
import type { PricePair } from './types';

/** Livre de tarifs : prix officiel entre deux gares d'un même réseau, par classe de véhicule. */
export class TollBook {
  private readonly byKey = new Map<string, PricePair>();

  constructor(pairs: Iterable<PricePair> = []) {
    for (const p of pairs) this.byKey.set(`${p.from}>${p.to}`, p);
  }

  get size(): number {
    return this.byKey.size;
  }

  /** Ajoute (ou remplace) des tarifs. */
  add(pairs: Iterable<PricePair>): void {
    for (const p of pairs) this.byKey.set(`${p.from}>${p.to}`, p);
  }

  /** Cherche d'abord le sens demandé, puis le sens inverse (grilles symétriques). */
  find(from: string, to: string): PricePair | undefined {
    return this.byKey.get(`${from}>${to}`) ?? this.byKey.get(`${to}>${from}`);
  }

  priceBetween(from: string, to: string, vehicleClass: VehicleClass): number | undefined {
    return this.find(from, to)?.prices[vehicleClass];
  }

  has(gate: string): boolean {
    for (const key of this.byKey.keys()) {
      const [a, b] = key.split('>');
      if (a === gate || b === gate) return true;
    }
    return false;
  }

  /** Toutes les paires, pour sérialiser le livre (JSON). */
  toArray(): PricePair[] {
    return [...this.byKey.values()];
  }
}
