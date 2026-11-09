import type { FuelPriceSnapshot, VehicleModel } from '@cout-trajet/reference-data';
import type { OpenToll, OsmBooth, PricePair, PriceSource } from '@cout-trajet/tolls';

/** Données en colonnes (un tableau par colonne), prêtes pour `unnest`. */
export type Columns = Record<string, unknown[]>;

/** Découpe un tableau en lots de taille fixe. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!(size > 0)) throw new RangeError('La taille de lot doit être positive.');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function column<T, V>(items: readonly T[], pick: (item: T) => V): V[] {
  return items.map(pick);
}

/** Sources distinctes des tarifs (une ligne par identifiant). */
export function sourcesFromPairs(pairs: readonly PricePair[]): PriceSource[] {
  const byId = new Map<string, PriceSource>();
  for (const p of pairs) {
    if (p.source && !byId.has(p.source.id)) byId.set(p.source.id, p.source);
  }
  return [...byId.values()];
}

export function sourceColumns(sources: readonly PriceSource[]): Columns {
  return {
    id: column(sources, (s) => s.id),
    label: column(sources, (s) => s.label),
    effective_from: column(sources, (s) => s.effectiveFrom),
    reliability: column(sources, (s) => s.reliability),
  };
}

export function pairColumns(pairs: readonly PricePair[]): Columns {
  return {
    from_gate: column(pairs, (p) => p.from),
    to_gate: column(pairs, (p) => p.to),
    concession: column(pairs, (p) => p.concession),
    distance_km: column(pairs, (p) => p.distanceKm),
    price_c1: column(pairs, (p) => p.prices[1]),
    price_c2: column(pairs, (p) => p.prices[2]),
    price_c3: column(pairs, (p) => p.prices[3]),
    price_c4: column(pairs, (p) => p.prices[4]),
    price_c5: column(pairs, (p) => p.prices[5]),
    source_id: column(pairs, (p) => p.source?.id ?? null),
  };
}

export function openTollColumns(tolls: readonly OpenToll[]): Columns {
  return {
    gate: column(tolls, (t) => t.gate),
    name: column(tolls, (t) => t.name),
    price_c1: column(tolls, (t) => t.prices[1]),
    price_c2: column(tolls, (t) => t.prices[2]),
    price_c3: column(tolls, (t) => t.prices[3]),
    price_c4: column(tolls, (t) => t.prices[4]),
    price_c5: column(tolls, (t) => t.prices[5]),
    seasons: column(tolls, (t) => JSON.stringify(t.seasons ?? [])),
    source: column(tolls, (t) => t.source),
    effective_from: column(tolls, (t) => t.effectiveFrom),
  };
}

/** Gare OpenStreetMap avec son identifiant (l'export Overpass le fournit). */
export interface OsmBoothRow extends OsmBooth {
  osmId: number;
}

export function boothColumns(booths: readonly OsmBoothRow[]): Columns {
  return {
    osm_id: column(booths, (b) => b.osmId),
    name: column(booths, (b) => b.name),
    operator: column(booths, (b) => b.operator ?? null),
    lat: column(booths, (b) => b.lat),
    lon: column(booths, (b) => b.lon),
  };
}

export function vehicleColumns(vehicles: readonly VehicleModel[]): Columns {
  return {
    key: column(vehicles, (v) => v.key),
    brand: column(vehicles, (v) => v.brand),
    model: column(vehicles, (v) => v.model),
    label: column(vehicles, (v) => v.label),
    description: column(vehicles, (v) => v.description),
    fuel: column(vehicles, (v) => v.fuel),
    hybrid: column(vehicles, (v) => v.hybrid),
    gearbox: column(vehicles, (v) => v.gearbox),
    power_kw: column(vehicles, (v) => v.powerKw),
    co2_mixed_g_per_km: column(vehicles, (v) => v.co2MixedGPerKm),
    price_eur: column(vehicles, (v) => v.priceEur),
    l100_low: column(vehicles, (v) => v.l100.low),
    l100_medium: column(vehicles, (v) => v.l100.medium),
    l100_high: column(vehicles, (v) => v.l100.high),
    l100_extra_high: column(vehicles, (v) => v.l100.extraHigh),
    l100_mixed: column(vehicles, (v) => v.l100.mixed),
  };
}

/** Jour du relevé (UTC) au format AAAA-MM-JJ. */
export function dayOf(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Date illisible : ${isoTimestamp}`);
  return d.toISOString().slice(0, 10);
}

export function fuelColumns(snapshot: FuelPriceSnapshot, day: string): Columns {
  const stats = [...snapshot.national, ...snapshot.departments];
  return {
    day: column(stats, () => day),
    scope: column(stats, (s) => s.scope),
    product: column(stats, (s) => s.product),
    avg_eur_per_l: column(stats, (s) => Math.round(s.avgEurPerL * 1000) / 1000),
    median_eur_per_l: column(stats, (s) =>
      s.medianEurPerL === null ? null : Math.round(s.medianEurPerL * 1000) / 1000,
    ),
    stations: column(stats, (s) => s.stations),
  };
}
