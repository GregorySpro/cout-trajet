import { isHeavyGoodsVehicle } from '@cout-trajet/shared';
import {
  VAT_RATE,
  configFor,
  defaultConsumption,
  defaultSpeeds,
  legalSpeedCaps,
  mandatoryBreakMin,
} from './categories';
import type { CostConfig } from './config';
import { effectiveSpeedKmh, segmentDurationMin } from './duration';
import { segmentFuelLiters } from './fuel';
import {
  ROAD_CLASSES,
  type Estimate,
  type EstimateInput,
  type RoadClass,
  type RoadClassBreakdown,
  type SpeedProfile,
  type VehicleConsumption,
} from './types';

/** Arrondi au centime. */
export function roundEur(value: number): number {
  return Math.round(value * 100) / 100;
}

function validate(input: EstimateInput, vehicle: VehicleConsumption): void {
  if (!(input.fuelPriceEurPerL > 0)) {
    throw new RangeError('Le prix du carburant doit être strictement positif.');
  }
  const { urban, rural, motorway } = vehicle;
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
 *
 * Catégorie de véhicule (`car` par défaut) : les camions utilisent par défaut la consommation moyenne
 * du CNR, des vitesses plafonnées à 90 km/h sur autoroute et 80 km/h sur route, et des pauses
 * réglementaires ; `excludeVat` donne un coût hors taxes pour un professionnel.
 */
export function estimateTrip(input: EstimateInput, config?: CostConfig): Estimate {
  const category = input.category ?? 'car';
  const heavy = isHeavyGoodsVehicle(category);
  const vehicle = input.vehicle ?? defaultConsumption(category);
  if (vehicle === undefined) {
    throw new RangeError(
      `La consommation du véhicule est obligatoire pour la catégorie « ${category} ».`,
    );
  }
  validate(input, vehicle);

  const cfg = config ?? configFor(category);
  const speeds: SpeedProfile = { ...defaultSpeeds(category), ...input.speeds };
  for (const [name, v] of Object.entries(speeds)) {
    if (!(v > 0)) throw new RangeError(`La vitesse ${name} doit être strictement positive.`);
  }
  const caps = legalSpeedCaps(category);

  const byRoadClass = emptyBreakdown();
  for (const seg of input.segments) {
    const speed = effectiveSpeedKmh(seg, speeds, caps);
    const bucket = byRoadClass[seg.roadClass];
    bucket.distanceKm += seg.distanceKm;
    bucket.durationMin += segmentDurationMin(seg.distanceKm, speed);
    bucket.fuelLiters += segmentFuelLiters(seg.distanceKm, seg.roadClass, speed, vehicle, cfg);
  }

  let distanceKm = 0;
  let drivingMin = 0;
  let fuelLiters = 0;
  for (const rc of ROAD_CLASSES) {
    const b = byRoadClass[rc];
    distanceKm += b.distanceKm;
    drivingMin += b.durationMin;
    fuelLiters += b.fuelLiters;
  }
  const breaksMin = (input.includeBreaks ?? heavy) ? mandatoryBreakMin(drivingMin) : 0;

  // Hors taxes : carburant et péages (grilles TTC à 20 %) divisés par 1,2.
  const priceDivisor = input.excludeVat === true ? 1 + VAT_RATE : 1;
  const fuelCost = (fuelLiters * input.fuelPriceEurPerL) / priceDivisor;
  const tolls = (input.tolls ?? []).map((t) => ({ ...t, amountEur: t.amountEur / priceDivisor }));
  const tollCost = tolls.reduce((sum, t) => sum + t.amountEur, 0);
  const total = fuelCost + tollCost;

  const margin =
    fuelCost * cfg.fuelUncertainty +
    tolls.reduce(
      (sum, t) => sum + (t.source === 'official' ? 0 : t.amountEur * cfg.tollEstimateUncertainty),
      0,
    );

  return {
    category,
    distanceKm: roundEur(distanceKm),
    durationMin: Math.round(drivingMin + breaksMin),
    drivingMin: Math.round(drivingMin),
    breaksMin,
    excludesVat: input.excludeVat === true,
    fuelLiters: roundEur(fuelLiters),
    fuelCostEur: roundEur(fuelCost),
    tollCostEur: roundEur(tollCost),
    totalCostEur: roundEur(total),
    range: { lowEur: roundEur(Math.max(0, total - margin)), highEur: roundEur(total + margin) },
    byRoadClass,
  };
}
