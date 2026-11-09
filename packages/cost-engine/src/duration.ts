import type { RouteSegment, SpeedProfile } from './types';

/** Vitesse effective sur un tronçon : vitesse choisie, plafonnée par la limite du tronçon si connue. */
export function effectiveSpeedKmh(segment: RouteSegment, speeds: SpeedProfile): number {
  const chosen =
    segment.roadClass === 'urban'
      ? speeds.urbanKmh
      : segment.roadClass === 'rural'
        ? speeds.ruralKmh
        : speeds.motorwayKmh;
  const limit = segment.speedLimitKmh;
  return limit !== undefined ? Math.min(chosen, limit) : chosen;
}

/** Durée (minutes) pour parcourir un tronçon à la vitesse donnée. */
export function segmentDurationMin(distanceKm: number, speedKmh: number): number {
  return (distanceKm / speedKmh) * 60;
}
