import { describe, expect, it } from 'vitest';
import {
  FuelPriceTable,
  departmentQueryUrl,
  nationalQueryUrl,
  parseDepartmentPrices,
  parseNationalPrices,
  weightedFuelPrice,
} from './fuel-prices';

// Réponses réelles de l'API (2026-11-09), tronquées aux champs utiles.
const NATIONAL = {
  total_count: 9828,
  results: [
    {
      gazole_avg: 2.2037,
      gazole_med: 2.191,
      gazole_n: 9500,
      e10_avg: 2.0425,
      e10_med: 1.999,
      e10_n: 9000,
      sp98_avg: 2.1634,
      sp98_med: 2.15,
      sp98_n: 7000,
      sp95_avg: 2.1131,
      sp95_med: 2.1,
      sp95_n: 3000,
      e85_avg: 0.88,
      e85_med: 0.87,
      e85_n: 2000,
      gplc_avg: null,
      gplc_med: null,
      gplc_n: 0,
    },
  ],
};

const DEPARTMENTS = {
  total_count: 3,
  results: [
    { code_departement: null, gazole_avg: 2.4167, gazole_n: 4, e10_avg: 1.975, e10_n: 4 },
    { code_departement: '01', gazole_avg: 2.1885, gazole_n: 122, e10_avg: 2.0291, e10_n: 120 },
    { code_departement: '2A', gazole_avg: 2.243, gazole_n: 59, e10_avg: null, e10_n: 0 },
  ],
};

describe('requêtes', () => {
  it('construit l’URL nationale avec les agrégats de chaque produit', () => {
    const params = new URL(nationalQueryUrl()).searchParams;
    const select = params.get('select') ?? '';
    expect(select).toContain('avg(gazole_prix) as gazole_avg');
    expect(select).toContain('median(e10_prix) as e10_med');
    expect(select).toContain('count(sp98_prix) as sp98_n');
    expect(params.get('limit')).toBe('1');
  });

  it('encode les espaces en %20 (pas en « + »)', () => {
    expect(nationalQueryUrl()).not.toContain('+');
    expect(nationalQueryUrl()).toContain('%20as%20');
  });

  it('construit l’URL départementale groupée par département', () => {
    const params = new URL(departmentQueryUrl()).searchParams;
    expect(params.get('select')).toMatch(/^code_departement,/);
    expect(params.get('group_by')).toBe('code_departement');
    expect(params.get('limit')).toBe('120');
  });
});

describe('parseNationalPrices', () => {
  const stats = parseNationalPrices(NATIONAL);

  it('lit la moyenne, la médiane et le nombre de stations', () => {
    const gazole = stats.find((s) => s.product === 'gazole');
    expect(gazole).toEqual({
      scope: 'FR',
      product: 'gazole',
      avgEurPerL: 2.2037,
      medianEurPerL: 2.191,
      stations: 9500,
    });
  });

  it('ignore les produits sans prix (GPL)', () => {
    expect(stats.some((s) => s.product === 'gplc')).toBe(false);
  });

  it('renvoie une liste vide si la réponse est vide ou invalide', () => {
    expect(parseNationalPrices({ results: [] })).toEqual([]);
    expect(parseNationalPrices(null)).toEqual([]);
  });
});

describe('parseDepartmentPrices', () => {
  const stats = parseDepartmentPrices(DEPARTMENTS);

  it('ignore les stations sans département', () => {
    expect(stats.every((s) => s.scope !== 'null' && s.scope !== '')).toBe(true);
    expect(stats.some((s) => s.avgEurPerL === 2.4167)).toBe(false);
  });

  it('ignore un produit absent d’un département (E10 en Corse)', () => {
    expect(stats.some((s) => s.scope === '2A' && s.product === 'e10')).toBe(false);
    expect(stats.some((s) => s.scope === '2A' && s.product === 'gazole')).toBe(true);
  });
});

describe('weightedFuelPrice', () => {
  const table = new FuelPriceTable([
    ...parseNationalPrices(NATIONAL),
    ...parseDepartmentPrices(DEPARTMENTS),
  ]);

  it('pondère les prix départementaux par les kilomètres', () => {
    const price = weightedFuelPrice(
      [
        { department: '01', km: 100 },
        { department: '2A', km: 100 },
      ],
      table,
      'gazole',
    );
    expect(price).toBeCloseTo((2.1885 + 2.243) / 2, 6);
  });

  it('retombe sur la moyenne nationale pour un département sans prix', () => {
    const price = weightedFuelPrice([{ department: '99', km: 50 }], table, 'gazole');
    expect(price).toBeCloseTo(2.2037, 4);
  });

  it('renvoie la moyenne nationale sans trajet', () => {
    expect(weightedFuelPrice([], table, 'e10')).toBeCloseTo(2.0425, 4);
  });

  it('renvoie undefined quand aucun prix n’existe pour le produit', () => {
    expect(weightedFuelPrice([{ department: '01', km: 10 }], table, 'gplc')).toBeUndefined();
  });

  it('ignore les distances nulles ou négatives', () => {
    const price = weightedFuelPrice(
      [
        { department: '01', km: 0 },
        { department: '2A', km: 40 },
      ],
      table,
      'gazole',
    );
    expect(price).toBeCloseTo(2.243, 6);
  });
});
