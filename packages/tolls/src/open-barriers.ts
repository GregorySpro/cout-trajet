import type { OpenToll } from './open-tolls';

/**
 * Barrières à système ouvert APRR et AREA (une seule gare, tarif forfaitaire) au 1er février 2026.
 * Source : document officiel « Péage à système ouvert — tarifs au 1er février 2026 » publié sur
 * voyage.aprr.fr (PDF d'une page, tableau sous forme d'image, relevé visuellement le 2026-11-09).
 * ⚠️ Saisie manuelle : à revérifier si le document est remplacé.
 *
 * Colonnes : autoroute, nom de la gare (grille officielle), classes 1 à 5.
 */
type Row = [road: string, name: string, c1: number, c2: number, c3: number, c4: number, c5: number];

const APRR_ROWS: Row[] = [
  ['A71', 'GERZAT-VILLE', 1.4, 1.7, 3.3, 3.4, 1.1],
  ['A6', 'VILLEFRANCHE-VILLE', 2.8, 4.2, 5.6, 7.2, 1.8],
  ['A432', 'LA BOISSE', 2.4, 3.9, 6.2, 8.0, 1.5],
  ['A77', 'DORDIVES', 6.0, 9.0, 14.1, 18.9, 3.7],
  ['A77', 'LE TOURNEAU', 3.8, 5.8, 8.9, 11.9, 2.5],
  ['A77', 'MYENNES', 4.2, 6.0, 8.4, 11.9, 2.8],
  ['A466', 'QUINCIEUX BARRIERE', 3.6, 5.6, 8.3, 11.7, 2.3],
  ['A46', 'GENAY', 1.7, 2.5, 4.2, 5.6, 1.0],
  ['A46', 'MIONNAY', 1.0, 1.5, 2.4, 3.3, 0.5],
  ['TML', 'LUSSE', 6.8, 10.7, 19.0, 31.9, 4.1], // tunnel Maurice-Lemaire
  ['A36', 'FONTAINE-LARIVIERE', 3.1, 4.9, 7.8, 10.9, 1.9],
  ['A406', 'CROTTET', 0.8, 1.2, 1.8, 2.3, 0.4],
  ['A719', 'VICHY', 1.2, 1.9, 2.9, 4.0, 0.7],
];

const AREA_ROWS: Row[] = [
  ['A410', 'CRUSEILLES EST/OUEST A410', 3.2, 4.9, 7.4, 9.4, 1.4],
  ['A41N', 'CRUSEILLES EST/OUEST A41N', 8.0, 14.9, 22.1, 27.2, 4.4],
  ['A41N', 'COPPONEX', 2.9, 5.4, 8.7, 11.1, 1.8],
  ['A43', 'CHIGNIN BRETELLE', 1.0, 1.6, 2.7, 3.7, 0.5],
  ['A51', 'LE CROZET', 4.5, 7.1, 10.0, 12.8, 2.0],
  ['A432', 'SAINT EXUPERY', 2.3, 3.6, 5.7, 7.0, 1.1],
  ['A43', 'CHESNES', 2.3, 3.6, 5.7, 7.0, 1.1],
];

const SOURCE =
  'APRR-AREA, « Péage à système ouvert », tarifs au 1er février 2026 (relevé le 2026-11-09)';

function toOpenTolls(network: 'APRR' | 'AREA', rows: Row[]): OpenToll[] {
  return rows.map(([road, name, c1, c2, c3, c4, c5]) => ({
    gate: `${network}:${name}`,
    name: `${name} (${road})`,
    prices: { 1: c1, 2: c2, 3: c3, 4: c4, 5: c5 },
    source: SOURCE,
    effectiveFrom: '2026-02-01',
  }));
}

export const OPEN_BARRIERS: readonly OpenToll[] = [
  ...toOpenTolls('APRR', APRR_ROWS),
  ...toOpenTolls('AREA', AREA_ROWS),
];
