import type { FuelPriceSnapshot, FuelPriceStat, VehicleModel } from '@cout-trajet/reference-data';
import type { ClassPrices, OpenToll, OsmBooth, PricePair, PriceSource } from '@cout-trajet/tolls';
import type { Queryable } from './migrate';

type Row = Record<string, unknown>;

/** `numeric` arrive de Postgres sous forme de texte : on le convertit, `null` reste `null`. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function reqNum(value: unknown, what: string): number {
  const n = num(value);
  if (n === null) throw new Error(`Valeur numérique attendue pour ${what}`);
  return n;
}

function text(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value === null || value === undefined
      ? ''
      : String(value);
}

/** Date SQL (objet Date ou texte) → AAAA-MM-JJ. */
function dateText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function prices(row: Row): ClassPrices {
  return {
    1: reqNum(row['price_c1'], 'price_c1'),
    2: reqNum(row['price_c2'], 'price_c2'),
    3: reqNum(row['price_c3'], 'price_c3'),
    4: reqNum(row['price_c4'], 'price_c4'),
    5: reqNum(row['price_c5'], 'price_c5'),
  };
}

export function sourcesFromRows(rows: readonly Row[]): Map<string, PriceSource> {
  return new Map(
    rows.map((r) => [
      text(r['id']),
      {
        id: text(r['id']),
        label: text(r['label']),
        effectiveFrom: dateText(r['effective_from']),
        reliability: text(r['reliability']) as PriceSource['reliability'],
      },
    ]),
  );
}

export function pricePairsFromRows(
  rows: readonly Row[],
  sources: ReadonlyMap<string, PriceSource>,
): PricePair[] {
  return rows.map((r) => {
    const source = sources.get(text(r['source_id']));
    return {
      concession: text(r['concession']) as PricePair['concession'],
      from: text(r['from_gate']),
      to: text(r['to_gate']),
      distanceKm: num(r['distance_km']),
      prices: prices(r),
      ...(source ? { source } : {}),
    };
  });
}

export function openTollsFromRows(rows: readonly Row[]): OpenToll[] {
  return rows.map((r) => {
    const seasons = typeof r['seasons'] === 'string' ? JSON.parse(r['seasons']) : r['seasons'];
    return {
      gate: text(r['gate']),
      name: text(r['name']),
      prices: prices(r),
      ...(Array.isArray(seasons) && seasons.length > 0 ? { seasons } : {}),
      source: text(r['source']),
      effectiveFrom: dateText(r['effective_from']) ?? '',
    };
  });
}

export function boothsFromRows(rows: readonly Row[]): OsmBooth[] {
  return rows
    .filter((r) => typeof r['name'] === 'string' && r['name'] !== '')
    .map((r) => ({
      name: text(r['name']),
      ...(typeof r['operator'] === 'string' && r['operator'] !== ''
        ? { operator: r['operator'] }
        : {}),
      lat: reqNum(r['lat'], 'lat'),
      lon: reqNum(r['lon'], 'lon'),
    }));
}

export function vehiclesFromRows(rows: readonly Row[]): VehicleModel[] {
  return rows.map((r) => ({
    key: text(r['key']),
    brand: text(r['brand']),
    model: text(r['model']),
    label: text(r['label']),
    description: text(r['description']),
    fuel: text(r['fuel']) as VehicleModel['fuel'],
    hybrid: r['hybrid'] === true,
    gearbox: typeof r['gearbox'] === 'string' ? r['gearbox'] : null,
    powerKw: num(r['power_kw']),
    co2MixedGPerKm: num(r['co2_mixed_g_per_km']),
    priceEur: num(r['price_eur']),
    l100: {
      low: reqNum(r['l100_low'], 'l100_low'),
      medium: num(r['l100_medium']),
      high: reqNum(r['l100_high'], 'l100_high'),
      extraHigh: reqNum(r['l100_extra_high'], 'l100_extra_high'),
      mixed: num(r['l100_mixed']),
    },
    source: r['source'] === 'eea-co2-monitoring' ? 'eea-co2-monitoring' : 'ademe-car-labelling',
  }));
}

export function fuelStatsFromRows(rows: readonly Row[]): FuelPriceStat[] {
  return rows.map((r) => ({
    scope: text(r['scope']),
    product: text(r['product']) as FuelPriceStat['product'],
    avgEurPerL: reqNum(r['avg_eur_per_l'], 'avg_eur_per_l'),
    medianEurPerL: num(r['median_eur_per_l']),
    stations: reqNum(r['stations'], 'stations'),
  }));
}

export interface DatabaseData {
  pairs: PricePair[];
  openTolls: OpenToll[];
  booths: OsmBooth[];
  vehicles: VehicleModel[];
  /** Dernier relevé de prix ; absent si la table est vide. */
  fuel?: { snapshot: FuelPriceSnapshot; day: string };
}

/** Lit toutes les données de référence nécessaires à l'API (rôle service requis pour les péages). */
export async function readReferenceData(client: Queryable): Promise<DatabaseData> {
  const sources = sourcesFromRows((await client.query('select * from public.toll_sources')).rows);
  const pairs = pricePairsFromRows(
    (await client.query('select * from public.toll_pairs')).rows,
    sources,
  );
  const openTolls = openTollsFromRows((await client.query('select * from public.toll_open')).rows);
  const booths = boothsFromRows((await client.query('select * from public.osm_toll_booths')).rows);
  const vehicles = vehiclesFromRows(
    (await client.query('select * from public.vehicle_models')).rows,
  );

  const fuelRows = (
    await client.query(
      'select * from public.fuel_prices where day = (select max(day) from public.fuel_prices)',
    )
  ).rows;
  const stats = fuelStatsFromRows(fuelRows);
  const day = fuelRows.length > 0 ? dateText(fuelRows[0]?.['day']) : null;
  return {
    pairs,
    openTolls,
    booths,
    vehicles,
    ...(day
      ? {
          fuel: {
            snapshot: {
              national: stats.filter((s) => s.scope === 'FR'),
              departments: stats.filter((s) => s.scope !== 'FR'),
            },
            day,
          },
        }
      : {}),
  };
}
