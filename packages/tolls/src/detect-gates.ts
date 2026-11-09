import type { OsmGate } from './gate-resolver';

/** Gare de péage telle que décrite par OpenStreetMap (nœud `barrier=toll_booth`). */
export interface OsmBooth {
  name: string;
  operator?: string;
  lat: number;
  lon: number;
}

/** Point de l'itinéraire : [longitude, latitude]. */
export type LonLat = readonly [number, number];

export interface DetectedGate extends OsmGate {
  /** Distance entre la gare et le tracé, en mètres. */
  distanceM: number;
  /** Position le long du tracé, en mètres depuis le départ. */
  alongM: number;
}

const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LON_AT_EQUATOR = 111_320;

/**
 * Trouve les gares de péage réellement franchies par un itinéraire : celles situées à moins de
 * `maxDistanceM` du tracé (10 m par défaut). Les gares de bretelle, plus éloignées, sont écartées.
 * Résultat trié par position le long du tracé.
 */
export function detectGatesOnRoute(
  route: readonly LonLat[],
  booths: readonly OsmBooth[],
  maxDistanceM = 10,
): DetectedGate[] {
  if (route.length < 2) return [];
  const meanLat = route.reduce((s, p) => s + p[1], 0) / route.length;
  const kx = METERS_PER_DEG_LON_AT_EQUATOR * Math.cos((meanLat * Math.PI) / 180);
  const ky = METERS_PER_DEG_LAT;
  const pts = route.map((p) => [p[0] * kx, p[1] * ky] as const);

  const cumulative: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as readonly [number, number];
    const b = pts[i] as readonly [number, number];
    cumulative.push((cumulative[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }

  const found: DetectedGate[] = [];
  for (const booth of booths) {
    const px = booth.lon * kx;
    const py = booth.lat * ky;
    let best = Number.POSITIVE_INFINITY;
    let bestAlong = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as readonly [number, number];
      const b = pts[i] as readonly [number, number];
      // Rejet rapide : la gare est trop loin de ce segment en x ou en y.
      if (px < Math.min(a[0], b[0]) - maxDistanceM || px > Math.max(a[0], b[0]) + maxDistanceM) {
        continue;
      }
      if (py < Math.min(a[1], b[1]) - maxDistanceM || py > Math.max(a[1], b[1]) + maxDistanceM) {
        continue;
      }
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      const t =
        len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
      const d = Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
      if (d < best) {
        best = d;
        bestAlong = (cumulative[i - 1] as number) + t * Math.sqrt(len2);
      }
    }
    if (best <= maxDistanceM) {
      found.push({
        name: booth.name,
        ...(booth.operator !== undefined ? { operator: booth.operator } : {}),
        lat: booth.lat,
        lon: booth.lon,
        distanceM: Math.round(best * 10) / 10,
        alongM: Math.round(bestAlong),
      });
    }
  }
  return found.sort((a, b) => a.alongM - b.alongM);
}
