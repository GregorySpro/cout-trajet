import type { VehicleClass } from '@cout-trajet/shared';
import { OPEN_BARRIERS } from './open-barriers';
import type { ClassPrices } from './types';

/** Période saisonnière (jours inclus), au format MM-JJ. */
export interface Season {
  fromMonthDay: string;
  toMonthDay: string;
  prices: ClassPrices;
}

/** Péage « à l'unité » (une seule barrière, tarif fixe) : ouvrage d'art, pont, tunnel. */
export interface OpenToll {
  /** Identifiant de gare : `OUVRAGE:NOM`. */
  gate: string;
  name: string;
  prices: ClassPrices;
  /** Tarifs de saison, prioritaires sur `prices` s'ils couvrent la date. */
  seasons?: Season[];
  /** Origine et date du tarif (traçabilité). */
  source: string;
  /** Date d'application du tarif (AAAA-MM-JJ) : sert à trancher face à une grille plus ancienne. */
  effectiveFrom: string;
}

function monthDay(date: Date): string {
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${m}-${d}`;
}

/** Prix d'un péage à l'unité pour une date et une classe données. */
export function openTollPrice(toll: OpenToll, date: Date, vehicleClass: VehicleClass): number {
  const md = monthDay(date);
  for (const s of toll.seasons ?? []) {
    const inSeason =
      s.fromMonthDay <= s.toMonthDay
        ? md >= s.fromMonthDay && md <= s.toMonthDay
        : md >= s.fromMonthDay || md <= s.toMonthDay;
    if (inSeason) return s.prices[vehicleClass];
  }
  return toll.prices[vehicleClass];
}

/**
 * Ouvrages à péage à l'unité relevés sur les sites officiels le 2026-11-09.
 * ⚠️ Les tarifs changent chaque année (et parfois en cours d'année) : à revérifier avant utilisation.
 */
const STRUCTURES: readonly OpenToll[] = [
  {
    gate: 'OUVRAGE:VIADUC DE MILLAU',
    name: 'Viaduc de Millau',
    // Hors été : du 16/09 au 14/06 ; été : du 15/06 au 15/09.
    prices: { 1: 11.3, 2: 17.0, 3: 37.6, 4: 47.7, 5: 6.8 },
    seasons: [
      {
        fromMonthDay: '06-15',
        toMonthDay: '09-15',
        prices: { 1: 13.8, 2: 20.7, 3: 37.6, 4: 47.7, 5: 6.8 },
      },
    ],
    source: 'leviaducdemillau.com, tarifs au 1er février 2026 (relevé le 2026-11-09)',
    effectiveFrom: '2026-02-01',
  },
  {
    gate: 'OUVRAGE:PONT DE NORMANDIE',
    name: 'Pont de Normandie',
    prices: { 1: 6.1, 2: 7.1, 3: 7.6, 4: 15.1, 5: 0 },
    source: 'pontsnormandietancarville.fr, tarifs à partir du 1er mai 2026 (relevé le 2026-11-09)',
    effectiveFrom: '2026-05-01',
  },
  {
    gate: 'OUVRAGE:PONT DE TANCARVILLE',
    name: 'Pont de Tancarville',
    prices: { 1: 2.9, 2: 3.7, 3: 4.4, 4: 7.5, 5: 0 },
    source: 'pontsnormandietancarville.fr, tarifs à partir du 1er mai 2026 (relevé le 2026-11-09)',
    effectiveFrom: '2026-05-01',
  },
];

/** Tous les péages à tarif fixe : ouvrages (ponts, viaduc) et barrières à système ouvert APRR/AREA. */
export const OPEN_TOLLS: readonly OpenToll[] = [...STRUCTURES, ...OPEN_BARRIERS];

/**
 * Prépare les péages à tarif fixe pour une utilisation avec un livre de tarifs :
 *  - une barrière dont le nom est aussi celui d'une gare de grille est écartée : la gare de grille
 *    (tarif par couple d'entrée et de sortie) est prioritaire, car un trajet qui sort à cette gare ne
 *    paie pas le forfait de la barrière ;
 *  - `knownGates` rassemble les gares de grille et les péages à tarif fixe, pour le rapprochement
 *    automatique des noms OpenStreetMap.
 */
export function prepareOpenTolls(
  closedGates: ReadonlySet<string>,
  openTolls: readonly OpenToll[] = OPEN_TOLLS,
): { openTolls: OpenToll[]; knownGates: Set<string>; dropped: string[] } {
  const kept = openTolls.filter((o) => !closedGates.has(o.gate));
  const dropped = openTolls.filter((o) => closedGates.has(o.gate)).map((o) => o.gate);
  return {
    openTolls: kept,
    knownGates: new Set([...closedGates, ...kept.map((o) => o.gate)]),
    dropped,
  };
}
