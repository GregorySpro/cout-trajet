import { describe, expect, it } from 'vitest';
import { compareRoutes } from './compare';
import { estimateTrip } from './estimate';

const vehicle = { urban: 7, rural: 5 };

describe('compareRoutes', () => {
  // Cas inspiré de Paris → Lyon : autoroute à péage contre route sans péage.
  const fast = estimateTrip({
    segments: [{ distanceKm: 465.4, roadClass: 'motorway' }],
    vehicle,
    fuelPriceEurPerL: 1.8,
    tolls: [{ id: 'aprr', amountEur: 41.3, source: 'official' }],
  });
  const economical = estimateTrip({
    segments: [{ distanceKm: 485.7, roadClass: 'rural' }],
    vehicle,
    fuelPriceEurPerL: 1.8,
  });

  it('identifie l’itinéraire le moins cher et le plus rapide', () => {
    const c = compareRoutes(fast, economical);
    expect(c.cheapest).toBe('economical');
    expect(c.fastest).toBe('fast');
  });

  it('calcule le surcoût et les minutes gagnées', () => {
    const c = compareRoutes(fast, economical);
    expect(c.extraCostEur).toBeCloseTo(fast.totalCostEur - economical.totalCostEur, 2);
    expect(c.minutesSaved).toBe(economical.durationMin - fast.durationMin);
    expect(c.minutesSaved).toBeGreaterThan(0);
  });

  it('exprime le coût de l’heure gagnée', () => {
    const c = compareRoutes(fast, economical);
    expect(c.eurPerHourSaved).not.toBeNull();
    expect(c.eurPerHourSaved).toBeCloseTo((c.extraCostEur / c.minutesSaved) * 60, 1);
  });

  it('renvoie null quand l’itinéraire rapide n’est pas plus cher', () => {
    const cheapFast = estimateTrip({
      segments: [{ distanceKm: 100, roadClass: 'motorway' }],
      vehicle,
      fuelPriceEurPerL: 1.8,
    });
    const slow = estimateTrip({
      segments: [{ distanceKm: 150, roadClass: 'rural' }],
      vehicle: { urban: 9, rural: 9 },
      fuelPriceEurPerL: 1.8,
    });
    const c = compareRoutes(cheapFast, slow);
    expect(c.cheapest).toBe('fast');
    expect(c.eurPerHourSaved).toBeNull();
  });

  it('signale l’égalité', () => {
    const c = compareRoutes(fast, fast);
    expect(c.cheapest).toBe('equal');
    expect(c.fastest).toBe('equal');
    expect(c.eurPerHourSaved).toBeNull();
  });
});
