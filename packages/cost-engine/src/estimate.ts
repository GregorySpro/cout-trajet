import { DEFAULT_COST_CONFIG, DEFAULT_SPEED_PROFILE, type CostConfig } from './config';
import { effectiveSpeedKmh, segmentDurationMin } from './duration';
import { segmentFuelLiters } from './fuel';
import {
  ROAD_CLASSES,
  type Estimate,
  type EstimateInput,
  type RoadClass,
  type RoadClassBreakdown,
  type SpeedProfile,
} from './types';

/** Arrondi au centime. */
export function roundEur(value: number): number {
  return Math.round(value * 100) / 100;
}

function validate(input: EstimateInput): void {
  if (!(input.fuelPriceEurPerL > 0)) {
    throw new RangeError('Le prix du carburant doit être strictement positif.');
  }
  const { urban, rural, motorway } = input.vehicle;
  for (const [name, value] of [
    ['urbaine', urban],
    ['extra-urbaine', rural],
    ['autoroute', motorway],
  ] as const) {
    if (value !== undefined && !(value > 0)) {
      throw new RangeError(`La consommation ${name} doit être strictement positive.`);
    }
  }
  for (const seg of input.segments) {
    if (!(seg.distanceKm >= 0)) throw new RangeError('La distance d’un tronçon doit être ≥ 0.');
    if (seg.speedLimitKmh !== undefined && !(seg.speedLimitKmh > 0)) {
      throw new RangeError('La vitesse limite d’un tronçon doit être strictement positive.');
    }
  }
  for (const toll of input.tolls ?? []) {
    if (!(toll.amountEur >= 0)) throw new RangeError('Un péage ne peut pas être négatif.');
  }
}

function emptyBreakdown(): Record<RoadClass, RoadClassBreakdown> {
  return {
    urban: { distanceKm: 0, durationMin: 0, fuelLiters: 0 },
    rural: { distanceKm: 0, durationMin: 0, fuelLiters: 0 },
    motorway: { distanceKm: 0, durationMin: 0, fuelLiters: 0 },
  };
}

/**
 * Estime le coût d'un trajet (carburant + péages), sa durée et une fourchette d'incertitude.
 * Fonction pure : aucune entrée/sortie, aucun accès réseau.
 */
export function estimateTrip(
  input: EstimateInput,
  config: CostConfig = DEFAULT_COST_CONFIG,
): Estimate {
  validate(input);
  const speeds: SpeedProfile = { ...DEFAULT_SPEED_PROFILE, ...input.speeds };
  for (const [name, v] of Object.entries(speeds)) {
    if (!(v > 0)) throw new RangeError(`La vitesse ${name} doit être strictement positive.`);
  }

  const byRoadClass = emptyBreakdown();
  for (const seg of input.segments) {
    const speed = effectiveSpeedKmh(seg, speeds);
    const bucket = byRoadClass[seg.roadClass];
    bucket.distanceKm += seg.distanceKm;
    bucket.durationMin += segmentDurationMin(seg.distanceKm, speed);
    bucket.fuelLiters += segmentFuelLiters(
      seg.distanceKm,
      seg.roadClass,
      speed,
      input.vehicle,
      config,
    );
  }

  let distanceKm = 0;
  let durationMin = 0;
  let fuelLiters = 0;
  for (const rc of ROAD_CLASSES) {
    const b = byRoadClass[rc];
    distanceKm += b.distanceKm;
    durationMin += b.durationMin;
    fuelLiters += b.fuelLiters;
  }

  const fuelCost = fuelLiters * input.fuelPriceEurPerL;
  const tolls = input.tolls ?? [];
  const tollCost = tolls.reduce((sum, t) => sum + t.amountEur, 0);
  const total = fuelCost + tollCost;

  const margin =
    fuelCost * config.fuelUncertainty +
    tolls.reduce(
      (sum, t) =>
        sum + (t.source === 'official' ? 0 : t.amountEur * config.tollEstimateUncertainty),
      0,
    );

  return {
    distanceKm: roundEur(distanceKm),
    durationMin: Math.round(durationMin),
    fuelLiters: roundEur(fuelLiters),
    fuelCostEur: roundEur(fuelCost),
    tollCostEur: roundEur(tollCost),
    totalCostEur: roundEur(total),
    range: { lowEur: roundEur(Math.max(0, total - margin)), highEur: roundEur(total + margin) },
    byRoadClass,
  };
}
