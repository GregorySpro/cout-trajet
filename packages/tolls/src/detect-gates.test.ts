import { describe, expect, it } from 'vitest';
import { detectGatesOnRoute, type LonLat } from './detect-gates';

// Tracé rectiligne ouest → est à 48° de latitude, sur ~0,2° de longitude (≈ 15 km).
const route: LonLat[] = Array.from({ length: 21 }, (_, i) => [2 + i * 0.01, 48] as const);
const DEG_LAT_PER_METER = 1 / 110_540;

describe('detectGatesOnRoute', () => {
  it('garde les gares sur le tracé (≤ 10 m) et écarte celles des bretelles', () => {
    const found = detectGatesOnRoute(route, [
      { name: 'Sur le tracé', lat: 48, lon: 2.05 },
      { name: 'À 5 m', lat: 48 + 5 * DEG_LAT_PER_METER, lon: 2.1 },
      { name: 'À 50 m (bretelle)', lat: 48 + 50 * DEG_LAT_PER_METER, lon: 2.15 },
    ]);
    expect(found.map((g) => g.name)).toEqual(['Sur le tracé', 'À 5 m']);
    expect(found[0]?.distanceM).toBe(0);
    expect(found[1]?.distanceM).toBeCloseTo(5, 0);
  });

  it('trie les gares par position le long du tracé, quel que soit l’ordre d’entrée', () => {
    const found = detectGatesOnRoute(route, [
      { name: 'B', lat: 48, lon: 2.15 },
      { name: 'A', lat: 48, lon: 2.05 },
    ]);
    expect(found.map((g) => g.name)).toEqual(['A', 'B']);
    expect(found[0]?.alongM).toBeLessThan(found[1]?.alongM ?? 0);
  });

  it('respecte le seuil demandé', () => {
    const booth = { name: 'À 30 m', lat: 48 + 30 * DEG_LAT_PER_METER, lon: 2.1 };
    expect(detectGatesOnRoute(route, [booth], 10)).toHaveLength(0);
    expect(detectGatesOnRoute(route, [booth], 50)).toHaveLength(1);
  });

  it('transmet l’opérateur quand il est connu', () => {
    const found = detectGatesOnRoute(route, [{ name: 'X', operator: 'APRR', lat: 48, lon: 2.1 }]);
    expect(found[0]?.operator).toBe('APRR');
  });

  it('ne trouve rien sur un tracé trop court', () => {
    expect(detectGatesOnRoute([[2, 48]], [{ name: 'X', lat: 48, lon: 2 }])).toEqual([]);
  });
});
