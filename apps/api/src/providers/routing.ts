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
  /** Distance en bac (km). */
  ferryKm: number;
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
