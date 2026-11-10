import { describe, expect, it } from 'vitest';
import type { VehicleModel } from './ademe';
import {
  PHASE_RATIOS,
  detectDelimiter,
  groupEeaRecords,
  mergeVehicleSources,
  missingColumns,
  normalizeEeaRow,
  splitCsvLine,
  type EeaRow,
} from './eea';

const KADJAR: EeaRow = {
  MS: 'FR',
  Mk: 'RENAULT',
  Cn: 'KADJAR',
  Ft: 'petrol',
  Fm: 'M',
  'Ec (cm3)': '1332',
  'Ep (KW)': '103',
  'Ewltp (g/km)': '140',
  Fc: '6.2',
  Year: '2021',
};

describe('splitCsvLine / detectDelimiter', () => {
  it('gère les guillemets, les virgules internes et les guillemets doublés', () => {
    expect(splitCsvLine('a,"b,c","d ""e"""', ',')).toEqual(['a', 'b,c', 'd "e"']);
  });

  it('devine le séparateur depuis l’en-tête', () => {
    expect(detectDelimiter('MS;Mk;Cn;Ft')).toBe(';');
    expect(detectDelimiter('MS\tMk\tCn')).toBe('\t');
    expect(detectDelimiter('MS,Mk,Cn')).toBe(',');
  });

  it('signale les colonnes utiles absentes, sans tenir compte de la casse', () => {
    expect(missingColumns(['MS', 'Mk', 'Cn'])).toContain('ft');
    expect(missingColumns(Object.keys(KADJAR))).toEqual([]);
    // Fichier 2018 : colonnes en minuscules, pas de Fc mais du CO₂ WLTP.
    expect(
      missingColumns(['MS', 'Mk', 'Cn', 'Ft', 'Fm', 'ec (cm3)', 'ep (KW)', 'Ewltp (g/km)']),
    ).toEqual([]);
    // Ni Fc ni CO₂ WLTP : inexploitable.
    expect(missingColumns(['MS', 'Mk', 'Cn', 'Ft', 'Fm', 'ec (cm3)', 'ep (KW)'])).toEqual([
      'fc ou ewltp (g/km)',
    ]);
  });
});

describe('normalizeEeaRow : anciens fichiers', () => {
  const OLD: EeaRow = {
    MS: 'FR',
    Mk: 'RENAULT',
    Cn: 'KADJAR',
    Ft: 'Petrol',
    Fm: 'M',
    'ec (cm3)': '1332',
    'ep (KW)': '103',
    'Ewltp (g/km)': '140',
    'Enedc (g/km)': '120',
  };

  it('déduit la consommation du CO₂ WLTP quand Fc manque, avec l’année du fichier', () => {
    const r = normalizeEeaRow(OLD, 2018);
    expect(r?.litersPer100).toBeCloseTo(140 / 23.31, 2);
    expect(r?.year).toBe(2018);
    expect(r?.cylinderCm3).toBe(1332);
    expect(r?.fuel).toBe('gasoline');
  });

  it('ignore le CO₂ NEDC, trop optimiste', () => {
    expect(normalizeEeaRow({ ...OLD, 'Ewltp (g/km)': '' }, 2018)).toBeNull();
  });

  it('refuse une ligne sans année (ni colonne ni nom de fichier)', () => {
    expect(normalizeEeaRow(OLD)).toBeNull();
  });

  it('utilise le facteur du diesel pour un moteur diesel', () => {
    expect(normalizeEeaRow({ ...OLD, Ft: 'DIESEL' }, 2018)?.litersPer100).toBeCloseTo(
      140 / 26.4,
      2,
    );
  });

  it('préfère Fc au CO₂ quand les deux existent', () => {
    expect(normalizeEeaRow({ ...OLD, Fc: '6.2' }, 2018)?.litersPer100).toBe(6.2);
  });
});

describe('normalizeEeaRow', () => {
  it('retient une voiture essence française avec sa consommation', () => {
    expect(normalizeEeaRow(KADJAR)).toEqual({
      brand: 'RENAULT',
      model: 'KADJAR',
      fuel: 'gasoline',
      hybrid: false,
      cylinderCm3: 1332,
      powerKw: 103,
      litersPer100: 6.2,
      co2GPerKm: 140,
      year: 2021,
    });
  });

  it('écarte les autres pays', () => {
    expect(normalizeEeaRow({ ...KADJAR, MS: 'DE' })).toBeNull();
  });

  it('accepte le diesel et l’hybride non rechargeable, écarte le reste', () => {
    expect(normalizeEeaRow({ ...KADJAR, Ft: 'diesel' })?.fuel).toBe('diesel');
    expect(normalizeEeaRow({ ...KADJAR, Ft: 'petrol/electric', Fm: 'H' })).toMatchObject({
      fuel: 'gasoline',
      hybrid: true,
    });
    expect(normalizeEeaRow({ ...KADJAR, Ft: 'petrol/electric', Fm: 'P' })).toBeNull(); // rechargeable
    for (const ft of ['electric', 'lpg', 'e85', 'hydrogen', 'ng']) {
      expect(normalizeEeaRow({ ...KADJAR, Ft: ft })).toBeNull();
    }
    expect(normalizeEeaRow({ ...KADJAR, Fm: 'B' })).toBeNull(); // bicarburation
  });

  it('écarte une consommation absente ou absurde', () => {
    expect(normalizeEeaRow({ ...KADJAR, Fc: '', 'Ewltp (g/km)': '' })).toBeNull();
    expect(normalizeEeaRow({ ...KADJAR, Fc: '0' })).toBeNull();
    expect(normalizeEeaRow({ ...KADJAR, Fc: '95' })).toBeNull();
  });

  it('lit une virgule décimale', () => {
    expect(normalizeEeaRow({ ...KADJAR, Fc: '6,4' })?.litersPer100).toBe(6.4);
  });
});

describe('groupEeaRecords', () => {
  const rec = (over: Record<string, string>) => normalizeEeaRow({ ...KADJAR, ...over });

  it('regroupe les versions d’une même motorisation et garde l’année la plus récente', () => {
    const rows = [
      rec({ Fc: '6.0', Year: '2021' }),
      rec({ Fc: '6.4', Year: '2021' }),
      rec({ Fc: '9.9', Year: '2019' }), // plus ancienne : ignorée
    ].filter((r) => r !== null);
    const [v, ...others] = groupEeaRecords(rows);
    expect(others).toHaveLength(0);
    expect(v?.l100.mixed).toBe(6.2);
    expect(v?.source).toBe('eea-co2-monitoring');
    expect(v?.description).toBe('KADJAR 1332 cm³ 103 kW');
  });

  it('sépare les motorisations différentes', () => {
    const rows = [rec({}), rec({ 'Ep (KW)': '118' }), rec({ Ft: 'diesel' })].filter(
      (r) => r !== null,
    );
    expect(groupEeaRecords(rows)).toHaveLength(3);
  });

  it('déduit le détail par phase de la consommation mixte', () => {
    const [v] = groupEeaRecords([rec({ Fc: '6.0' })].filter((r) => r !== null));
    expect(v?.l100.low).toBeCloseTo(6 * PHASE_RATIOS.low, 2);
    expect(v?.l100.high).toBeCloseTo(6 * PHASE_RATIOS.high, 2);
    expect(v?.l100.extraHigh).toBeCloseTo(6 * PHASE_RATIOS.extraHigh, 2);
  });
});

describe('mergeVehicleSources', () => {
  const ademeClio: VehicleModel = {
    key: 'A',
    brand: 'B.M.W.',
    model: 'SERIE 1',
    label: '',
    description: '',
    fuel: 'gasoline',
    hybrid: false,
    gearbox: null,
    powerKw: null,
    co2MixedGPerKm: null,
    priceEur: null,
    l100: { low: 8, medium: null, high: 5, extraHigh: 7, mixed: 6 },
    source: 'ademe-car-labelling',
  };
  const eea = (brand: string, model: string): VehicleModel => ({
    ...ademeClio,
    key: `EEA|${brand}|${model}`,
    brand,
    model,
    source: 'eea-co2-monitoring',
  });

  it('garde l’ADEME quand elle couvre déjà le modèle (marque normalisée)', () => {
    const r = mergeVehicleSources([ademeClio], [eea('BMW', 'SERIE 1'), eea('RENAULT', 'KADJAR')]);
    expect(r.eeaDropped).toBe(1);
    expect(r.eeaKept).toBe(1);
    expect(r.vehicles.map((v) => v.model)).toEqual(['SERIE 1', 'KADJAR']);
  });

  it('ne confond pas « C3 » et « C3 AIRCROSS »', () => {
    const c3 = { ...ademeClio, brand: 'CITROEN', model: 'C3' };
    const r = mergeVehicleSources([c3], [eea('CITROEN', 'C3 AIRCROSS')]);
    expect(r.eeaKept).toBe(1);
  });
});
