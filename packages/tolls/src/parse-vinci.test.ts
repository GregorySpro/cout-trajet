import { describe, expect, it } from 'vitest';
import { parseVinciCsv } from './parse-vinci';

const BOM = String.fromCharCode(0xfeff);
const CSV =
  BOM +
  'autoroute_entree;nom_entree;autoroute_sortie;nom_sortie;classe1;classe2;classe3;classe4;classe5\r\n' +
  'A7;VIENNE;A7;LANCON;28,1;45,7;60,3;81,7;17\r\n' +
  'A62;TOULOUSE-NORD/EST;A62;SAINT-SELVE;22,9;36;52,5;67;14,1\r\n' +
  'A62;TOULOUSE-NORD/OUEST;A62;SAINT-SELVE;22,2;35;51;64,9;13,7\r\n' +
  '\r\n';

describe('parseVinciCsv', () => {
  const { pairs, warnings } = parseVinciCsv(CSV, 'ASF');

  it('lit les trois lignes de tarifs (BOM, CRLF et ligne vide gérés)', () => {
    expect(pairs).toHaveLength(3);
    expect(warnings).toEqual([]);
  });

  it('produit des identifiants de gare normalisés par réseau', () => {
    expect(pairs[0]?.from).toBe('ASF:VIENNE');
    expect(pairs[0]?.to).toBe('ASF:LANCON');
    expect(pairs[1]?.from).toBe('ASF:TOULOUSE-NORD/EST');
  });

  it('lit les prix des classes 1 à 5 (décimale virgule)', () => {
    expect(pairs[0]?.prices).toEqual({ 1: 28.1, 2: 45.7, 3: 60.3, 4: 81.7, 5: 17 });
    expect(pairs[2]?.prices[1]).toBe(22.2);
  });

  it('signale les lignes illisibles au lieu de les deviner', () => {
    const header =
      'autoroute_entree;nom_entree;autoroute_sortie;nom_sortie;classe1;classe2;classe3;classe4;classe5';
    const bad = parseVinciCsv(
      `${header}\nA7;X;A7;Y;abc;1;1;1;1\nA7;seulement;trois\nA7;SALON;A7;ORANGE;#N/A;#N/A;#N/A;#N/A;#N/A`,
      'ASF',
    );
    expect(bad.pairs).toHaveLength(0);
    expect(bad.warnings).toEqual(['3 ligne(s) ignorée(s) : valeurs illisibles ou manquantes.']);
  });

  it('lit le format Cofiroute (11 colonnes, décimale point)', () => {
    const cofiroute =
      'autoroute_entree;echangeur_entree;nom_entree;autoroute_sortie;echangeur_sortie;nom_sortie;classe1;classe2;classe3;classe4;classe5\r\n' +
      'A11;1;ABLIS;A28;18;ALENCON NORD;21.8;33.7;52.3;72.9;12.9\r\n';
    const r = parseVinciCsv(cofiroute, 'COFIROUTE');
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]?.from).toBe('COFIROUTE:ABLIS');
    expect(r.pairs[0]?.to).toBe('COFIROUTE:ALENCON NORD');
    expect(r.pairs[0]?.prices[1]).toBe(21.8);
  });

  it('refuse un fichier dont l’en-tête est inconnu', () => {
    const r = parseVinciCsv('a;b;c\n1;2;3', 'ASF');
    expect(r.pairs).toHaveLength(0);
    expect(r.warnings[0]).toContain('En-tête non reconnu');
  });
});
