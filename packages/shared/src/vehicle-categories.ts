import type { VehicleClass } from './index';

/**
 * Catégories de véhicules prises en charge par le calculateur.
 *  - `car`             : voiture particulière (hauteur ≤ 2 m, PTAC ≤ 3,5 t) ;
 *  - `van`             : utilitaire léger ;
 *  - `motorhome`       : camping-car (souvent plus de 2 m de haut) ;
 *  - `hgv-rigid`       : camion porteur à 2 essieux, PTAC > 3,5 t ;
 *  - `hgv-articulated` : ensemble articulé ou porteur à 3 essieux et plus ;
 *  - `motorcycle`      : moto, side-car, trike.
 */
export const VEHICLE_CATEGORIES = [
  'car',
  'van',
  'motorhome',
  'hgv-rigid',
  'hgv-articulated',
  'motorcycle',
] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

/** Poids lourd : PTAC supérieur à 3,5 t (vitesses limitées, pauses réglementaires, péages classes 3 et 4). */
export function isHeavyGoodsVehicle(category: VehicleCategory): boolean {
  return category === 'hgv-rigid' || category === 'hgv-articulated';
}

/** Classe de péage la plus courante pour chaque catégorie (à affiner avec les dimensions réelles). */
export const DEFAULT_TOLL_CLASS: Readonly<Record<VehicleCategory, VehicleClass>> = {
  car: 1,
  van: 1,
  motorhome: 2,
  'hgv-rigid': 3,
  'hgv-articulated': 4,
  motorcycle: 5,
};

export interface VehicleDimensions {
  /** Hauteur totale en mètres (véhicule ou ensemble roulant). */
  heightM: number;
  /** Poids total autorisé en charge, en tonnes (PTAC ; PTRA pour un ensemble). */
  maxWeightT: number;
  /** Nombre d'essieux. */
  axles: number;
  /** Moto, side-car ou trike. */
  motorcycle?: boolean;
}

/**
 * Classe de péage d'un véhicule selon la classification des sociétés d'autoroute (relevée sur les
 * sites de Vinci Autoroutes et du viaduc de Millau, 2026) :
 *  - classe 1 : hauteur ≤ 2 m et PTAC ≤ 3,5 t ;
 *  - classe 2 : hauteur > 2 m et < 3 m, PTAC ≤ 3,5 t ;
 *  - classe 3 : 2 essieux, hauteur ≥ 3 m ou PTAC > 3,5 t ;
 *  - classe 4 : plus de 2 essieux, hauteur ≥ 3 m ou PTAC > 3,5 t ;
 *  - classe 5 : moto, side-car, trike.
 * ⚠️ La classe réelle est établie à chaque péage par le concessionnaire ; ceci est une estimation.
 */
export function tollClassFor(dim: VehicleDimensions): VehicleClass {
  if (!(dim.heightM > 0) || !(dim.maxWeightT > 0) || !(dim.axles >= 1)) {
    throw new RangeError('Hauteur, poids et nombre d’essieux doivent être strictement positifs.');
  }
  if (dim.motorcycle === true) return 5;
  if (dim.maxWeightT > 3.5 || dim.heightM >= 3) return dim.axles <= 2 ? 3 : 4;
  if (dim.heightM > 2) return 2;
  return 1;
}
