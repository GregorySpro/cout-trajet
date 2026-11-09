import type { VehicleClass } from '@cout-trajet/shared';

/** Société d'autoroute (réseau) dont provient une grille. */
export type Concession = 'APRR' | 'AREA' | 'ASF' | 'ESCOTA' | 'COFIROUTE' | 'SANEF' | 'SAPN';

/** Prix d'un trajet entre deux gares, par classe de véhicule (€ TTC). */
export type ClassPrices = Record<VehicleClass, number>;

/**
 * Fiabilité d'une source de tarifs, de la plus à la moins sûre :
 *  - `official`    : grille ou site du concessionnaire ;
 *  - `derived`     : calculé à partir de données officielles (somme de tronçons, par exemple) ;
 *  - `third-party` : site tiers (comparateur, presse) ;
 *  - `estimate`    : estimation (barème au kilomètre).
 */
export type Reliability = 'official' | 'derived' | 'third-party' | 'estimate';

/** Origine d'un tarif, pour trancher les conflits entre sources. */
export interface PriceSource {
  id: string;
  /** Libellé lisible (ex. « Grille APRR au 01/02/2026 »). */
  label: string;
  /**
   * Date d'application ou, à défaut, de dernière mise à jour connue du document (AAAA-MM-JJ).
   * `null` si inconnue.
   */
  effectiveFrom: string | null;
  reliability: Reliability;
}

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
  /** Source du tarif (absente = inconnue, traitée comme la moins fiable). */
  source?: PriceSource;
}

/** Désaccord entre deux sources sur le prix d'un même couple de gares, et sa résolution. */
export interface PriceConflict {
  from: string;
  to: string;
  kept: { sourceId: string | null; class1Eur: number };
  dropped: { sourceId: string | null; class1Eur: number };
  /** Pourquoi la valeur retenue l'a emporté. */
  reason: 'newer' | 'more-reliable' | 'first-loaded';
}

export interface ParseResult {
  pairs: PricePair[];
  warnings: string[];
}
