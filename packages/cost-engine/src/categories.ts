import { isHeavyGoodsVehicle, type VehicleCategory } from '@cout-trajet/shared';
import { DEFAULT_COST_CONFIG, DEFAULT_SPEED_PROFILE, type CostConfig } from './config';
import type { RoadClass, SpeedProfile, VehicleConsumption } from './types';

/**
 * Paramètres propres aux poids lourds.
 *
 * Sources et réserves :
 *  - Consommations moyennes : enquête CNR (Comité national routier) « Porteurs 19 tonnes régional »
 *    de décembre 2024 : 25,2 L/100 km pour un porteur 19 t, 30,2 L/100 km pour un ensemble articulé
 *    en régional. Ce sont des moyennes sur trajets mixtes, sans détail ville/route/autoroute.
 *  - Vitesses : un véhicule de plus de 3,5 t est limité à 90 km/h sur autoroute ; 80 km/h sur route
 *    (⚠️ valeurs relevées sur des sites secondaires, à confirmer sur l'article R413-8 du code de la route ;
 *    des limites plus basses existent pour les ensembles de plus de 12 t sur certaines routes).
 *  - Pauses : 45 minutes après 4 h 30 de conduite (règlement européen 561/2006, ⚠️ à confirmer).
 *  - Ventilation ville/route/autoroute : hypothèses (ville ×1,3 ; route ×1,0 ; autoroute ×1,0 à vitesse de référence).
 */

/** Consommation moyenne en L/100 km des poids lourds, CNR 2024 (régional). */
export const HEAVY_MEAN_L100: Readonly<Record<'hgv-rigid' | 'hgv-articulated', number>> = {
  'hgv-rigid': 25.2,
  'hgv-articulated': 30.2,
};

/** Pause réglementaire : 45 minutes après 4 h 30 de conduite. */
export const MANDATORY_BREAK = { afterDrivingMin: 270, breakMin: 45 } as const;

/** Taux de TVA appliqué aux carburants et aux péages (pour un calcul hors taxes). */
export const VAT_RATE = 0.2;

export const HEAVY_COST_CONFIG: CostConfig = {
  ...DEFAULT_COST_CONFIG,
  reference: {
    urban: { speedKmh: 25, aeroShare: 0 },
    rural: { speedKmh: 70, aeroShare: 0.25 },
    motorway: { speedKmh: 85, aeroShare: 0.4 },
  },
  motorwayVsRuralFactor: 1,
};

const HEAVY_SPEEDS: SpeedProfile = { urbanKmh: 25, ruralKmh: 80, motorwayKmh: 90 };

/** Vitesses de croisière par défaut selon la catégorie. */
export function defaultSpeeds(category: VehicleCategory): SpeedProfile {
  return isHeavyGoodsVehicle(category) ? HEAVY_SPEEDS : DEFAULT_SPEED_PROFILE;
}

/** Plafonds légaux de vitesse par type de route (poids lourds seulement ; les autres suivent la limite du tronçon). */
export function legalSpeedCaps(category: VehicleCategory): Partial<Record<RoadClass, number>> {
  return isHeavyGoodsVehicle(category) ? { motorway: 90, rural: 80, urban: 50 } : {};
}

/** Paramètres du modèle de consommation adaptés à la catégorie. */
export function configFor(category: VehicleCategory): CostConfig {
  return isHeavyGoodsVehicle(category) ? HEAVY_COST_CONFIG : DEFAULT_COST_CONFIG;
}

/**
 * Consommation par défaut d'un camion à partir de la moyenne CNR. Renvoie `undefined` pour les
 * autres catégories (voiture, utilitaire, camping-car, moto) : leur consommation doit être fournie
 * (modèle ADEME pour les voitures, saisie manuelle sinon).
 */
export function defaultConsumption(category: VehicleCategory): VehicleConsumption | undefined {
  if (category !== 'hgv-rigid' && category !== 'hgv-articulated') return undefined;
  const mean = HEAVY_MEAN_L100[category];
  return { urban: mean * 1.3, rural: mean, motorway: mean };
}

/** Pause réglementaire cumulée (minutes) pour une durée de conduite donnée. */
export function mandatoryBreakMin(drivingMin: number): number {
  return Math.floor(drivingMin / MANDATORY_BREAK.afterDrivingMin) * MANDATORY_BREAK.breakMin;
}
