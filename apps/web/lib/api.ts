export type LonLat = [number, number];

export interface Place {
  label: string;
  lon: number;
  lat: number;
}

export interface VehicleSummary {
  key: string;
  brand: string;
  model: string;
  description: string;
  fuel: string;
  mixedL100: number;
  /** Vrai pour les modèles de la base européenne : le détail par type de route est estimé. */
  detailEstimated?: boolean;
}

export interface TollCharge {
  id: string;
  amountEur: number;
  source: string;
  from?: string;
  to?: string;
  provenance?: string;
}

export interface RouteEstimate {
  kind: 'fastest' | 'noToll';
  distanceKm: number;
  providerDurationMin: number;
  geometry?: LonLat[];
  estimate: {
    durationMin: number;
    breaksMin: number;
    fuelLiters: number;
    fuelCostEur: number;
    tollCostEur: number;
    totalCostEur: number;
    range: { lowEur: number; highEur: number };
  };
  tolls: { charges: TollCharge[]; complete: boolean; estimated: boolean };
  warnings: string[];
}

export interface EstimateResponse {
  routes: RouteEstimate[];
  comparison?: {
    extraCostEur: number;
    minutesSaved: number;
    eurPerHourSaved: number | null;
  };
  warnings: string[];
}

export interface EstimateInput {
  origin: Place;
  destination: Place;
  /** Escales, dans l'ordre de passage. */
  waypoints?: Place[];
  category: string;
  vehicleKey?: string;
  /** Consommation mixte (L/100 km) quand aucun modèle n'est choisi. */
  mixedL100?: number;
  fuelProduct?: string;
  motorwayKmh: number;
}

/**
 * Répartit une consommation moyenne par type de route. Les coefficients sont les rapports
 * médians des 594 modèles de la base ADEME (phases basse / haute / très haute vitesse par
 * rapport au cycle mixte), mesurés le 2026-11-10.
 */
export function consumptionFromMixed(mixedL100: number) {
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    urban: round(mixedL100 * 1.257),
    rural: round(mixedL100 * 0.861),
    motorway: round(mixedL100 * 1.039),
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return body.message ?? body.error ?? `Erreur ${res.status}`;
  } catch {
    return `Erreur ${res.status}`;
  }
}

export async function estimate(input: EstimateInput): Promise<EstimateResponse> {
  const res = await fetch('/api/estimate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      origin: { lon: input.origin.lon, lat: input.origin.lat },
      destination: { lon: input.destination.lon, lat: input.destination.lat },
      waypoints: (input.waypoints ?? []).map((p) => ({ lon: p.lon, lat: p.lat })),
      vehicle: {
        category: input.category,
        ...(input.vehicleKey ? { vehicleKey: input.vehicleKey } : {}),
        ...(!input.vehicleKey && input.mixedL100
          ? { consumption: consumptionFromMixed(input.mixedL100) }
          : {}),
      },
      ...(input.fuelProduct ? { fuel: { product: input.fuelProduct } } : {}),
      speeds: { motorwayKmh: input.motorwayKmh },
      alternatives: true,
      includeGeometry: true,
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as EstimateResponse;
}

export async function searchVehicles(q: string): Promise<VehicleSummary[]> {
  const res = await fetch(`/api/vehicles?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  return ((await res.json()) as { vehicles: VehicleSummary[] }).vehicles;
}

/** Adresses et communes de France : API publique et gratuite (api-adresse.data.gouv.fr). */
export async function searchPlaces(q: string): Promise<Place[]> {
  const res = await fetch(
    `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`,
  );
  if (!res.ok) return [];
  const body = (await res.json()) as {
    features: { geometry: { coordinates: [number, number] }; properties: { label: string } }[];
  };
  return body.features.map((f) => ({
    label: f.properties.label,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}

/** Nom d'un lieu à partir de ses coordonnées (api-adresse.data.gouv.fr) ; `null` si inconnu. */
export async function reversePlace(lon: number, lat: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { features: { properties: { label: string } }[] };
    return body.features[0]?.properties.label ?? null;
  } catch {
    return null;
  }
}
