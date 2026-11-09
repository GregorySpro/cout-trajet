import { describe, expect, it } from 'vitest';
import type { PricePair, PriceSource } from '@cout-trajet/tolls';
import { buildInsert, loadReferenceData, type ReferenceData } from './load';
import { applyMigrations, type Queryable } from './migrate';
import {
  boothsFromRows,
  fuelStatsFromRows,
  openTollsFromRows,
  pricePairsFromRows,
  sourcesFromRows,
  vehiclesFromRows,
} from './read';
import { chunk, dayOf, fuelColumns, pairColumns, sourcesFromPairs } from './rows';

/** Faux client : enregistre les requêtes et renvoie des lignes prédéfinies. */
function fakeClient(
  options: { rows?: (sql: string) => Record<string, unknown>[]; failOn?: RegExp } = {},
) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const client: Queryable = {
    async query(sql, values) {
      calls.push(values ? { sql, values } : { sql });
      if (options.failOn?.test(sql)) throw new Error('échec simulé');
      return { rows: options.rows?.(sql) ?? [] };
    },
  };
  return { client, calls };
}

const SRC: PriceSource = {
  id: 'aprr-2026-02',
  label: 'Grille APRR au 01/02/2026',
  effectiveFrom: '2026-02-01',
  reliability: 'official',
};
const PAIR: PricePair = {
  concession: 'APRR',
  from: 'APRR:FLEURY-EN-BIERE',
  to: 'APRR:VILLEFRANCHE-LIMAS',
  distanceKm: 430.28,
  prices: { 1: 41.3, 2: 64.3, 3: 101, 4: 139.1, 5: 24.8 },
  source: SRC,
};

describe('applyMigrations', () => {
  const migrations = [
    { name: '002_b.sql', sql: 'create table b()' },
    { name: '001_a.sql', sql: 'create table a()' },
  ];

  it('applique les migrations dans l’ordre alphabétique, chacune dans une transaction', async () => {
    const { client, calls } = fakeClient();
    const applied = await applyMigrations(client, migrations);
    expect(applied).toEqual(['001_a.sql', '002_b.sql']);
    const sqls = calls.map((c) => c.sql);
    expect(sqls.indexOf('create table a()')).toBeLessThan(sqls.indexOf('create table b()'));
    expect(sqls.filter((s) => s === 'begin')).toHaveLength(2);
    expect(sqls.filter((s) => s === 'commit')).toHaveLength(2);
  });

  it('ne rejoue pas une migration déjà appliquée', async () => {
    const { client, calls } = fakeClient({
      rows: (sql) => (sql.startsWith('select name') ? [{ name: '001_a.sql' }] : []),
    });
    const applied = await applyMigrations(client, migrations);
    expect(applied).toEqual(['002_b.sql']);
    expect(calls.some((c) => c.sql === 'create table a()')).toBe(false);
  });

  it('annule la transaction et signale la migration fautive', async () => {
    const { client, calls } = fakeClient({ failOn: /create table b/ });
    await expect(applyMigrations(client, migrations)).rejects.toThrow('002_b.sql');
    expect(calls.map((c) => c.sql)).toContain('rollback');
    // La migration fautive n'est pas enregistrée comme appliquée.
    expect(
      calls
        .filter((c) => c.sql.startsWith('insert into public.schema_migrations'))
        .map((c) => c.values),
    ).toEqual([['001_a.sql']]);
  });

  it('protège la table de suivi par la RLS', async () => {
    const { client, calls } = fakeClient();
    await applyMigrations(client, []);
    expect(calls.some((c) => /enable row level security/.test(c.sql))).toBe(true);
  });
});

describe('colonnes et lots', () => {
  it('chunk découpe en lots de taille fixe', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });

  it('pairColumns produit un tableau par colonne, dans le même ordre', () => {
    const c = pairColumns([PAIR, { ...PAIR, to: 'APRR:X', source: undefined as never }]);
    expect(c['from_gate']).toEqual(['APRR:FLEURY-EN-BIERE', 'APRR:FLEURY-EN-BIERE']);
    expect(c['price_c1']).toEqual([41.3, 41.3]);
    expect(c['price_c4']).toEqual([139.1, 139.1]);
    expect(c['source_id']).toEqual(['aprr-2026-02', null]);
  });

  it('sourcesFromPairs dédoublonne par identifiant', () => {
    expect(sourcesFromPairs([PAIR, { ...PAIR, to: 'APRR:Y' }])).toEqual([SRC]);
  });

  it('dayOf garde le jour UTC et refuse une date illisible', () => {
    expect(dayOf('2026-11-09T13:47:45.328Z')).toBe('2026-11-09');
    expect(() => dayOf('n’importe quoi')).toThrow(RangeError);
  });

  it('fuelColumns arrondit les prix au millième et garde la médiane absente', () => {
    const c = fuelColumns(
      {
        national: [
          {
            scope: 'FR',
            product: 'gazole',
            avgEurPerL: 2.20372574,
            medianEurPerL: 2.19099,
            stations: 8955,
          },
        ],
        departments: [
          { scope: '75', product: 'gazole', avgEurPerL: 2.325, medianEurPerL: null, stations: 300 },
        ],
      },
      '2026-11-09',
    );
    expect(c['avg_eur_per_l']).toEqual([2.204, 2.325]);
    expect(c['median_eur_per_l']).toEqual([2.191, null]);
    expect(c['day']).toEqual(['2026-11-09', '2026-11-09']);
  });
});

describe('buildInsert', () => {
  it('développe un tableau par colonne avec unnest (insertion simple)', () => {
    const sql = buildInsert({
      table: 'toll_sources',
      types: { id: 'text', effective_from: 'date' },
    });
    expect(sql).toBe(
      'insert into public.toll_sources (id, effective_from) select id, effective_from from unnest($1::text[], $2::date[]) as t(id, effective_from)',
    );
  });

  it('convertit les colonnes jsonb depuis du texte', () => {
    const sql = buildInsert({ table: 't', types: { gate: 'text', seasons: 'jsonb' } });
    expect(sql).toContain('$2::text[]');
    expect(sql).toContain('seasons::jsonb');
  });

  it('ajoute un « upsert » quand une clé est fournie', () => {
    const sql = buildInsert({
      table: 'vehicle_models',
      key: ['key'],
      types: { key: 'text', brand: 'text' },
    });
    expect(sql).toContain('on conflict (key) do update set brand = excluded.brand');
  });
});

describe('loadReferenceData', () => {
  const data: ReferenceData = {
    pairs: [PAIR],
    openTolls: [
      {
        gate: 'OUVRAGE:PONT DE NORMANDIE',
        name: 'Pont de Normandie',
        prices: { 1: 6.1, 2: 7.1, 3: 7.6, 4: 15.1, 5: 0 },
        source: 'site officiel',
        effectiveFrom: '2026-05-01',
      },
    ],
    booths: [{ osmId: 1, name: 'Péage de Fleury-en-Bière', operator: 'APRR', lat: 48.4, lon: 2.5 }],
    vehicles: [],
    meta: { toll_book_generated_at: '2026-11-09T10:00:00Z' },
  };

  it('remplace les tarifs et les gares dans une seule transaction, dans le bon ordre', async () => {
    const { client, calls } = fakeClient();
    const report = await loadReferenceData(client, data);
    const sqls = calls.map((c) => c.sql);
    expect(sqls[0]).toBe('begin');
    expect(sqls[sqls.length - 1]).toBe('commit');
    expect(sqls[1]).toContain('truncate table');
    // Les sources doivent exister avant les tarifs qui les référencent.
    const iSources = sqls.findIndex((s) => s.includes('into public.toll_sources'));
    const iPairs = sqls.findIndex((s) => s.includes('into public.toll_pairs'));
    expect(iSources).toBeGreaterThan(0);
    expect(iPairs).toBeGreaterThan(iSources);
    expect(report).toMatchObject({ tollSources: 1, tollPairs: 1, tollOpen: 1, boothCount: 1 });
  });

  it('ne vide jamais les véhicules (référencés par les garages des utilisateurs)', async () => {
    const { client, calls } = fakeClient();
    await loadReferenceData(client, data);
    const truncate = calls.find((c) => c.sql.startsWith('truncate'))?.sql ?? '';
    expect(truncate).not.toContain('vehicle_models');
    expect(truncate).not.toContain('fuel_prices');
  });

  it('découpe les gros jeux en lots', async () => {
    const many: ReferenceData = {
      ...data,
      pairs: Array.from({ length: 7 }, (_, i) => ({ ...PAIR, to: `APRR:G${i}` })),
    };
    const { client, calls } = fakeClient();
    await loadReferenceData(client, many, 3);
    expect(calls.filter((c) => c.sql.includes('into public.toll_pairs'))).toHaveLength(3);
  });

  it('enregistre les dates d’import dans reference_data_meta', async () => {
    const { client, calls } = fakeClient();
    await loadReferenceData(client, data);
    const keys = calls
      .filter((c) => c.sql.includes('into public.reference_data_meta'))
      .map((c) => c.values?.[0]);
    expect(keys).toContain('toll_book_generated_at');
    expect(keys).toContain('loaded_at');
  });

  it('annule tout en cas d’erreur', async () => {
    const { client, calls } = fakeClient({ failOn: /into public\.toll_open/ });
    await expect(loadReferenceData(client, data)).rejects.toThrow('échec simulé');
    expect(calls[calls.length - 1]?.sql).toBe('rollback');
    expect(calls.some((c) => c.sql === 'commit')).toBe(false);
  });

  it('charge les prix du carburant seulement quand ils sont fournis', async () => {
    const withFuel: ReferenceData = {
      ...data,
      fuel: {
        snapshot: {
          national: [
            { scope: 'FR', product: 'e10', avgEurPerL: 2.04, medianEurPerL: 2, stations: 9 },
          ],
          departments: [],
        },
        fetchedAt: '2026-11-09T13:00:00Z',
      },
    };
    const { client, calls } = fakeClient();
    const report = await loadReferenceData(client, withFuel);
    expect(report.fuelPrices).toBe(1);
    expect(calls.some((c) => c.sql.includes('into public.fuel_prices'))).toBe(true);
    const none = fakeClient();
    await loadReferenceData(none.client, data);
    expect(none.calls.some((c) => c.sql.includes('into public.fuel_prices'))).toBe(false);
  });
});

describe('lecture : lignes Postgres → objets du domaine', () => {
  it('reconstitue un tarif avec sa source (numeric reçu en texte)', () => {
    const sources = sourcesFromRows([
      {
        id: 'aprr-2026-02',
        label: 'Grille APRR',
        effective_from: new Date('2026-02-01'),
        reliability: 'official',
      },
    ]);
    const [pair] = pricePairsFromRows(
      [
        {
          from_gate: 'APRR:A',
          to_gate: 'APRR:B',
          concession: 'APRR',
          distance_km: '430.28',
          price_c1: '41.30',
          price_c2: '64.30',
          price_c3: '101.00',
          price_c4: '139.10',
          price_c5: '24.80',
          source_id: 'aprr-2026-02',
        },
      ],
      sources,
    );
    expect(pair?.prices).toEqual({ 1: 41.3, 2: 64.3, 3: 101, 4: 139.1, 5: 24.8 });
    expect(pair?.distanceKm).toBe(430.28);
    expect(pair?.source).toMatchObject({ id: 'aprr-2026-02', effectiveFrom: '2026-02-01' });
  });

  it('un tarif sans distance ni source reste valide', () => {
    const [pair] = pricePairsFromRows(
      [
        {
          from_gate: 'A:X',
          to_gate: 'A:Y',
          concession: 'ASF',
          distance_km: null,
          price_c1: '1',
          price_c2: '2',
          price_c3: '3',
          price_c4: '4',
          price_c5: '5',
          source_id: null,
        },
      ],
      new Map(),
    );
    expect(pair?.distanceKm).toBeNull();
    expect(pair?.source).toBeUndefined();
  });

  it('refuse un prix illisible plutôt que de le deviner', () => {
    expect(() =>
      pricePairsFromRows(
        [
          {
            from_gate: 'A:X',
            to_gate: 'A:Y',
            concession: 'ASF',
            price_c1: 'abc',
            price_c2: '2',
            price_c3: '3',
            price_c4: '4',
            price_c5: '5',
          },
        ],
        new Map(),
      ),
    ).toThrow('price_c1');
  });

  it('les péages à tarif fixe retrouvent leurs saisons (jsonb en texte ou en objet)', () => {
    const season = {
      fromMonthDay: '06-15',
      toMonthDay: '09-15',
      prices: { 1: 13.8, 2: 20.7, 3: 37.6, 4: 47.7, 5: 6.8 },
    };
    const base = {
      gate: 'OUVRAGE:MILLAU',
      name: 'Millau',
      price_c1: '11.3',
      price_c2: '17',
      price_c3: '37.6',
      price_c4: '47.7',
      price_c5: '6.8',
      source: 's',
      effective_from: '2026-02-01',
    };
    const [asText] = openTollsFromRows([{ ...base, seasons: JSON.stringify([season]) }]);
    const [asObject] = openTollsFromRows([{ ...base, seasons: [season] }]);
    const [none] = openTollsFromRows([{ ...base, seasons: [] }]);
    expect(asText?.seasons).toEqual([season]);
    expect(asObject?.seasons).toEqual([season]);
    expect(none?.seasons).toBeUndefined();
    expect(asText?.prices[1]).toBe(11.3);
  });

  it('les gares sans nom sont ignorées', () => {
    const booths = boothsFromRows([
      { name: 'Péage A', operator: 'APRR', lat: 48.4, lon: 2.5 },
      { name: null, operator: null, lat: 1, lon: 1 },
      { name: '', operator: 'ASF', lat: 1, lon: 1 },
    ]);
    expect(booths).toEqual([{ name: 'Péage A', operator: 'APRR', lat: 48.4, lon: 2.5 }]);
  });

  it('reconstitue un véhicule avec ses consommations WLTP', () => {
    const [v] = vehiclesFromRows([
      {
        key: 'k',
        brand: 'RENAULT',
        model: 'KANGOO',
        label: 'KANGOO',
        description: 'KANGOO (130ch)',
        fuel: 'gasoline',
        hybrid: false,
        gearbox: 'AUTOMATIQUE',
        power_kw: '96.0',
        co2_mixed_g_per_km: null,
        price_eur: '31000.00',
        l100_low: '8.74',
        l100_medium: '6.79',
        l100_high: '6.19',
        l100_extra_high: '7.92',
        l100_mixed: '7.26',
      },
    ]);
    expect(v?.l100).toEqual({ low: 8.74, medium: 6.79, high: 6.19, extraHigh: 7.92, mixed: 7.26 });
    expect(v?.powerKw).toBe(96);
    expect(v?.co2MixedGPerKm).toBeNull();
    expect(v?.source).toBe('ademe-car-labelling');
  });

  it('reconstitue les statistiques de prix', () => {
    const [s] = fuelStatsFromRows([
      {
        scope: 'FR',
        product: 'gazole',
        avg_eur_per_l: '2.204',
        median_eur_per_l: null,
        stations: 8955,
      },
    ]);
    expect(s).toEqual({
      scope: 'FR',
      product: 'gazole',
      avgEurPerL: 2.204,
      medianEurPerL: null,
      stations: 8955,
    });
  });
});
