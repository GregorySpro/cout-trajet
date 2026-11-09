import type { VehicleCategory } from '@cout-trajet/shared';

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
  /** Document d'où vient le tarif (ex. « Grille APRR au 01/02/2026 »), pour la transparence. */
  provenance?: string;
}

export interface EstimateInput {
  segments: readonly RouteSegment[];
  /** Catégorie du véhicule ; `car` par défaut. */
  category?: VehicleCategory;
  /**
   * Consommation du véhicule. Facultative pour les camions (moyenne CNR par défaut), obligatoire
   * pour les autres catégories.
   */
  vehicle?: VehicleConsumption;
  fuelPriceEurPerL: number;
  speeds?: Partial<SpeedProfile>;
  tolls?: readonly TollCharge[];
  /** Ajoute les pauses réglementaires à la durée. Par défaut : vrai pour les camions, faux sinon. */
  includeBreaks?: boolean;
  /** Calcul hors taxes (carburant et péages divisés par 1,2) pour un professionnel qui récupère la TVA. */
  excludeVat?: boolean;
}

export interface RoadClassBreakdown {
  distanceKm: number;
  durationMin: number;
  fuelLiters: number;
}

export interface Estimate {
  category: VehicleCategory;
  distanceKm: number;
  /** Durée totale : conduite + pauses réglementaires éventuelles. */
  durationMin: number;
  /** Durée de conduite seule. */
  drivingMin: number;
  /** Pauses réglementaires incluses dans `durationMin`. */
  breaksMin: number;
  /** Prix et montants hors taxes ? */
  excludesVat: boolean;
  fuelLiters: number;
  fuelCostEur: number;
  tollCostEur: number;
  totalCostEur: number;
  /** Fourchette d'incertitude sur le coût total. */
  range: { lowEur: number; highEur: number };
  byRoadClass: Record<RoadClass, RoadClassBreakdown>;
}
