import type { VehicleClass } from '@cout-trajet/shared';

/** Société d'autoroute (réseau) dont provient une grille. */
export type Concession = 'APRR' | 'AREA' | 'ASF' | 'ESCOTA' | 'COFIROUTE' | 'SANEF' | 'SAPN';

/** Prix d'un trajet entre deux gares, par classe de véhicule (€ TTC). */
export type ClassPrices = Record<VehicleClass, number>;

/** Tarif entre une gare d'entrée et une gare de sortie. */
export interface PricePair {
  concession: Concession;
  /** Identifiant de la gare d'entrée (voir `gateId`). */
  from: string;
  /** Identifiant de la gare de sortie. */
  to: string;
  /** Distance tarifaire en km si la grille la fournit. */
  distanceKm: number | null;
  prices: ClassPrices;
}

export interface ParseResult {
  pairs: PricePair[];
  warnings: string[];
}
