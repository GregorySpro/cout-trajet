import { describe, expect, it } from 'vitest';
import { parseAprrText } from './parse-aprr';

const TEXT = `APRR - Tarifs de péage en euros TTC
en vigueur au 1er février 2026
Gare d'entrée Gare de sortie Distance tarifaire en Km Classe 1 Classe 2 Classe 3 Classe 4 Classe 5
FLEURY-EN-BIERE BELLEVILLE S/SAONE 385,58 36,90 € 57,40 € 88,60 € 121,00 € 22,10 €
FLEURY-EN-BIERE VILLEFRANCHE-LIMAS 430,28 41,30 € 64,30 € 101,00 € 139,10 € 24,80 €
BELLEVILLE S/SAONE FLEURY-EN-BIERE 385,58 36,90 € 57,40 € 88,60 € 121,00 € 22,10 €
VILLEFRANCHE-LIMAS FLEURY-EN-BIERE 430,28 41,30 € 64,30 € 101,00 € 139,10 € 24,80 €
VILLEFRANCHE-LIMAS BELLEVILLE S/SAONE 44,70 4,10 € 6,10 € 8,90 € 12,00 € 2,40 €
BELLEVILLE S/SAONE VILLEFRANCHE-LIMAS 44,70 4,10 € 6,10 € 8,90 € 12,00 € 2,40 €
`;

describe('parseAprrText', () => {
  const { pairs, warnings } = parseAprrText(TEXT);
  const find = (from: string, to: string) =>
    pairs.find((p) => p.from === `APRR:${from}` && p.to === `APRR:${to}`);

  it('ignore les lignes d’en-tête et lit les 6 lignes de tarifs', () => {
    expect(pairs).toHaveLength(6);
    expect(warnings).toEqual([]);
  });

  it('lit Fleury-en-Bière → Villefranche-Limas : 41,30 € en classe 1', () => {
    const p = find('FLEURY-EN-BIERE', 'VILLEFRANCHE-LIMAS');
    expect(p?.prices[1]).toBe(41.3);
    expect(p?.prices[2]).toBe(64.3);
    expect(p?.distanceKm).toBe(430.28);
  });

  it('retrouve les noms de gare à plusieurs mots grâce à la symétrie de la grille', () => {
    expect(find('FLEURY-EN-BIERE', 'BELLEVILLE S/SAONE')?.prices[1]).toBe(36.9);
    expect(find('BELLEVILLE S/SAONE', 'FLEURY-EN-BIERE')?.prices[1]).toBe(36.9);
    expect(find('BELLEVILLE S/SAONE', 'VILLEFRANCHE-LIMAS')?.prices[1]).toBe(4.1);
  });

  it('marque le réseau AREA quand demandé', () => {
    const area = parseAprrText(TEXT, 'AREA');
    expect(area.pairs[0]?.concession).toBe('AREA');
    expect(area.pairs[0]?.from.startsWith('AREA:')).toBe(true);
  });
});
