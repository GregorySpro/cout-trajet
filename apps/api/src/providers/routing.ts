import type { LonLat } from '@cout-trajet/tolls';
import type { RouteSegment } from '@cout-trajet/cost-engine';

export type RoutingProfile = 'driving-car' | 'driving-hgv';

export interface Coordinate {
  lon: number;
  lat: number;
}

/** Restrictions d'un poids lourd, en mètres et en tonnes (profil `driving-hgv`). */
export interface HgvRestrictions {
  heightM?: number;
  widthM?: number;
  lengthM?: number;
  weightT?: number;
  axleLoadT?: number;
}

export interface RouteRequest {
  origin: Coordinate;
  destination: Coordinate;
  profile: RoutingProfile;
  avoidTolls: boolean;
  restrictions?: HgvRestrictions;
}

export interface RouteResult {
  distanceKm: number;
  /** Durée estimée par le service de routage (secondes → minutes), à titre indicatif. */
  providerDurationMin: number;
  /** Tracé complet [longitude, latitude]. */
  coordinates: LonLat[];
  /** Tronçons classés par type de route, pour le moteur de coût. */
  segments: RouteSegment[];
  /** Distance marquée « à péage » par le service de routage (km). */
  tolledKm: number;
  /** Plages (km depuis le départ) marquées « à péage » : sert à repérer un péage non expliqué par des gares. */
  tolledSpans: { fromKm: number; toKm: number }[];
  /** Distance en bac (km). */
  ferryKm: number;
  /** Distance sur des routes à accès restreint (livraison, destination…), utile pour les poids lourds. */
  restrictedKm: number;
}

/** Erreur de routage ; `retryable` indique si une nouvelle tentative plus tard peut réussir. */
export class RoutingError extends Error {
  constructor(
    message: string,
    readonly code: 'quota' | 'unavailable' | 'no-route' | 'invalid-request',
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}

export interface RoutingProvider {
  route(request: RouteRequest): Promise<RouteResult>;
}
