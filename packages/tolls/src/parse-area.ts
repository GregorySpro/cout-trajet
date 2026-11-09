import { gateId, parseFrenchNumber } from './normalize';
import type { ClassPrices, ParseResult, PricePair } from './types';

// Fin de ligne : distance tarifaire puis les prix des classes 1 à 5.
const TAIL =
  /\s(\d+,\d{2})\s(\d+,\d{2}) €\s(\d+,\d{2}) €\s(\d+,\d{2}) €\s(\d+,\d{2}) €\s(\d+,\d{2}) €\s*$/;
// Début de ligne : « code entrée, gare d'entrée, code sortie, gare de sortie ».
const HEAD = /^(\d{3,5}) (.+?) (\d{3,5}) (.+)$/;

/**
 * Lit le texte extrait de la grille PDF d'AREA (Rhône-Alpes). Contrairement à la grille APRR, chaque
 * gare est précédée de son code numérique, ce qui permet de séparer sans ambiguïté la gare d'entrée
 * et la gare de sortie :
 *   `3007 AIGUEBELETTE 3010 AIX NORD 24,00 3,50 € 5,50 € 7,60 € 10,20 € 1,60 €`
 */
export function parseAreaText(text: string): ParseResult {
  const pairs: PricePair[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/\s+/g, ' ');
    const tail = TAIL.exec(line);
    if (!tail) continue;
    const head = HEAD.exec(line.slice(0, tail.index).trim());
    if (!head) {
      skipped++;
      continue;
    }
    const [, , nameIn, , nameOut] = head as unknown as [string, string, string, string, string];
    const [distance, c1, c2, c3, c4, c5] = tail.slice(1).map(parseFrenchNumber) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const prices: ClassPrices = { 1: c1, 2: c2, 3: c3, 4: c4, 5: c5 };
    pairs.push({
      concession: 'AREA',
      from: gateId('AREA', nameIn),
      to: gateId('AREA', nameOut),
      distanceKm: distance,
      prices,
    });
  }
  const warnings =
    skipped > 0 ? [`${skipped} ligne(s) de tarifs sans codes de gares ignorée(s).`] : [];
  return { pairs, warnings };
}
