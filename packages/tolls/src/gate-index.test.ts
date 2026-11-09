import { describe, expect, it } from 'vitest';
import { GateIndex, looseKey, osmBaseName } from './gate-index';

describe('osmBaseName', () => {
  it('retire les préfixes « Péage de », « Gare de péage de », « Barrière de péage de »', () => {
    expect(osmBaseName('Péage de Fleury-en-Bière')).toBe('FLEURY-EN-BIERE');
    expect(osmBaseName('Gare de péage de Soirans')).toBe('SOIRANS');
    expect(osmBaseName('Barrière de péage de Saint-Avold')).toBe('SAINT-AVOLD');
    expect(osmBaseName("Péage d'Hordain")).toBe('HORDAIN');
    expect(osmBaseName('Quincieux Barrière')).toBe('QUINCIEUX');
  });

  it('laisse un nom sans préfixe inchangé (hors casse et accents)', () => {
    expect(osmBaseName('Orléans Nord')).toBe('ORLEANS NORD');
  });

  it('peut conserver le suffixe « Barrière » quand la grille s’en sert', () => {
    expect(osmBaseName('Quincieux Barrière', true)).toBe('QUINCIEUX BARRIERE');
  });
});

describe('GateIndex — suffixe « Barrière » (grille AREA)', () => {
  const index = new GateIndex([
    'AREA:ST QUENTIN FAL. BARRIERE',
    'AREA:ST QUENTIN FAL. BRETELLE',
    'AREA:ANNECY CENTRE',
    'APRR:QUINCIEUX',
  ]);

  it('retrouve « Saint-Quentin-Fal. Barrière » sans le confondre avec la bretelle', () => {
    expect(index.match('AREA', 'Saint-Quentin-Fal. Barrière')).toEqual({
      gates: ['AREA:ST QUENTIN FAL. BARRIERE'],
      kind: 'loose',
    });
  });

  it('le suffixe est ignoré quand la grille ne l’utilise pas', () => {
    expect(index.match('APRR', 'Quincieux Barrière')).toEqual({
      gates: ['APRR:QUINCIEUX'],
      kind: 'exact',
    });
  });
});

describe('looseKey', () => {
  it('ignore ponctuation, espaces, parenthèses et numéros de sortie', () => {
    expect(looseKey('TOURS CENTRE (MONNAIE)')).toBe('TOURSCENTRE');
    expect(looseKey('PERONNE / VALLEE DE LA SOMME N°13')).toBe('PERONNEVALLEEDELASOMME');
    expect(looseKey('LE-BOULOU')).toBe(looseKey('LE BOULOU'));
  });

  it('unifie Saint / St et « S/ » / « sur »', () => {
    expect(looseKey('SAINT-SELVE')).toBe(looseKey('ST SELVE'));
    expect(looseKey('BELLEVILLE S/SAONE')).toBe(looseKey('BELLEVILLE SUR SAONE'));
  });
});

describe('GateIndex', () => {
  const index = new GateIndex([
    'APRR:BELLEVILLE S/SAONE',
    'APRR:AMBERIEU',
    'COFIROUTE:ORLEANS NORD',
    'COFIROUTE:TOURS CENTRE (MONNAIE)',
    'COFIROUTE:ANGERS (CORZE)',
    'ASF:TOULOUSE-NORD/EST',
    'ASF:TOULOUSE-NORD/OUEST',
    'ASF:LE BOULOU',
    'SANEF:PARIS / ROISSY (PEAGE DE CHAMANT)',
  ]);

  it('exact : même nom après normalisation', () => {
    expect(index.match('COFIROUTE', 'Orléans Nord')).toEqual({
      gates: ['COFIROUTE:ORLEANS NORD'],
      kind: 'exact',
    });
  });

  it('souple : « Belleville-sur-Saône » ↔ « Belleville S/Saône »', () => {
    expect(index.match('APRR', 'Belleville-sur-Saône')).toEqual({
      gates: ['APRR:BELLEVILLE S/SAONE'],
      kind: 'loose',
    });
  });

  it('alias : le nom OpenStreetMap est le texte entre parenthèses de la gare de grille', () => {
    expect(index.match('COFIROUTE', 'Péage de Monnaie')).toEqual({
      gates: ['COFIROUTE:TOURS CENTRE (MONNAIE)'],
      kind: 'alias',
    });
    expect(index.match('COFIROUTE', 'Corzé')?.kind).toBe('alias');
  });

  it('alias : « Chamant » retrouve la gare Sanef « Paris / Roissy (péage de Chamant) »', () => {
    expect(index.match('SANEF', 'Péage de Chamant')).toEqual({
      gates: ['SANEF:PARIS / ROISSY (PEAGE DE CHAMANT)'],
      kind: 'alias',
    });
  });

  it('ambigu : « Toulouse Nord » correspond à l’Est et à l’Ouest', () => {
    const m = index.match('ASF', 'Péage de Toulouse Nord');
    expect(m?.gates).toEqual(['ASF:TOULOUSE-NORD/EST', 'ASF:TOULOUSE-NORD/OUEST']);
    expect(m?.kind).toBe('alias');
  });

  it('ne rapproche jamais d’un autre réseau', () => {
    expect(index.match('ASF', 'Orléans Nord')).toBeUndefined();
    expect(index.match('INCONNU', 'Orléans Nord')).toBeUndefined();
  });

  it('aucun rapprochement quand le nom est trop différent (pas de ressemblance floue)', () => {
    expect(index.match('APRR', 'Amberieu-en-Bugey')).toBeUndefined();
    expect(index.match('COFIROUTE', 'Saint-Arnoult')).toBeUndefined();
  });

  it('ignore un nom vide ou réduit à de la ponctuation', () => {
    expect(index.match('APRR', '---')).toBeUndefined();
  });
});
