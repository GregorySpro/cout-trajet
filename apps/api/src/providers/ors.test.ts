import { describe, expect, it } from 'vitest';
import { TtlCache } from '../infra/cache';
import { QuotaGuard } from '../infra/quota';
import { OpenRouteServiceProvider, type HttpFetch } from './ors';
import { RoutingError, type RouteRequest, type RouteResult } from './routing';

const coords = Array.from({ length: 11 }, (_, i) => [2 + i * 0.01, 48] as [number, number]);

function okBody() {
  return {
    features: [
      {
        geometry: { coordinates: coords },
        properties: {
          summary: { distance: 7.4, duration: 300 },
          extras: { waycategory: { values: [[0, 10, 3]] } },
        },
      },
    ],
  };
}

interface Call {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function makeFetch(
  respond: () => { status?: number; headers?: Record<string, string>; json?: unknown },
  calls: Call[] = [],
): HttpFetch {
  return async (url, init) => {
    calls.push({
      url,
      body: JSON.parse(init.body) as Record<string, unknown>,
      headers: init.headers,
    });
    const r = respond();
    const status = r.status ?? 200;
    const headers = r.headers ?? {
      'x-ratelimit-remaining': '150',
      'x-ratelimit-reset': '1794304589',
    };
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      json: async () => r.json ?? okBody(),
    };
  };
}

const request: RouteRequest = {
  origin: { lon: 2.3522, lat: 48.8566 },
  destination: { lon: 4.8357, lat: 45.764 },
  profile: 'driving-car',
  avoidTolls: false,
};

function provider(fetchFn: HttpFetch, quota = new QuotaGuard(20)) {
  const cache = new TtlCache<RouteResult>(60_000, 10);
  return {
    provider: new OpenRouteServiceProvider({ apiKey: 'cle-de-test', fetchFn, quota, cache }),
    quota,
  };
}

describe('OpenRouteServiceProvider', () => {
  it('appelle le profil voiture avec les infos utiles et renvoie un itinéraire segmenté', async () => {
    const calls: Call[] = [];
    const { provider: p } = provider(makeFetch(() => ({}), calls));
    const result = await p.route(request);
    expect(calls[0]?.url).toBe(
      'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
    );
    expect(calls[0]?.headers['Authorization']).toBe('cle-de-test');
    expect(calls[0]?.body['extra_info']).toEqual(['waycategory', 'waytype', 'tollways']);
    expect(calls[0]?.body['instructions']).toBe(true);
    expect(calls[0]?.body['options']).toBeUndefined();
    expect(result.distanceKm).toBe(7.4);
    expect(result.segments[0]?.roadClass).toBe('motorway');
    expect(result.coordinates).toHaveLength(11);
  });

  it('demande d’éviter les péages', async () => {
    const calls: Call[] = [];
    const { provider: p } = provider(makeFetch(() => ({}), calls));
    await p.route({ ...request, avoidTolls: true });
    expect(calls[0]?.body['options']).toEqual({ avoid_features: ['tollways'] });
  });

  it('utilise le profil poids lourd avec ses restrictions de hauteur et de poids', async () => {
    const calls: Call[] = [];
    const { provider: p } = provider(makeFetch(() => ({}), calls));
    await p.route({
      ...request,
      profile: 'driving-hgv',
      restrictions: { heightM: 4, weightT: 40 },
    });
    expect(calls[0]?.url).toContain('/driving-hgv/');
    expect(calls[0]?.body['options']).toEqual({
      profile_params: { restrictions: { height: 4, weight: 40 } },
    });
  });

  it('place les escales entre le départ et l’arrivée et les distingue dans le cache', async () => {
    const calls: Call[] = [];
    const { provider: p } = provider(makeFetch(() => ({}), calls));
    await p.route({ ...request, via: [{ lon: 3.1, lat: 47.2 }] });
    expect(calls[0]?.body['coordinates']).toEqual([
      [2.3522, 48.8566],
      [3.1, 47.2],
      [4.8357, 45.764],
    ]);
    await p.route(request); // sans escale : autre trajet, donc autre appel
    expect(calls).toHaveLength(2);
  });

  it('ne consomme pas le quota pour une requête déjà en cache', async () => {
    const calls: Call[] = [];
    const { provider: p } = provider(makeFetch(() => ({}), calls));
    await p.route(request);
    await p.route({ ...request, origin: { lon: 2.35221, lat: 48.85661 } }); // même point à 4 décimales
    expect(calls).toHaveLength(1);
  });

  it('distingue le cache selon l’évitement des péages', async () => {
    const calls: Call[] = [];
    const { provider: p } = provider(makeFetch(() => ({}), calls));
    await p.route(request);
    await p.route({ ...request, avoidTolls: true });
    expect(calls).toHaveLength(2);
  });

  it('met à jour le quota depuis les en-têtes', async () => {
    const { provider: p, quota } = provider(makeFetch(() => ({})));
    await p.route(request);
    expect(quota.snapshot().remaining).toBe(150);
  });

  it('refuse l’itinéraire sans péage (facultatif) quand la réserve est entamée, pas l’essentiel', async () => {
    const quota = new QuotaGuard(20);
    quota.update({ remaining: '20', resetEpochSec: null });
    const { provider: p } = provider(
      makeFetch(() => ({})),
      quota,
    );
    await expect(p.route({ ...request, avoidTolls: true })).rejects.toMatchObject({
      name: 'RoutingError',
      code: 'quota',
    });
    await expect(p.route(request)).resolves.toBeDefined();
  });

  it('un 429 marque le quota comme épuisé', async () => {
    const { provider: p, quota } = provider(
      makeFetch(() => ({ status: 429, headers: { 'x-ratelimit-reset': '9999999999' } })),
    );
    await expect(p.route(request)).rejects.toMatchObject({ code: 'quota', retryable: true });
    expect(quota.snapshot().remaining).toBe(0);
    await expect(p.route({ ...request, origin: { lon: 3, lat: 47 } })).rejects.toMatchObject({
      code: 'quota',
    });
  });

  it('traduit 404 en « aucun itinéraire » (non réessayable)', async () => {
    const { provider: p } = provider(makeFetch(() => ({ status: 404 })));
    await expect(p.route(request)).rejects.toMatchObject({ code: 'no-route', retryable: false });
  });

  it('traduit une erreur serveur en « indisponible » (réessayable)', async () => {
    const { provider: p } = provider(makeFetch(() => ({ status: 503 })));
    await expect(p.route(request)).rejects.toMatchObject({ code: 'unavailable', retryable: true });
  });

  it('traduit une panne réseau en « indisponible »', async () => {
    const fetchFn: HttpFetch = async () => {
      throw new Error('réseau coupé');
    };
    const { provider: p } = provider(fetchFn);
    await expect(p.route(request)).rejects.toBeInstanceOf(RoutingError);
    await expect(p.route(request)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('refuse une réponse sans itinéraire', async () => {
    const { provider: p } = provider(makeFetch(() => ({ json: { features: [] } })));
    await expect(p.route(request)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('ne met pas une erreur en cache', async () => {
    let fail = true;
    const calls: Call[] = [];
    const { provider: p } = provider(makeFetch(() => (fail ? { status: 503 } : {}), calls));
    await expect(p.route(request)).rejects.toBeDefined();
    fail = false;
    await expect(p.route(request)).resolves.toBeDefined();
    expect(calls).toHaveLength(2);
  });
});
