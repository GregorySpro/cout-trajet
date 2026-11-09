import type { CostConfig } from './config';
import type { RoadClass, VehicleConsumption } from './types';

/**
 * Facteur multiplicatif de consommation en fonction de la vitesse.
 *
 * Modèle simple : une part `aeroShare` de la conso est aérodynamique (proportionnelle à v²),
 * le reste est constant. À la vitesse de référence, le facteur vaut 1.
 *   facteur(v) = (1 − a) + a × (v / vRef)²
 */
export function speedFactor(speedKmh: number, referenceKmh: number, aeroShare: number): number {
  if (!(speedKmh > 0)) throw new RangeError('La vitesse doit être strictement positive.');
  if (!(referenceKmh > 0)) throw new RangeError('La vitesse de référence doit être positive.');
  return 1 - aeroShare + aeroShare * (speedKmh / referenceKmh) ** 2;
}

/** Consommation de base (L/100 km) du véhicule pour une classe de route, à la vitesse de référence. */
export function baseConsumption(
  vehicle: VehicleConsumption,
  roadClass: RoadClass,
  config: CostConfig,
): number {
  switch (roadClass) {
    case 'urban':
      return vehicle.urban;
    case 'rural':
      return vehicle.rural;
    case 'motorway':
      return vehicle.motorway ?? vehicle.rural * config.motorwayVsRuralFactor;
  }
}

/** Litres consommés sur un tronçon, à la vitesse effective donnée. */
export function segmentFuelLiters(
  distanceKm: number,
  roadClass: RoadClass,
  effectiveSpeedKmh: number,
  vehicle: VehicleConsumption,
  config: CostConfig,
): number {
  const ref = config.reference[roadClass];
  const per100 =
    baseConsumption(vehicle, roadClass, config) *
    speedFactor(effectiveSpeedKmh, ref.speedKmh, ref.aeroShare);
  return (distanceKm * per100) / 100;
}
