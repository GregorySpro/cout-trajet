import { gateId, parseFrenchNumber } from './normalize';
import type { ClassPrices, Concession, ParseResult, PricePair } from './types';

/**
 * Lit un fichier de tarifs Vinci Autoroutes (CSV `;`).
 * Les colonnes sont repérées par leur nom d'en-tête (`nom_entree`, `nom_sortie`, `classe1` … `classe5`),
 * car les fichiers n'ont pas tous la même largeur (ASF/Escota : 9 colonnes ; Cofiroute : 11, avec
 * des colonnes d'échangeur). La décimale peut être une virgule ou un point.
 */
export function parseVinciCsv(text: string, concession: Concession): ParseResult {
  const pairs: PricePair[] = [];
  const warnings: string[] = [];
  // Retire l'éventuelle marque d'ordre des octets (BOM, code 65279) en tête de fichier.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(/\r?\n/);

  const header = (lines[0] ?? '').trim().toLowerCase().split(';');
  const col = (name: string): number => header.indexOf(name);
  const iIn = col('nom_entree');
  const iOut = col('nom_sortie');
  const iClass = [1, 2, 3, 4, 5].map((c) => col(`classe${c}`));
  if (iIn < 0 || iOut < 0 || iClass.some((i) => i < 0)) {
    return {
      pairs,
      warnings: ['En-tête non reconnu : colonnes nom_entree/nom_sortie/classe1-5 attendues.'],
    };
  }

  let unreadable = 0;
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || index === 0) return; // ligne vide ou en-tête
    const cols = line.split(';');
    const nameIn = (cols[iIn] ?? '').trim();
    const nameOut = (cols[iOut] ?? '').trim();
    const values = iClass.map((i) => parseFrenchNumber(cols[i] ?? ''));
    if (nameIn === '' || nameOut === '' || values.some((v) => Number.isNaN(v))) {
      unreadable++;
      return;
    }
    const prices: ClassPrices = {
      1: values[0] as number,
      2: values[1] as number,
      3: values[2] as number,
      4: values[3] as number,
      5: values[4] as number,
    };
    pairs.push({
      concession,
      from: gateId(concession, nameIn),
      to: gateId(concession, nameOut),
      distanceKm: null,
      prices,
    });
  });
  if (unreadable > 0)
    warnings.push(`${unreadable} ligne(s) ignorée(s) : valeurs illisibles ou manquantes.`);

  return { pairs, warnings };
}
