import type { FuelPriceSnapshot, VehicleModel } from '@cout-trajet/reference-data';
import type { OpenToll, PricePair } from '@cout-trajet/tolls';
import type { Queryable } from './migrate';
import {
  boothColumns,
  chunk,
  dayOf,
  fuelColumns,
  openTollColumns,
  pairColumns,
  sourceColumns,
  sourcesFromPairs,
  vehicleColumns,
  type Columns,
  type OsmBoothRow,
} from './rows';

export interface ReferenceData {
  pairs: PricePair[];
  openTolls: OpenToll[];
  booths: OsmBoothRow[];
  vehicles: VehicleModel[];
  fuel?: { snapshot: FuelPriceSnapshot; fetchedAt: string };
  /** Dates d'import et autres informations de diagnostic, enregistrées dans `reference_data_meta`. */
  meta?: Record<string, unknown>;
}

export interface LoadReport {
  tollSources: number;
  tollPairs: number;
  tollOpen: number;
  boothCount: number;
  vehicles: number;
  fuelPrices: number;
}

/** Type SQL d'une colonne ; `jsonb` est transmis en texte puis converti. */
type SqlType =
  'text' | 'date' | 'numeric' | 'bigint' | 'integer' | 'boolean' | 'double precision' | 'jsonb';

interface TableSpec {
  table: string;
  types: Record<string, SqlType>;
  /** Colonnes de la clé primaire, pour un chargement par « upsert » ; absent = insertion simple. */
  key?: string[];
}

const SOURCES: TableSpec = {
  table: 'toll_sources',
  types: { id: 'text', label: 'text', effective_from: 'date', reliability: 'text' },
};
const PAIRS: TableSpec = {
  table: 'toll_pairs',
  types: {
    from_gate: 'text',
    to_gate: 'text',
    concession: 'text',
    distance_km: 'numeric',
    price_c1: 'numeric',
    price_c2: 'numeric',
    price_c3: 'numeric',
    price_c4: 'numeric',
    price_c5: 'numeric',
    source_id: 'text',
  },
};
const OPEN: TableSpec = {
  table: 'toll_open',
  types: {
    gate: 'text',
    name: 'text',
    price_c1: 'numeric',
    price_c2: 'numeric',
    price_c3: 'numeric',
    price_c4: 'numeric',
    price_c5: 'numeric',
    seasons: 'jsonb',
    source: 'text',
    effective_from: 'date',
  },
};
const BOOTHS: TableSpec = {
  table: 'osm_toll_booths',
  types: {
    osm_id: 'bigint',
    name: 'text',
    operator: 'text',
    lat: 'double precision',
    lon: 'double precision',
  },
};
const VEHICLES: TableSpec = {
  table: 'vehicle_models',
  key: ['key'],
  types: {
    key: 'text',
    brand: 'text',
    model: 'text',
    label: 'text',
    description: 'text',
    fuel: 'text',
    hybrid: 'boolean',
    gearbox: 'text',
    power_kw: 'numeric',
    co2_mixed_g_per_km: 'numeric',
    price_eur: 'numeric',
    l100_low: 'numeric',
    l100_medium: 'numeric',
    l100_high: 'numeric',
    l100_extra_high: 'numeric',
    l100_mixed: 'numeric',
  },
};
const FUEL: TableSpec = {
  table: 'fuel_prices',
  key: ['day', 'scope', 'product'],
  types: {
    day: 'date',
    scope: 'text',
    product: 'text',
    avg_eur_per_l: 'numeric',
    median_eur_per_l: 'numeric',
    stations: 'integer',
  },
};

/**
 * Construit la requête d'insertion en lots : un paramètre tableau par colonne, développés par `unnest`
 * (bien plus rapide qu'une requête par ligne). Les noms de table et de colonnes viennent des
 * constantes ci-dessus, jamais de données externes.
 */
export function buildInsert(spec: TableSpec): string {
  const names = Object.keys(spec.types);
  const args = names.map((n, i) => {
    const type = spec.types[n] as SqlType;
    return `$${i + 1}::${type === 'jsonb' ? 'text' : type}[]`;
  });
  const select = names.map((n) => (spec.types[n] === 'jsonb' ? `${n}::jsonb` : n)).join(', ');
  let sql =
    `insert into public.${spec.table} (${names.join(', ')}) ` +
    `select ${select} from unnest(${args.join(', ')}) as t(${names.join(', ')})`;
  if (spec.key) {
    const updates = names.filter((n) => !(spec.key as string[]).includes(n));
    sql +=
      ` on conflict (${spec.key.join(', ')}) do update set ` +
      updates.map((n) => `${n} = excluded.${n}`).join(', ');
  }
  return sql;
}

async function insertAll(
  client: Queryable,
  spec: TableSpec,
  columns: Columns,
  batchSize: number,
): Promise<number> {
  const names = Object.keys(spec.types);
  const total = (columns[names[0] as string] ?? []).length;
  const sql = buildInsert(spec);
  for (const range of chunk(
    Array.from({ length: total }, (_, i) => i),
    batchSize,
  )) {
    const first = range[0] as number;
    const last = (range[range.length - 1] as number) + 1;
    await client.query(
      sql,
      names.map((n) => (columns[n] as unknown[]).slice(first, last)),
    );
  }
  return total;
}

/**
 * Charge les données de référence dans la base, en une seule transaction :
 *  - tarifs, ouvrages et gares : remplacement complet ;
 *  - véhicules et prix des carburants : ajout ou mise à jour (les trajets et garages des utilisateurs
 *    référencent les véhicules, on ne les supprime donc jamais).
 */
export async function loadReferenceData(
  client: Queryable,
  data: ReferenceData,
  batchSize = 5000,
): Promise<LoadReport> {
  await client.query('begin');
  try {
    await client.query(
      'truncate table public.toll_pairs, public.toll_sources, public.toll_open, public.osm_toll_booths',
    );
    const sources = sourcesFromPairs(data.pairs);
    const report: LoadReport = {
      tollSources: await insertAll(client, SOURCES, sourceColumns(sources), batchSize),
      tollPairs: await insertAll(client, PAIRS, pairColumns(data.pairs), batchSize),
      tollOpen: await insertAll(client, OPEN, openTollColumns(data.openTolls), batchSize),
      boothCount: await insertAll(client, BOOTHS, boothColumns(data.booths), batchSize),
      vehicles: await insertAll(client, VEHICLES, vehicleColumns(data.vehicles), batchSize),
      fuelPrices: 0,
    };
    if (data.fuel) {
      report.fuelPrices = await insertAll(
        client,
        FUEL,
        fuelColumns(data.fuel.snapshot, dayOf(data.fuel.fetchedAt)),
        batchSize,
      );
    }
    for (const [key, value] of Object.entries({
      ...data.meta,
      loaded_at: new Date().toISOString(),
    })) {
      await client.query(
        `insert into public.reference_data_meta (key, value) values ($1, $2::jsonb)
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [key, JSON.stringify(value)],
      );
    }
    await client.query('commit');
    return report;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
