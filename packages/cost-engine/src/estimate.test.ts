import { describe, expect, it } from 'vitest';
import { estimateTrip } from './estimate';

const vehicle = { urban: 7, rural: 5 };

describe('estimateTrip', () => {
  it('200 km d’autoroute à 130 km/h avec 20 € de péage officiel', () => {
    const e = estimateTrip({
      segments: [{ distanceKm: 200, roadClass: 'motorway' }],
      vehicle,
      fuelPriceEurPerL: 1.8,
      tolls: [{ id: 't', amountEur: 20, source: 'official' }],
    });
    expect(e.distanceKm).toBe(200);
    expect(e.durationMin).toBe(92);
    expect(e.fuelLiters).toBeCloseTo(13.18, 2);
    expect(e.fuelCostEur).toBeCloseTo(23.73, 2);
    expect(e.tollCostEur).toBe(20);
    expect(e.totalCostEur).toBeCloseTo(43.73, 2);
  });

  it('la fourchette n’inclut que l’incertitude carburant quand le péage est officiel', () => {
    const e = estimateTrip({
      segments: [{ distanceKm: 200, roadClass: 'motorway' }],
      vehicle,
      fuelPriceEurPerL: 1.8,
      tolls: [{ id: 't', amountEur: 20, source: 'official' }],
    });
    expect(e.range.lowEur).toBeCloseTo(41.35, 2);
    expect(e.range.highEur).toBeCloseTo(46.1, 2);
  });

  it('un péage estimé élargit la fourchette de ±15 %', () => {
    const e = estimateTrip({
      segments: [],
      vehicle,
      fuelPriceEurPerL: 1.8,
      tolls: [{ id: 't', amountEur: 10, source: 'estimate' }],
    });
    expect(e.totalCostEur).toBe(10);
    expect(e.range).toEqual({ lowEur: 8.5, highEur: 11.5 });
  });

  it('additionne ville, route et autoroute (8,7 L, 17,40 €, 112 min)', () => {
    const e = estimateTrip({
      segments: [
        { distanceKm: 10, roadClass: 'urban' },
        { distanceKm: 50, roadClass: 'rural' },
        { distanceKm: 100, roadClass: 'motorway' },
      ],
      vehicle,
      fuelPriceEurPerL: 2,
      speeds: { motorwayKmh: 110 },
    });
    expect(e.fuelLiters).toBeCloseTo(8.7, 2);
    expect(e.fuelCostEur).toBeCloseTo(17.4, 2);
    expect(e.durationMin).toBe(112);
    expect(e.byRoadClass.urban.distanceKm).toBe(10);
    expect(e.byRoadClass.motorway.fuelLiters).toBeCloseTo(5.5, 2);
  });

  it('rouler à 110 plutôt que 130 réduit le coût mais allonge la durée', () => {
    const base = {
      segments: [{ distanceKm: 300, roadClass: 'motorway' as const }],
      vehicle,
      fuelPriceEurPerL: 1.8,
    };
    const fast = estimateTrip({ ...base, speeds: { motorwayKmh: 130 } });
    const calm = estimateTrip({ ...base, speeds: { motorwayKmh: 110 } });
    expect(calm.totalCostEur).toBeLessThan(fast.totalCostEur);
    expect(calm.durationMin).toBeGreaterThan(fast.durationMin);
  });

  it('plafonne la vitesse par la limite du tronçon', () => {
    const e = estimateTrip({
      segments: [{ distanceKm: 110, roadClass: 'motorway', speedLimitKmh: 110 }],
      vehicle,
      fuelPriceEurPerL: 1.8,
    });
    expect(e.durationMin).toBe(60);
    expect(e.fuelLiters).toBeCloseTo(6.05, 2);
  });

  it('sans tronçon ni péage, le coût est nul', () => {
    const e = estimateTrip({ segments: [], vehicle, fuelPriceEurPerL: 1.8 });
    expect(e.totalCostEur).toBe(0);
    expect(e.range).toEqual({ lowEur: 0, highEur: 0 });
  });

  describe('validation', () => {
    const ok = { segments: [{ distanceKm: 10, roadClass: 'rural' as const }], vehicle };

    it('refuse un prix de carburant nul ou négatif', () => {
      expect(() => estimateTrip({ ...ok, fuelPriceEurPerL: 0 })).toThrow(RangeError);
      expect(() => estimateTrip({ ...ok, fuelPriceEurPerL: -1 })).toThrow(RangeError);
    });

    it('refuse une consommation nulle', () => {
      expect(() =>
        estimateTrip({ ...ok, vehicle: { urban: 0, rural: 5 }, fuelPriceEurPerL: 1.8 }),
      ).toThrow(RangeError);
    });

    it('refuse une distance négative', () => {
      expect(() =>
        estimateTrip({
          segments: [{ distanceKm: -1, roadClass: 'rural' }],
          vehicle,
          fuelPriceEurPerL: 1.8,
        }),
      ).toThrow(RangeError);
    });

    it('refuse un péage négatif', () => {
      expect(() =>
        estimateTrip({
          ...ok,
          fuelPriceEurPerL: 1.8,
          tolls: [{ id: 't', amountEur: -5, source: 'official' }],
        }),
      ).toThrow(RangeError);
    });

    it('refuse une vitesse nulle', () => {
      expect(() =>
        estimateTrip({ ...ok, fuelPriceEurPerL: 1.8, speeds: { motorwayKmh: 0 } }),
      ).toThrow(RangeError);
    });
  });
});
