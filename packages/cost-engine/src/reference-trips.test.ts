import { describe, expect, it } from 'vitest';
import type { TollCharge } from './index';
import { estimateTrip } from './index';
import data from './__fixtures__/reference-trips.json';

interface ReferenceTrip {
  id: string;
  name: string;
  distanceKm: number;
  tolls: TollCharge[];
  expectedTollEur: number;
}

const trips = data.trips as ReferenceTrip[];
const vehicle = { urban: 7, rural: 5 }; // véhicule type, sans lien avec un modèle réel

describe('trajets de référence (spike S3)', () => {
  it('contient les 7 trajets à péage documentés', () => {
    expect(trips.map((t) => t.id)).toEqual(['T01', 'T02', 'T03', 'T04', 'T07', 'T09', 'T10']);
  });

  describe.each(trips)('$id — $name', (trip) => {
    const estimate = estimateTrip({
      segments: [{ distanceKm: trip.distanceKm, roadClass: 'motorway' }],
      vehicle,
      fuelPriceEurPerL: 1.8,
      tolls: trip.tolls,
    });

    it('reproduit le péage officiel (objectif : écart ≤ 10 %)', () => {
      const errorPct =
        (Math.abs(estimate.tollCostEur - trip.expectedTollEur) / trip.expectedTollEur) * 100;
      expect(errorPct).toBeLessThanOrEqual(10);
      expect(estimate.tollCostEur).toBe(trip.expectedTollEur);
    });

    it('donne un coût de carburant plausible (4 à 9 L/100 km)', () => {
      expect(estimate.fuelLiters).toBeGreaterThan(trip.distanceKm * 0.04);
      expect(estimate.fuelLiters).toBeLessThan(trip.distanceKm * 0.09);
    });

    it('somme carburant et péages dans le total', () => {
      expect(estimate.totalCostEur).toBeCloseTo(estimate.fuelCostEur + estimate.tollCostEur, 2);
    });

    it('n’ajoute aucune incertitude de péage pour un tarif officiel', () => {
      const fuelOnlyMargin = estimate.fuelCostEur * 0.1;
      expect(estimate.range.highEur - estimate.totalCostEur).toBeCloseTo(fuelOnlyMargin, 1);
    });
  });
});
