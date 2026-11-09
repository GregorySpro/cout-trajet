import type { Concession } from './types';

/** Normalise un nom de gare : majuscules, sans accents, espaces simples. */
export function normalizeGateName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Identifiant stable d'une gare : `CONCESSION:NOM NORMALISÉ`. */
export function gateId(concession: Concession, name: string): string {
  return `${concession}:${normalizeGateName(name)}`;
}

/** Convertit « 41,30 » ou « 41,3 » en nombre ; `NaN` si illisible. */
export function parseFrenchNumber(text: string): number {
  return Number.parseFloat(text.trim().replace(',', '.'));
}
