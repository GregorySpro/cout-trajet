import type { RoadClass, RouteSegment } from '@cout-trajet/cost-engine';
import type { LonLat } from '@cout-trajet/tolls';

/** Forme minimale d'un itinéraire GeoJSON d'OpenRouteService (unités : km et secondes). */
export interface OrsRoute {
  geometry: { coordinates: LonLat[] };
  properties: {
    summary: { distance: number; duration: number };
    segments?: { steps?: { distance: number; duration: number; way_points: [number, number] }[] }[];
    extras?: {
      waycategory?: { values: [number, number, number][] };
      waytype?: { values: [number, number, number][] };
      tollways?: { values: [number, number, number][] };
    };
  };
}

export interface SegmentedRoute {
  segments: RouteSegment[];
  tolledKm: number;
  ferryKm: number;
}

/** Bits de l'extra-info `waycategory` d'OpenRouteService. */
const WAYCATEGORY_HIGHWAY = 1;
/** Valeur de l'extra-info `waytype` pour un bac. */
const WAYTYPE_FERRY = 9;

/** En dessous de cette vitesse moyenne sur un pas de guidage (km/h), on considère la ville. */
const URBAN_MAX_AVG_KMH = 40;

function haversineKm(a: LonLat, b: LonLat): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Valeur d'une extra-info pour l'intervalle de points d'indice `i` (de i à i+1). */
function valueAt(ranges: [number, number, number][] | undefined, i: number): number | undefined {
  if (!ranges) return undefined;
  for (const [from, to, value] of ranges) {
    if (i >= from && i < to) return value;
  }
  return undefined;
}

/**
 * Découpe un itinéraire d'OpenRouteService en tronçons classés ville / route / autoroute.
 *  - autoroute : l'extra-info `waycategory` porte le bit « Highway » ;
 *  - sinon ville ou route selon la vitesse moyenne du pas de guidage (< 40 km/h = ville).
 * Les distances sont calculées sur le tracé puis recalées sur la distance officielle du service.
 */
export function segmentRoute(route: OrsRoute): SegmentedRoute {
  const coords = route.geometry.coordinates;
  const n = coords.length - 1;
  if (n < 1) return { segments: [], tolledKm: 0, ferryKm: 0 };

  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const d = haversineKm(coords[i] as LonLat, coords[i + 1] as LonLat);
    lengths.push(d);
    total += d;
  }
  const scale = total > 0 ? route.properties.summary.distance / total : 1;

  // Vitesse moyenne de chaque pas de guidage, par intervalle de points.
  const stepSpeed: (number | undefined)[] = new Array(n).fill(undefined);
  for (const seg of route.properties.segments ?? []) {
    for (const step of seg.steps ?? []) {
      const hours = step.duration / 3600;
      const speed = hours > 0 ? step.distance / hours : undefined;
      const [a, b] = step.way_points;
      for (let i = a; i < Math.min(b, n); i++) stepSpeed[i] = speed;
    }
  }

  const extras = route.properties.extras;
  const segments: RouteSegment[] = [];
  let tolledKm = 0;
  let ferryKm = 0;
  let current: { roadClass: RoadClass; km: number } | null = null;

  for (let i = 0; i < n; i++) {
    const km = (lengths[i] as number) * scale;
    const category = valueAt(extras?.waycategory?.values, i) ?? 0;
    const isFerry = valueAt(extras?.waytype?.values, i) === WAYTYPE_FERRY;
    let roadClass: RoadClass;
    if (isFerry) {
      roadClass = 'rural';
      ferryKm += km;
    } else if ((category & WAYCATEGORY_HIGHWAY) !== 0) {
      roadClass = 'motorway';
    } else {
      const speed = stepSpeed[i];
      roadClass = speed !== undefined && speed < URBAN_MAX_AVG_KMH ? 'urban' : 'rural';
    }
    if (valueAt(extras?.tollways?.values, i) === 1) tolledKm += km;

    if (current && current.roadClass === roadClass) {
      current.km += km;
    } else {
      if (current) segments.push({ distanceKm: current.km, roadClass: current.roadClass });
      current = { roadClass, km };
    }
  }
  if (current) segments.push({ distanceKm: current.km, roadClass: current.roadClass });

  return { segments, tolledKm, ferryKm };
}
