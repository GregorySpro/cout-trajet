import type { LonLat } from '@cout-trajet/tolls';
import type { TtlCache } from '../infra/cache';
import type { QuotaGuard } from '../infra/quota';
import { RoutingError, type RouteRequest, type RouteResult, type RoutingProvider } from './routing';
import { segmentRoute, type OrsRoute } from './segmentation';

/** Sous-ensemble de `fetch` utilisé ici, remplaçable dans les tests. */
export type HttpFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export interface OrsOptions {
  apiKey: string;
  fetchFn: HttpFetch;
  quota: QuotaGuard;
  cache: TtlCache<RouteResult>;
  baseUrl?: string;
  timeoutMs?: number;
}

const BASE_URL = 'https://api.openrouteservice.org/v2/directions';

/** Arrondit à 4 décimales (≈ 11 m) pour que deux requêtes quasi identiques partagent le cache. */
function round4(n: number): string {
  return n.toFixed(4);
}

function cacheKey(req: RouteRequest): string {
  const r = req.restrictions;
  return [
    req.profile,
    req.avoidTolls ? 'notoll' : 'toll',
    `${round4(req.origin.lon)},${round4(req.origin.lat)}`,
    `${round4(req.destination.lon)},${round4(req.destination.lat)}`,
    r ? JSON.stringify(r) : '',
  ].join('|');
}

/** Fournisseur de routage OpenRouteService (offre gratuite, quota limité). */
export class OpenRouteServiceProvider implements RoutingProvider {
  constructor(private readonly options: OrsOptions) {}

  async route(request: RouteRequest): Promise<RouteResult> {
    const { cache, quota } = this.options;
    const key = cacheKey(request);
    const cached = cache.get(key);
    if (cached) return cached;

    // Sans péage = appel facultatif ; l'itinéraire de base est essentiel.
    if (!quota.canSpend(1, !request.avoidTolls)) {
      throw new RoutingError('Quota du service de routage presque épuisé.', 'quota', true);
    }

    const result = await this.call(request);
    cache.set(key, result);
    return result;
  }

  private async call(request: RouteRequest): Promise<RouteResult> {
    const { apiKey, fetchFn, quota, baseUrl = BASE_URL, timeoutMs = 25_000 } = this.options;

    const body: Record<string, unknown> = {
      coordinates: [
        [request.origin.lon, request.origin.lat],
        [request.destination.lon, request.destination.lat],
      ],
      instructions: true,
      units: 'km',
      // Pour un camion, on demande aussi les restrictions d'accès (livraison, destination…).
      extra_info:
        request.profile === 'driving-hgv'
          ? ['waycategory', 'waytype', 'tollways', 'roadaccessrestrictions']
          : ['waycategory', 'waytype', 'tollways'],
    };
    const options: Record<string, unknown> = {};
    if (request.avoidTolls) options['avoid_features'] = ['tollways'];
    const r = request.restrictions;
    if (request.profile === 'driving-hgv' && r) {
      options['profile_params'] = {
        restrictions: {
          ...(r.heightM !== undefined ? { height: r.heightM } : {}),
          ...(r.widthM !== undefined ? { width: r.widthM } : {}),
          ...(r.lengthM !== undefined ? { length: r.lengthM } : {}),
          ...(r.weightT !== undefined ? { weight: r.weightT } : {}),
          ...(r.axleLoadT !== undefined ? { axleload: r.axleLoadT } : {}),
        },
      };
    }
    if (Object.keys(options).length > 0) body['options'] = options;

    let response: Awaited<ReturnType<HttpFetch>>;
    try {
      response = await fetchFn(`${baseUrl}/${request.profile}/geojson`, {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json, application/geo+json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new RoutingError('Service de routage injoignable.', 'unavailable', true);
    }

    quota.update({
      remaining: response.headers.get('x-ratelimit-remaining'),
      resetEpochSec: response.headers.get('x-ratelimit-reset'),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 403 || status === 429) {
        quota.markExhausted(Number(response.headers.get('x-ratelimit-reset')) || undefined);
        throw new RoutingError('Quota du service de routage dépassé.', 'quota', true);
      }
      if (status === 404 || status === 400) {
        throw new RoutingError(
          'Aucun itinéraire trouvé entre ces deux points (ou requête refusée).',
          'no-route',
          false,
        );
      }
      throw new RoutingError(
        `Service de routage indisponible (HTTP ${status}).`,
        'unavailable',
        true,
      );
    }

    const json = (await response.json()) as { features?: OrsRoute[] };
    const feature = json.features?.[0];
    if (!feature?.geometry?.coordinates?.length) {
      throw new RoutingError('Réponse de routage inattendue.', 'unavailable', true);
    }
    const { segments, tolledKm, tolledSpans, ferryKm, restrictedKm } = segmentRoute(feature);
    return {
      distanceKm: feature.properties.summary.distance,
      providerDurationMin: feature.properties.summary.duration / 60,
      coordinates: feature.geometry.coordinates as LonLat[],
      segments,
      tolledKm,
      tolledSpans,
      ferryKm,
      restrictedKm,
    };
  }
}
