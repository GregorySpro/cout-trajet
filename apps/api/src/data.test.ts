import type { Queryable } from '@cout-trajet/db';
import { describe, expect, it } from 'vitest';
import { indexVehicles, loadDataFromDatabase, parseBooths } from './data';

/** Faux client qui répond selon la table interrogée. */
function client(tables: Record<string, Record<string, unknown>[]>): Queryable {
  return {
    async query(sql) {
      const table = Object.keys(tables).find((t) => sql.includes(`public.${t}`));
      return { rows: table ? (tables[table] ?? []) : [] };
    },
  };
}

const PAIR_ROW = {
  from_gate: 'APRR:FLEURY-EN-BIERE',
  to_gate: 'APRR:VILLEFRANCHE-LIMAS',
  concession: 'APRR',
  distance_km: '430.28',
  price_c1: '41.30',
  price_c2: '64.30',
  price_c3: '101.00',
  price_c4: '139.10',
  price_c5: '24.80',
  source_id: 'aprr-2026-02',
};

describe('parseBooths / indexVehicles (chargement depuis les fichiers)', () => {
  it('ne garde que les gares nommées', () => {
    const booths = parseBooths({
      elements: [
        { lat: 1, lon: 2, tags: { name: 'Péage A', operator: 'APRR' } },
        { lat: 3, lon: 4, tags: {} },
      ],
    });
    expect(booths).toEqual([{ name: 'Péage A', operator: 'APRR', lat: 1, lon: 2 }]);
  });

  it('indexe les véhicules par clé', () => {
    expect(indexVehicles({ vehicles: [{ key: 'k1' }, { key: 'k2' }] }).size).toBe(2);
  });
});

describe('loadDataFromDatabase', () => {
  const tables = {
    toll_sources: [
      {
        id: 'aprr-2026-02',
        label: 'Grille APRR',
        effective_from: '2026-02-01',
        reliability: 'official',
      },
    ],
    toll_pairs: [PAIR_ROW],
    toll_open: [
      {
        gate: 'OUVRAGE:PONT DE NORMANDIE',
        name: 'Pont de Normandie',
        price_c1: '6.10',
        price_c2: '7.10',
        price_c3: '7.60',
        price_c4: '15.10',
        price_c5: '0.00',
        seasons: '[]',
        source: 'site officiel',
        effective_from: '2026-05-01',
      },
    ],
    osm_toll_booths: [
      { name: 'Péage de Fleury-en-Bière', operator: 'APRR', lat: 48.4259, lon: 2.5404 },
    ],
    vehicle_models: [
      {
        key: 'k',
        brand: 'RENAULT',
        model: 'KANGOO',
        label: 'KANGOO',
        description: 'KANGOO (130ch)',
        fuel: 'gasoline',
        hybrid: false,
        gearbox: null,
        power_kw: '96',
        co2_mixed_g_per_km: null,
        price_eur: null,
        l100_low: '8.74',
        l100_medium: null,
        l100_high: '6.19',
        l100_extra_high: '7.92',
        l100_mixed: '7.26',
      },
    ],
    fuel_prices: [
      {
        day: '2026-11-09',
        scope: 'FR',
        product: 'e10',
        avg_eur_per_l: '2.042',
        median_eur_per_l: '1.999',
        stations: 6820,
      },
      {
        day: '2026-11-09',
        scope: '75',
        product: 'e10',
        avg_eur_per_l: '2.110',
        median_eur_per_l: null,
        stations: 200,
      },
    ],
  };

  it('reconstitue le livre de tarifs avec ses sources', async () => {
    const data = await loadDataFromDatabase(client(tables));
    expect(data.book.priceBetween('APRR:FLEURY-EN-BIERE', 'APRR:VILLEFRANCHE-LIMAS', 1)).toBe(41.3);
    expect(data.book.find('APRR:FLEURY-EN-BIERE', 'APRR:VILLEFRANCHE-LIMAS')?.source?.label).toBe(
      'Grille APRR',
    );
  });

  it('charge gares, véhicules et péages à tarif fixe', async () => {
    const data = await loadDataFromDatabase(client(tables));
    expect(data.booths).toHaveLength(1);
    expect(data.vehicles.get('k')?.l100.extraHigh).toBe(7.92);
    expect(data.openTolls?.[0]?.gate).toBe('OUVRAGE:PONT DE NORMANDIE');
  });

  it('sépare le prix national des prix départementaux', async () => {
    const data = await loadDataFromDatabase(client(tables));
    expect(data.fuelSnapshot?.snapshot.national).toHaveLength(1);
    expect(data.fuelSnapshot?.snapshot.departments[0]?.scope).toBe('75');
    expect(data.fuelSnapshot?.fetchedAt).toBe('2026-11-09T00:00:00.000Z');
  });

  it('sans prix en base, aucun relevé initial (récupération en direct)', async () => {
    const data = await loadDataFromDatabase(client({ ...tables, fuel_prices: [] }));
    expect(data.fuelSnapshot).toBeUndefined();
  });

  it('sans péages à tarif fixe en base, utilise ceux du code', async () => {
    const data = await loadDataFromDatabase(client({ ...tables, toll_open: [] }));
    expect(data.openTolls).toBeUndefined();
  });
});
