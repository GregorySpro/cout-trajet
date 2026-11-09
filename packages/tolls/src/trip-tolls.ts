import type { TollCharge } from '@cout-trajet/cost-engine';
import type { VehicleClass } from '@cout-trajet/shared';
import type { TollBook } from './book';
import { openTollPrice, type OpenToll } from './open-tolls';

export interface TripTollContext {
  book: TollBook;
  openTolls: readonly OpenToll[];
  vehicleClass: VehicleClass;
  /** Date du trajet (tarifs saisonniers). */
  date: Date;
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
 * Ce qu'on ne sait pas chiffrer est signalé dans `warnings` plutôt que deviné.
 */
export function computeTripTolls(gates: readonly string[], ctx: TripTollContext): TripTolls {
  const charges: TollCharge[] = [];
  const warnings: string[] = [];
  const openByGate = new Map(ctx.openTolls.map((t) => [t.gate, t]));

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
      const price = ctx.book.priceBetween(first, last, ctx.vehicleClass);
      if (price === undefined) {
        warnings.push(`Aucun tarif trouvé entre ${first} et ${last}.`);
      } else {
        charges.push({
          id: `${first}>${last}`,
          amountEur: price,
          source: 'official',
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
