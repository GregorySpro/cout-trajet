import { describe, expect, it } from 'vitest';
import { parseSanefText } from './parse-sanef';

/** Construit une brochure fictive de 6 pages ; le prix de la classe c vaut le prix de base × c. */
function brochure(rows: string[][], broken = false): string {
  let text = '=====PAGE 1=====\nTarifs de péage\n';
  for (let page = 2; page <= 6; page++) {
    const cls = page - 1;
    text += `=====PAGE ${page}=====\nTARIFS DE PEAGE TTC AU 01/02/2026 CLASSE ${cls}\n`;
    for (const [label, ...values] of rows) {
      const scaled = values.map((v) => (Number(v) * cls).toFixed(1).replace('.', ','));
      if (broken && label === 'LILLERS N°5') scaled.pop(); // ligne trop courte
      text += `${scaled.join(' ')}${scaled.length > 0 ? ' ' : ''}${label}\n`;
    }
  }
  return text;
}

const ROWS: string[][] = [
  ['CALAIS (péage de Setques)'],
  ['SAINT-OMER N°3', '2.8'],
  ['AIRE-SUR-LA-LYS N°4', '3.3', '0.8'],
  ['LILLERS N°5', '5.5', '2.5', '1.6'],
];

describe('parseSanefText', () => {
  it('lit une matrice triangulaire et fusionne les 5 classes', () => {
    const { pairs, warnings } = parseSanefText(brochure(ROWS));
    expect(warnings).toEqual([]);
    expect(pairs).toHaveLength(6); // 4 gares → 6 couples
    const p = pairs.find(
      (x) => x.from === 'SANEF:LILLERS N°5' && x.to === 'SANEF:CALAIS (PEAGE DE SETQUES)',
    );
    expect(p?.prices[1]).toBe(5.5);
    expect(p?.prices[3]).toBe(16.5);
  });

  it('recolle une étiquette coupée sur deux lignes', () => {
    const rows: string[][] = [
      ['CALAIS (péage de Setques)'],
      ['SAINT-OMER N°3', '2.8'],
      ['AIRE-SUR-LA-LYS N°4', '3.3', '0.8'],
    ];
    const text = brochure(rows).replaceAll(
      'AIRE-SUR-LA-LYS N°4\n',
      "AIRE-SUR-LA-LYS N°4\n(péage d'Haudricourt)\n",
    );
    const { pairs } = parseSanefText(text);
    expect(pairs.some((p) => p.from.includes("(PEAGE D'HAUDRICOURT)"))).toBe(true);
  });

  it('rejette une section dont une ligne n’a pas la bonne longueur', () => {
    const { pairs, warnings } = parseSanefText(brochure(ROWS, true));
    expect(pairs).toHaveLength(0);
    expect(warnings.some((w) => w.includes('rejetée'))).toBe(true);
  });

  it('ignore la couverture (page 1)', () => {
    const { pairs } = parseSanefText('=====PAGE 1=====\nTarifs de péage\n2026');
    expect(pairs).toHaveLength(0);
  });
});
