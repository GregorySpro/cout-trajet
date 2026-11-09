/** Type de route d'un tronçon d'itinéraire. */
export type RoadClass = 'urban' | 'rural' | 'motorway';

export const ROAD_CLASSES: readonly RoadClass[] = ['urban', 'rural', 'motorway'];

/** Tronçon d'itinéraire fourni par le routage. */
export interface RouteSegment {
  distanceKm: number;
  roadClass: RoadClass;
  /** Vitesse maximale autorisée sur le tronçon (km/h), si connue. */
  speedLimitKmh?: number;
}

/**
 * Consommation du véhicule en L/100 km.
 * `urban` et `rural` viennent des consommations urbaine / extra-urbaine (ADEME).
 * `motorway` est la consommation à ~110 km/h ; si absente, elle est dérivée de `rural`.
 */
export interface VehicleConsumption {
  urban: number;
  rural: number;
  motorway?: number;
}

/** Vitesses de croisière choisies par l'utilisateur (km/h). */
export interface SpeedProfile {
  urbanKmh: number;
  ruralKmh: number;
  motorwayKmh: number;
}

/** Péage fourni par le module de péages (le moteur ne calcule pas les prix de péage). */
export interface TollCharge {
  id: string;
  amountEur: number;
  /** `official` : tarif officiel d'une grille ; `estimate` : estimation (barème au km, par exemple). */
  source: 'official' | 'estimate';
  from?: string;
  to?: string;
}

export interface EstimateInput {
  segments: readonly RouteSegment[];
  vehicle: VehicleConsumption;
  fuelPriceEurPerL: number;
  speeds?: Partial<SpeedProfile>;
  tolls?: readonly TollCharge[];
}

export interface RoadClassBreakdown {
  distanceKm: number;
  durationMin: number;
  fuelLiters: number;
}

export interface Estimate {
  distanceKm: number;
  durationMin: number;
  fuelLiters: number;
  fuelCostEur: number;
  tollCostEur: number;
  totalCostEur: number;
  /** Fourchette d'incertitude sur le coût total. */
  range: { lowEur: number; highEur: number };
  byRoadClass: Record<RoadClass, RoadClassBreakdown>;
}
