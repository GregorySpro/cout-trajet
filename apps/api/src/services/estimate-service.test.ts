import { FuelPriceTable, type VehicleModel } from '@cout-trajet/reference-data';
import { TollBook, type OsmBooth, type PricePair } from '@cout-trajet/tolls';
import { describe, expect, it } from 'vitest';
import {
  RoutingError,
  type RouteRequest,
  type RouteResult,
  type RoutingProvider,
} from '../providers/routing';
import { ApiError, EstimateService, type EstimateRequest } from './estimate-service';
import type { FuelPriceSource } from './fuel-price-source';

// --- Données de test : Paris → Lyon par l'A6 (APRR), péage officiel 41,30 € ---
const FLEURY: [number, number] = [2.54044, 48.42591];
const LIMAS: [number, number] = [4.73291, 45.97301];

const booths: OsmBooth[] = [
  { name: 'Péage de Fleury-en-Bière', operator: 'APRR', lat: FLEURY[1], lon: FLEURY[0] },
  { name: 'Péage de Villefranche-Limas', operator: 'APRR', lat: LIMAS[1], lon: LIMAS[0] },
];

function pair(from: string, to: string, c1: number): PricePair {
  return {
    concession: 'APRR',
    from,
    to,
    distanceKm: null,
    prices: { 1: c1, 2: c1 * 1.5, 3: c1 * 2.4, 4: c1 * 3.4, 5: c1 * 0.6 },
  };
}
const book = new TollBook([pair('APRR:FLEURY-EN-BIERE', 'APRR:VILLEFRANCHE-LIMAS', 41.3)]);

const tollRoute: RouteResult = {
  distanceKm: 465.4,
  providerDurationMin: 273,
  coordinates: [[2.3522, 48.8566], FLEURY, LIMAS, [4.8357, 45.764]],
  segments: [
    { distanceKm: 40, roadClass: 'urban' },
    { distanceKm: 425, roadClass: 'motorway' },
  ],
  tolledKm: 400,
  ferryKm: 0,
};
const freeRoute: RouteResult = {
  distanceKm: 485.7,
  providerDurationMin: 436,
  coordinates: [
    [2.3522, 48.8566],
    [3.2, 47.5],
    [4.8357, 45.764],
  ],
  segments: [
    { distanceKm: 60, roadClass: 'urban' },
    { distanceKm: 425.7, roadClass: 'rural' },
  ],
  tolledKm: 0,
  ferryKm: 0,
};

function fakeRouting(routes: { toll: RouteResult; free?: RouteResult | Error }) {
  const calls: RouteRequest[] = [];
  const provider: RoutingProvider = {
    async route(req) {
      calls.push(req);
      if (!req.avoidTolls) return routes.toll;
      if (routes.free instanceof Error) throw routes.free;
      return routes.free ?? routes.toll;
    },
  };
  return { provider, calls };
}

const fuelPrices: FuelPriceSource = {
  async get() {
    return {
      table: new FuelPriceTable([
        { scope: 'FR', product: 'e10', avgEurPerL: 2.0, medianEurPerL: null, stations: 100 },
        { scope: 'FR', product: 'gazole', avgEurPerL: 2.2, medianEurPerL: null, stations: 100 },
      ]),
      fetchedAt: '2026-11-09T10:00:00.000Z',
      stale: false,
    };
  },
};

const CLIO: VehicleModel = {
  key: 'clio-key',
  brand: 'RENAULT',
  model: 'CLIO',
  label: 'CLIO',
  description: 'CLIO TCe 100',
  fuel: 'gasoline',
  hybrid: false,
  gearbox: 'MANUELLE',
  powerKw: 74,
  co2MixedGPerKm: 120,
  priceEur: 20000,
  l100: { low: 7, medium: 5.5, high: 4.8, extraHigh: 5.6, mixed: 5.5 },
  source: 'ademe-car-labelling',
};

function service(routing: RoutingProvider, extra: { vehicles?: VehicleModel[] } = {}) {
  return new EstimateService({
    routing,
    booths,
    book,
    fuelPrices,
    vehicles: new Map((extra.vehicles ?? [CLIO]).map((v) => [v.key, v])),
  });
}

const baseRequest: EstimateRequest = {
  origin: { lon: 2.3522, lat: 48.8566 },
  destination: { lon: 4.8357, lat: 45.764 },
  vehicle: { category: 'car', consumption: { urban: 7, rural: 5, motorway: 5.5 } },
  fuel: { product: 'e10' },
  date: new Date('2026-11-09T12:00:00Z'),
  excludeVat: false,
  alternatives: true,
  includeGeometry: false,
};

describe('EstimateService — voiture', () => {
  it('calcule carburant et péage officiel (41,30 € Fleury → Limas) avec le prix national', async () => {
    const { provider, calls } = fakeRouting({ toll: tollRoute, free: freeRoute });
    const r = await service(provider).estimate({ ...baseRequest, alternatives: false });
    const fast = r.routes[0];
    expect(fast?.kind).toBe('fastest');
    expect(fast?.tolls.gates).toEqual(['APRR:FLEURY-EN-BIERE', 'APRR:VILLEFRANCHE-LIMAS']);
    expect(fast?.tolls.charges[0]?.amountEur).toBe(41.3);
    expect(fast?.tolls.complete).toBe(true);
    expect(fast?.estimate.tollCostEur).toBe(41.3);
    expect(fast?.estimate.fuelCostEur).toBeGreaterThan(0);
    expect(r.fuelPrice).toMatchObject({
      product: 'e10',
      eurPerL: 2.0,
      source: 'national-average',
      fetchedAt: '2026-11-09T10:00:00.000Z',
    });
    expect(calls).toHaveLength(1);
  });

  it('propose l’itinéraire sans péage et compare (surcoût, minutes gagnées)', async () => {
    const { provider, calls } = fakeRouting({ toll: tollRoute, free: freeRoute });
    const r = await service(provider).estimate(baseRequest);
    expect(calls.map((c) => c.avoidTolls)).toEqual([false, true]);
    expect(r.routes.map((x) => x.kind)).toEqual(['fastest', 'noToll']);
    expect(r.routes[1]?.tolls.charges).toEqual([]);
    expect(r.comparison?.cheapest).toBe('economical');
    expect(r.comparison?.fastest).toBe('fast');
    expect(r.comparison?.extraCostEur).toBeGreaterThan(0);
  });

  it('ne demande pas d’itinéraire sans péage quand l’itinéraire rapide n’en a pas (économie de quota)', async () => {
    const { provider, calls } = fakeRouting({ toll: freeRoute });
    const r = await service(provider).estimate(baseRequest);
    expect(calls).toHaveLength(1);
    expect(r.routes).toHaveLength(1);
    expect(r.comparison).toBeNull();
  });

  it('écarte l’alternative identique à l’itinéraire rapide', async () => {
    const { provider } = fakeRouting({ toll: tollRoute, free: { ...tollRoute } });
    const r = await service(provider).estimate(baseRequest);
    expect(r.routes).toHaveLength(1);
  });

  it('continue avec un avertissement si l’itinéraire sans péage est indisponible', async () => {
    const { provider } = fakeRouting({
      toll: tollRoute,
      free: new RoutingError('Quota presque épuisé.', 'quota', true),
    });
    const r = await service(provider).estimate(baseRequest);
    expect(r.routes).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes('sans péage indisponible'))).toBe(true);
  });

  it('ne compare pas les itinéraires quand le péage du rapide est incomplet (comparaison trompeuse)', async () => {
    // L'itinéraire rapide passe par des gares sans correspondance : péage de 0 € à tort.
    const unknownGates: RouteResult = {
      ...tollRoute,
      coordinates: [
        [2.3522, 48.8566],
        [3.2, 47.5],
        [4.8357, 45.764],
      ],
      tolledKm: 300,
    };
    const { provider } = fakeRouting({ toll: unknownGates, free: freeRoute });
    const r = await service(provider).estimate(baseRequest);
    expect(r.routes.map((x) => x.kind)).toEqual(['fastest', 'noToll']);
    expect(r.routes[0]?.tolls.complete).toBe(false);
    expect(r.comparison).toBeNull();
    expect(r.warnings.some((w) => w.includes('Comparaison indisponible'))).toBe(true);
  });

  it('une erreur du routage de base remonte (pas de résultat sans itinéraire)', async () => {
    const provider: RoutingProvider = {
      async route() {
        throw new RoutingError('indisponible', 'unavailable', true);
      },
    };
    await expect(service(provider).estimate(baseRequest)).rejects.toBeInstanceOf(RoutingError);
  });

  it('utilise un véhicule ADEME : consommation du modèle et carburant E10', async () => {
    const { provider } = fakeRouting({ toll: freeRoute });
    const r = await service(provider).estimate({
      ...baseRequest,
      vehicle: { category: 'car', vehicleKey: 'clio-key' },
      fuel: {},
    });
    expect(r.vehicle.label).toBe('RENAULT CLIO TCe 100');
    expect(r.vehicle.consumption).toEqual({ urban: 7, rural: 4.8, motorway: 5.6 });
    expect(r.fuelPrice.product).toBe('e10');
  });

  it('prend le prix fourni par l’utilisateur sans interroger les prix nationaux', async () => {
    let asked = 0;
    const counting: FuelPriceSource = {
      async get() {
        asked++;
        return undefined;
      },
    };
    const { provider } = fakeRouting({ toll: freeRoute });
    const s = new EstimateService({
      routing: provider,
      booths,
      book,
      fuelPrices: counting,
      vehicles: new Map(),
    });
    const r = await s.estimate({ ...baseRequest, fuel: { priceEurPerL: 1.95 } });
    expect(r.fuelPrice).toMatchObject({ eurPerL: 1.95, source: 'request' });
    expect(asked).toBe(0);
  });

  it('signale des km à péage sans gare identifiée (péage possiblement sous-estimé)', async () => {
    const route: RouteResult = {
      ...tollRoute,
      coordinates: [
        [2.3522, 48.8566],
        [4.8357, 45.764],
      ],
      tolledKm: 60,
    };
    const { provider } = fakeRouting({ toll: route });
    const r = await service(provider).estimate({ ...baseRequest, alternatives: false });
    const fast = r.routes[0];
    expect(fast?.tolls.complete).toBe(false);
    expect(fast?.warnings.some((w) => w.includes('sans gare identifiée'))).toBe(true);
  });

  it('signale un bac (tarif non compté)', async () => {
    const { provider } = fakeRouting({ toll: { ...freeRoute, ferryKm: 0.5 } });
    const r = await service(provider).estimate(baseRequest);
    expect(r.routes[0]?.warnings.some((w) => w.includes('bac'))).toBe(true);
  });

  it('inclut le tracé simplifié à la demande', async () => {
    const { provider } = fakeRouting({ toll: freeRoute });
    const withGeometry = await service(provider).estimate({
      ...baseRequest,
      includeGeometry: true,
    });
    expect(withGeometry.routes[0]?.geometry?.length).toBeGreaterThanOrEqual(2);
    const without = await service(provider).estimate(baseRequest);
    expect(without.routes[0]?.geometry).toBeUndefined();
  });

  it('calcule hors taxes quand on le demande', async () => {
    const { provider } = fakeRouting({ toll: tollRoute });
    const s = service(provider);
    const ttc = await s.estimate({ ...baseRequest, alternatives: false });
    const ht = await s.estimate({ ...baseRequest, alternatives: false, excludeVat: true });
    expect(ht.routes[0]?.estimate.tollCostEur).toBeCloseTo(41.3 / 1.2, 2);
    expect(ht.routes[0]?.estimate.totalCostEur).toBeLessThan(
      ttc.routes[0]?.estimate.totalCostEur ?? 0,
    );
  });
});

describe('EstimateService — validation', () => {
  const { provider } = fakeRouting({ toll: freeRoute });

  it('404 pour un véhicule inconnu', async () => {
    await expect(
      service(provider).estimate({
        ...baseRequest,
        vehicle: { category: 'car', vehicleKey: 'inconnu' },
      }),
    ).rejects.toMatchObject({ name: 'ApiError', status: 404 });
  });

  it('400 sans consommation pour une voiture', async () => {
    await expect(
      service(provider).estimate({ ...baseRequest, vehicle: { category: 'car' } }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('400 sans carburant ni prix', async () => {
    await expect(service(provider).estimate({ ...baseRequest, fuel: {} })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('400 quand les prix nationaux sont indisponibles et qu’aucun prix n’est fourni', async () => {
    const s = new EstimateService({
      routing: provider,
      booths,
      book,
      fuelPrices: { get: async () => undefined },
      vehicles: new Map(),
    });
    await expect(s.estimate(baseRequest)).rejects.toMatchObject({ status: 400 });
  });
});

describe('EstimateService — camions', () => {
  it('un ensemble articulé n’a besoin ni de consommation ni de carburant : gazole et classe 4', async () => {
    const { provider, calls } = fakeRouting({ toll: tollRoute, free: freeRoute });
    const r = await service(provider).estimate({
      ...baseRequest,
      vehicle: {
        category: 'hgv-articulated',
        dimensions: { heightM: 4, maxWeightT: 40, axles: 5 },
      },
      fuel: {},
      alternatives: false,
    });
    expect(r.vehicle.tollClass).toBe(4);
    expect(r.vehicle.consumption).toBe('default-for-category');
    expect(r.fuelPrice.product).toBe('gazole');
    expect(r.fuelPrice.eurPerL).toBe(2.2);
    // Classe 4 : 41,30 × 3,4 dans la grille de test.
    expect(r.routes[0]?.tolls.charges[0]?.amountEur).toBeCloseTo(140.42, 2);
    // Profil poids lourd et restrictions transmis au routage.
    expect(calls[0]?.profile).toBe('driving-hgv');
    expect(calls[0]?.restrictions).toEqual({ heightM: 4, weightT: 40 });
    // Pauses réglementaires dans la durée.
    expect(r.routes[0]?.estimate.breaksMin).toBeGreaterThan(0);
  });

  it('un camping-car utilise le profil voiture et prévient pour les restrictions', async () => {
    const { provider, calls } = fakeRouting({ toll: freeRoute });
    const r = await service(provider).estimate({
      ...baseRequest,
      vehicle: {
        category: 'motorhome',
        consumption: { urban: 14, rural: 11, motorway: 12 },
        tollClass: 2,
      },
    });
    expect(calls[0]?.profile).toBe('driving-car');
    expect(r.vehicle.tollClass).toBe(2);
    expect(r.warnings.some((w) => w.includes('poids lourds'))).toBe(true);
  });

  it('la classe de péage saisie l’emporte sur celle déduite des dimensions', async () => {
    const { provider } = fakeRouting({ toll: freeRoute });
    const r = await service(provider).estimate({
      ...baseRequest,
      vehicle: {
        category: 'car',
        consumption: { urban: 7, rural: 5 },
        tollClass: 2,
        dimensions: { heightM: 1.5, maxWeightT: 2, axles: 2 },
      },
    });
    expect(r.vehicle.tollClass).toBe(2);
  });
});
