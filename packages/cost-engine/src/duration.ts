import type { RoadClass, RouteSegment, SpeedProfile } from './types';

/**
 * Vitesse effective sur un tronçon : vitesse choisie, plafonnée par la limite du tronçon si connue
 * et par le plafond légal de la catégorie de véhicule (poids lourds) s'il y en a un.
 */
export function effectiveSpeedKmh(
  segment: RouteSegment,
  speeds: SpeedProfile,
  legalCaps: Partial<Record<RoadClass, number>> = {},
): number {
  const chosen =
    segment.roadClass === 'urban'
      ? speeds.urbanKmh
      : segment.roadClass === 'rural'
        ? speeds.ruralKmh
        : speeds.motorwayKmh;
  const limit = segment.speedLimitKmh;
  const cap = legalCaps[segment.roadClass];
  return Math.min(chosen, limit ?? Number.POSITIVE_INFINITY, cap ?? Number.POSITIVE_INFINITY);
}

/** Durée (minutes) pour parcourir un tronçon à la vitesse donnée. */
export function segmentDurationMin(distanceKm: number, speedKmh: number): number {
  return (distanceKm / speedKmh) * 60;
}
