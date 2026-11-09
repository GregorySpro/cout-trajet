import type { TollCharge } from '@cout-trajet/cost-engine';
import type { VehicleClass } from '@cout-trajet/shared';
import type { TollBook } from './book';
import { GATE_BREAK } from './gate-break';
import { openTollPrice, type OpenToll } from './open-tolls';

export interface TripTollContext {
  book: TollBook;
  openTolls: readonly OpenToll[];
  vehicleClass: VehicleClass;
  /** Date du trajet (tarifs saisonniers). */
  date: Date;
  /** Gares dont la correspondance est incertaine : le péage correspondant est un prix estimé. */
  uncertainGates?: ReadonlySet<string>;
  /** Gare retenue → toutes les gares candidates (correspondance ambiguë) ; le prix est la moyenne. */
  alternatives?: ReadonlyMap<string, readonly string[]>;
}

export interface TripTolls {
  charges: TollCharge[];
  warnings: string[];
}

function network(gate: string): string {
  return gate.split(':')[0] ?? gate;
}

/**
 * Calcule les péages d'un itinéraire à partir des gares franchies, dans l'ordre du trajet.
 * - Gare à tarif fixe (ouvrage) : un péage à l'unité.
 * - Gares consécutives d'un même réseau fermé : prix entre la première (entrée) et la dernière (sortie).
 * - Gare ambiguë : prix moyen des candidates, marqué « estimé » ; gare incertaine : marquée « estimé ».
 * Ce qu'on ne sait pas chiffrer est signalé dans `warnings` plutôt que deviné.
 */
export function computeTripTolls(gates: readonly string[], ctx: TripTollContext): TripTolls {
  const charges: TollCharge[] = [];
  const warnings: string[] = [];
  const openByGate = new Map(ctx.openTolls.map((t) => [t.gate, t]));
  const candidatesOf = (gate: string): readonly string[] => ctx.alternatives?.get(gate) ?? [gate];

  let group: string[] = [];
  const flush = (): void => {
    if (group.length === 0) return;
    const first = group[0] as string;
    const last = group[group.length - 1] as string;
    if (group.length === 1) {
      warnings.push(
        `Gare isolée sur le réseau ${network(first)} (${first}) : entrée ou sortie inconnue, péage non compté.`,
      );
    } else {
      const prices: number[] = [];
      for (const a of candidatesOf(first)) {
        for (const b of candidatesOf(last)) {
          const p = ctx.book.priceBetween(a, b, ctx.vehicleClass);
          if (p !== undefined) prices.push(p);
        }
      }
      if (prices.length === 0) {
        warnings.push(`Aucun tarif trouvé entre ${first} et ${last}.`);
      } else {
        const amount = Math.round((prices.reduce((s, p) => s + p, 0) / prices.length) * 100) / 100;
        const estimated =
          prices.length > 1 ||
          (ctx.uncertainGates?.has(first) ?? false) ||
          (ctx.uncertainGates?.has(last) ?? false);
        charges.push({
          id: `${first}>${last}`,
          amountEur: amount,
          source: estimated ? 'estimate' : 'official',
          from: first,
          to: last,
        });
        if (group.length > 2) {
          warnings.push(
            `${group.length - 2} gare(s) intermédiaire(s) ignorée(s) entre ${first} et ${last}.`,
          );
        }
      }
    }
    group = [];
  };

  for (const gate of gates) {
    if (gate === GATE_BREAK) {
      flush();
      continue;
    }
    const open = openByGate.get(gate);
    if (open) {
      flush();
      charges.push({
        id: open.gate,
        amountEur: openTollPrice(open, ctx.date, ctx.vehicleClass),
        source: 'official',
        from: open.name,
        to: open.name,
      });
      continue;
    }
    if (group.length > 0 && network(group[0] as string) !== network(gate)) flush();
    group.push(gate);
  }
  flush();

  return { charges, warnings };
}
