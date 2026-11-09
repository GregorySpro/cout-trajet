import { describe, expect, it } from 'vitest';
import { segmentRoute, type OrsRoute } from './segmentation';

// Tracé rectiligne ouest → est : 101 points tous les 0,001° de longitude (≈ 74 m à 48° N).
const coords = Array.from({ length: 101 }, (_, i) => [2 + i * 0.001, 48] as [number, number]);

function route(overrides: Partial<OrsRoute['properties']> = {}): OrsRoute {
  return {
    geometry: { coordinates: coords },
    properties: {
      summary: { distance: 7.4, duration: 480 },
      ...overrides,
    },
  };
}

const sum = (segs: { distanceKm: number }[]) => segs.reduce((s, x) => s + x.distanceKm, 0);

describe('segmentRoute', () => {
  it('classe en autoroute les points marqués « Highway » (waycategory & 1)', () => {
    const r = segmentRoute(
      route({
        extras: {
          waycategory: {
            values: [
              [0, 30, 0],
              [30, 70, 3], // autoroute à péage (1 + 2)
              [70, 100, 1], // autoroute gratuite
            ],
          },
        },
      }),
    );
    const motorway = r.segments.filter((s) => s.roadClass === 'motorway');
    expect(motorway).toHaveLength(1); // les deux plages se fondent en un seul tronçon
    expect(motorway[0]?.distanceKm).toBeCloseTo(7.4 * 0.7, 1);
  });

  it('distingue ville et route selon la vitesse moyenne du pas de guidage', () => {
    const r = segmentRoute(
      route({
        segments: [
          {
            steps: [
              { distance: 2.22, duration: 400, way_points: [0, 30] }, // 20 km/h
              { distance: 5.18, duration: 240, way_points: [30, 100] }, // 78 km/h
            ],
          },
        ],
      }),
    );
    expect(r.segments.map((s) => s.roadClass)).toEqual(['urban', 'rural']);
  });

  it('recale la somme des tronçons sur la distance officielle', () => {
    const r = segmentRoute(route());
    expect(sum(r.segments)).toBeCloseTo(7.4, 6);
  });

  it('mesure les km « à péage » (extra-info tollways) et les bacs (waytype 9)', () => {
    const r = segmentRoute(
      route({
        extras: {
          tollways: {
            values: [
              [0, 50, 0],
              [50, 100, 1],
            ],
          },
          waytype: {
            values: [
              [0, 90, 1],
              [90, 100, 9],
            ],
          },
        },
      }),
    );
    expect(r.tolledKm).toBeCloseTo(3.7, 1);
    expect(r.ferryKm).toBeCloseTo(0.74, 1);
  });

  it('donne les plages « à péage » en km depuis le départ, fusionnées quand elles se touchent', () => {
    const r = segmentRoute(
      route({
        extras: {
          tollways: {
            values: [
              [0, 20, 0],
              [20, 40, 1],
              [40, 60, 1], // se fond avec la précédente
              [60, 80, 0],
              [80, 100, 1],
            ],
          },
        },
      }),
    );
    expect(r.tolledSpans).toHaveLength(2);
    expect(r.tolledSpans[0]?.fromKm).toBeCloseTo(1.48, 1); // 20 % de 7,4 km
    expect(r.tolledSpans[0]?.toKm).toBeCloseTo(4.44, 1); // 60 %
    expect(r.tolledSpans[1]?.fromKm).toBeCloseTo(5.92, 1); // 80 %
    expect(r.tolledSpans[1]?.toKm).toBeCloseTo(7.4, 1);
    const total = r.tolledSpans.reduce((s, x) => s + (x.toKm - x.fromKm), 0);
    expect(total).toBeCloseTo(r.tolledKm, 6);
  });

  it('mesure les routes à accès restreint (poids lourds)', () => {
    const r = segmentRoute(
      route({
        extras: {
          roadaccessrestrictions: {
            values: [
              [0, 50, 0],
              [50, 80, 8], // livraison seule
              [80, 100, 0],
            ],
          },
        },
      }),
    );
    expect(r.restrictedKm).toBeCloseTo(7.4 * 0.3, 1);
  });

  it('sans informations, tout est « route »', () => {
    const r = segmentRoute(route());
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]?.roadClass).toBe('rural');
  });

  it('renvoie un résultat vide pour un tracé d’un seul point', () => {
    const r = segmentRoute({
      geometry: { coordinates: [[2, 48]] },
      properties: { summary: { distance: 0, duration: 0 } },
    });
    expect(r).toEqual({ segments: [], tolledKm: 0, tolledSpans: [], ferryKm: 0, restrictedKm: 0 });
  });
});
