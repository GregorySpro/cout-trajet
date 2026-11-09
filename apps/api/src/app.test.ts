import { FuelPriceTable, type VehicleModel } from '@cout-trajet/reference-data';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from './app';
import { QuotaGuard } from './infra/quota';
import { RoutingError } from './providers/routing';
import { ApiError } from './services/estimate-service';

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
const GOLF: VehicleModel = {
  ...CLIO,
  key: 'golf',
  brand: 'VOLKSWAGEN',
  model: 'GOLF',
  label: 'GOLF',
  description: 'GOLF 1.5 eTSI',
};

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function make(over: Partial<AppDeps> = {}) {
  const calls: unknown[] = [];
  app = await buildApp({
    service: {
      async estimate(req) {
        calls.push(req);
        return { routes: [], comparison: null, warnings: [] } as never;
      },
    },
    vehicles: new Map([CLIO, GOLF].map((v) => [v.key, v])),
    fuelPrices: {
      async get() {
        return {
          table: new FuelPriceTable([
            {
              scope: 'FR',
              product: 'gazole',
              avgEurPerL: 2.2037,
              medianEurPerL: null,
              stations: 9,
            },
            { scope: 'FR', product: 'e10', avgEurPerL: 2.0425, medianEurPerL: null, stations: 9 },
          ]),
          fetchedAt: '2026-11-09T10:00:00.000Z',
          stale: false,
        };
      },
    },
    quota: new QuotaGuard(),
    rateLimit: { max: 100, timeWindow: '1 minute' },
    ...over,
  });
  return { app, calls };
}

const validBody = {
  origin: { lon: 2.3522, lat: 48.8566 },
  destination: { lon: 4.8357, lat: 45.764 },
  vehicle: { category: 'car', consumption: { urban: 7, rural: 5 } },
  fuel: { product: 'e10' },
};

describe('GET /health', () => {
  it('répond ok avec la version du moteur et le quota', async () => {
    const { app: a } = await make();
    const res = await a.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', engineVersion: '0.2.0' });
    expect(res.json().routingQuota).toEqual({ remaining: null, resetAt: null });
  });
});

describe('GET /fuel-prices', () => {
  it('renvoie les prix nationaux arrondis', async () => {
    const { app: a } = await make();
    const res = await a.inject({ method: 'GET', url: '/fuel-prices' });
    expect(res.json()).toEqual({
      fetchedAt: '2026-11-09T10:00:00.000Z',
      stale: false,
      national: { gazole: 2.204, e10: 2.043 },
    });
  });

  it('503 quand les prix sont indisponibles', async () => {
    const { app: a } = await make({ fuelPrices: { get: async () => undefined } });
    const res = await a.inject({ method: 'GET', url: '/fuel-prices' });
    expect(res.statusCode).toBe(503);
  });
});

describe('GET /vehicles', () => {
  it('cherche par marque et modèle, sans tenir compte de la casse ni des accents', async () => {
    const { app: a } = await make();
    const res = await a.inject({ method: 'GET', url: '/vehicles?q=clio' });
    expect(res.json().vehicles).toHaveLength(1);
    expect(res.json().vehicles[0]).toMatchObject({ key: 'clio-key', mixedL100: 5.5 });
    const both = await a.inject({ method: 'GET', url: '/vehicles?q=' });
    expect(both.json().vehicles).toHaveLength(2);
  });

  it('respecte la limite demandée et refuse une limite absurde', async () => {
    const { app: a } = await make();
    const one = await a.inject({ method: 'GET', url: '/vehicles?limit=1' });
    expect(one.json().vehicles).toHaveLength(1);
    const bad = await a.inject({ method: 'GET', url: '/vehicles?limit=5000' });
    expect(bad.statusCode).toBe(400);
  });
});

describe('POST /estimate', () => {
  it('transmet une requête valide au service avec les valeurs par défaut', async () => {
    const { app: a, calls } = await make();
    const res = await a.inject({ method: 'POST', url: '/estimate', payload: validBody });
    expect(res.statusCode).toBe(200);
    expect(calls[0]).toMatchObject({
      excludeVat: false,
      alternatives: true,
      includeGeometry: true,
      vehicle: { category: 'car' },
    });
  });

  it('accepte la catégorie camion sans consommation', async () => {
    const { app: a, calls } = await make();
    const res = await a.inject({
      method: 'POST',
      url: '/estimate',
      payload: {
        ...validBody,
        vehicle: {
          category: 'hgv-articulated',
          dimensions: { heightM: 4, maxWeightT: 40, axles: 5 },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(calls[0]).toMatchObject({ vehicle: { category: 'hgv-articulated' } });
  });

  it('refuse une requête mal formée avec le détail des champs en cause', async () => {
    const { app: a } = await make();
    const res = await a.inject({
      method: 'POST',
      url: '/estimate',
      payload: { ...validBody, origin: { lon: 'x', lat: 48 } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].path).toBe('origin.lon');
  });

  it('refuse un point hors de France', async () => {
    const { app: a } = await make();
    const res = await a.inject({
      method: 'POST',
      url: '/estimate',
      payload: { ...validBody, destination: { lon: -74, lat: 40.7 } },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json().issues)).toContain('hors de France');
  });

  it('refuse une date mal formée, une catégorie inconnue et un prix absurde', async () => {
    const { app: a } = await make();
    for (const patch of [
      { date: '09/11/2026' },
      { vehicle: { category: 'fusée' } },
      { fuel: { priceEurPerL: 500 } },
    ]) {
      const res = await a.inject({
        method: 'POST',
        url: '/estimate',
        payload: { ...validBody, ...patch },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('ignore les champs inconnus sans planter', async () => {
    const { app: a } = await make();
    const res = await a.inject({
      method: 'POST',
      url: '/estimate',
      payload: { ...validBody, __proto__: { admin: true }, extra: 1 },
    });
    expect(res.statusCode).toBe(200);
  });

  it('413 pour un corps trop gros', async () => {
    const { app: a } = await make();
    const res = await a.inject({
      method: 'POST',
      url: '/estimate',
      payload: { ...validBody, vehicle: { category: 'car', vehicleKey: 'x'.repeat(40_000) } },
    });
    expect(res.statusCode).toBe(413);
  });

  it('traduit les erreurs du service en codes HTTP clairs', async () => {
    const cases: [Error, number][] = [
      [new ApiError('Véhicule inconnu.', 404), 404],
      [new ApiError('Prix manquant.', 400), 400],
      [new RoutingError('Quota presque épuisé.', 'quota', true), 503],
      [new RoutingError('Aucun itinéraire.', 'no-route', false), 422],
      [new RoutingError('Routage indisponible.', 'unavailable', true), 502],
    ];
    for (const [error, status] of cases) {
      const { app: a } = await make({
        service: {
          async estimate() {
            throw error;
          },
        },
      });
      const res = await a.inject({ method: 'POST', url: '/estimate', payload: validBody });
      expect(res.statusCode).toBe(status);
      expect(res.json().message).toBe(error.message);
      await a.close();
      app = undefined;
    }
  });

  it('conseille de réessayer quand l’erreur de routage est temporaire', async () => {
    const { app: a } = await make({
      service: {
        async estimate() {
          throw new RoutingError('Quota.', 'quota', true);
        },
      },
    });
    const res = await a.inject({ method: 'POST', url: '/estimate', payload: validBody });
    expect(res.headers['retry-after']).toBe('60');
  });

  it('500 sans fuite d’information sur une erreur inattendue', async () => {
    const { app: a } = await make({
      service: {
        async estimate() {
          throw new Error('mot de passe de la base : secret');
        },
      },
    });
    const res = await a.inject({ method: 'POST', url: '/estimate', payload: validBody });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret');
  });
});

describe('sécurité et limites', () => {
  it('répond 404 sur une route inconnue', async () => {
    const { app: a } = await make();
    const res = await a.inject({ method: 'GET', url: '/admin' });
    expect(res.statusCode).toBe(404);
  });

  it('limite le débit par client (429 au-delà du maximum)', async () => {
    const { app: a } = await make({ rateLimit: { max: 2, timeWindow: '1 minute' } });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await a.inject({ method: 'POST', url: '/estimate', payload: validBody });
      codes.push(res.statusCode);
    }
    expect(codes).toEqual([200, 200, 429, 429]);
  });

  it('autorise seulement l’origine configurée pour CORS', async () => {
    const { app: a } = await make({ allowedOrigins: ['https://site.exemple'] });
    const ok = await a.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://site.exemple' },
    });
    expect(ok.headers['access-control-allow-origin']).toBe('https://site.exemple');
    const bad = await a.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://pirate.exemple' },
    });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sans origine configurée, aucun en-tête CORS n’est envoyé', async () => {
    const { app: a } = await make();
    const res = await a.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://x.exemple' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
