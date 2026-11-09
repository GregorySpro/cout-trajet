import { describe, expect, it } from 'vitest';
import { parseAreaText } from './parse-area';
import { parseSanefText } from './parse-sanef';

// Extrait réel de la grille AREA au 1er février 2026.
const AREA = `
AREA - Tarifs de péage en euros TTC
en vigueur au 1er février 2026
Code Entrée Gare d'entrée Code Sortie Gare de sortie Distance
tarifaire en
Km
Classe 1 Classe 2 Classe 3 Classe 4 Classe 5
3007 AIGUEBELETTE 3010 AIX NORD 24,00 3,50 € 5,50 € 7,60 € 10,20 € 1,60 €
3007 AIGUEBELETTE 3012 ANNECY CENTRE 50,00 7,00 € 10,50 € 15,10 € 20,20 € 3,50 €
3007 AIGUEBELETTE 3008 CHAMBERY NORD 10,00 1,60 € 2,60 € 3,80 € 5,10 € 0,80 €
`;

describe('parseAreaText', () => {
  const { pairs, warnings } = parseAreaText(AREA);

  it('ignore les en-têtes et lit les trois lignes de tarifs', () => {
    expect(pairs).toHaveLength(3);
    expect(warnings).toEqual([]);
  });

  it('sépare gare d’entrée et gare de sortie grâce aux codes (noms à plusieurs mots)', () => {
    expect(pairs[0]?.from).toBe('AREA:AIGUEBELETTE');
    expect(pairs[0]?.to).toBe('AREA:AIX NORD');
    expect(pairs[1]?.to).toBe('AREA:ANNECY CENTRE');
  });

  it('lit la distance et les prix des cinq classes', () => {
    expect(pairs[0]?.distanceKm).toBe(24);
    expect(pairs[0]?.prices).toEqual({ 1: 3.5, 2: 5.5, 3: 7.6, 4: 10.2, 5: 1.6 });
    expect(pairs[1]?.prices[1]).toBe(7);
  });

  it('marque le réseau AREA', () => {
    expect(pairs.every((p) => p.concession === 'AREA')).toBe(true);
  });

  it('signale une ligne de tarifs sans codes au lieu de la deviner', () => {
    const r = parseAreaText('AIGUEBELETTE AIX NORD 24,00 3,50 € 5,50 € 7,60 € 10,20 € 1,60 €');
    expect(r.pairs).toHaveLength(0);
    expect(r.warnings[0]).toContain('sans codes');
  });
});

describe('parseSanefText pour le réseau SAPN', () => {
  function brochure(): string {
    let text = '=====PAGE 1=====\nTarifs de péage\n';
    for (let page = 2; page <= 6; page++) {
      const cls = page - 1;
      text += `=====PAGE ${page}=====\n`;
      text += 'LE HAVRE N°5 / A131\n';
      text += `${(1.2 * cls).toFixed(2).replace('.', ',')} ST-ROMAIN-DE-COLBOSC N°6\n`;
      text += `${(2.5 * cls).toFixed(2).replace('.', ',')} ${(1.0 * cls).toFixed(2).replace('.', ',')} BOLBEC N°7\n`;
    }
    return text;
  }

  it('produit des gares du réseau SAPN quand on le demande', () => {
    const { pairs } = parseSanefText(brochure(), 'SAPN');
    expect(pairs).toHaveLength(3);
    expect(pairs.every((p) => p.concession === 'SAPN' && p.from.startsWith('SAPN:'))).toBe(true);
    const p = pairs.find(
      (x) => x.from === 'SAPN:BOLBEC N°7' && x.to === 'SAPN:LE HAVRE N°5 / A131',
    );
    expect(p?.prices[1]).toBe(2.5);
    expect(p?.prices[4]).toBe(10);
  });

  it('reste Sanef par défaut', () => {
    const { pairs } = parseSanefText(brochure());
    expect(pairs.every((p) => p.concession === 'SANEF')).toBe(true);
  });
});
