import { readFileSync } from 'node:fs';
import { readReferenceData, type Queryable } from '@cout-trajet/db';
import type { FuelPriceSnapshot, VehicleModel } from '@cout-trajet/reference-data';
import { TollBook, type OpenToll, type OsmBooth, type PricePair } from '@cout-trajet/tolls';

interface OsmNode {
  lat: number;
  lon: number;
  tags?: { name?: string; operator?: string };
}

/** Extrait les gares de péage nommées d'un export Overpass (`elements`). */
export function parseBooths(json: unknown): OsmBooth[] {
  const elements = (json as { elements?: OsmNode[] })?.elements ?? [];
  return elements
    .filter((n) => typeof n.tags?.name === 'string' && n.tags.name !== '')
    .map((n) => ({
      name: n.tags?.name as string,
      ...(n.tags?.operator !== undefined ? { operator: n.tags.operator } : {}),
      lat: n.lat,
      lon: n.lon,
    }));
}

/** Indexe les véhicules par clé. */
export function indexVehicles(json: unknown): Map<string, VehicleModel> {
  const vehicles = (json as { vehicles?: VehicleModel[] })?.vehicles ?? [];
  return new Map(vehicles.map((v) => [v.key, v]));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export interface LoadedData {
  book: TollBook;
  booths: OsmBooth[];
  vehicles: Map<string, VehicleModel>;
  /** Péages à tarif fixe (depuis la base) ; absent = ceux du code. */
  openTolls?: OpenToll[];
  fuelSnapshot?: { snapshot: FuelPriceSnapshot; fetchedAt: string };
}

/**
 * Charge les données de référence depuis la base (Supabase / Postgres).
 * Le livre de tarifs est reconstitué avec ses sources : la règle « la plus récente, puis la plus
 * fiable » s'applique de la même façon que pour un chargement depuis les fichiers.
 */
export async function loadDataFromDatabase(client: Queryable): Promise<LoadedData> {
  const db = await readReferenceData(client);
  const fuelSnapshot = db.fuel
    ? { snapshot: db.fuel.snapshot, fetchedAt: `${db.fuel.day}T00:00:00.000Z` }
    : undefined;
  return {
    book: new TollBook(db.pairs),
    booths: db.booths,
    vehicles: new Map(db.vehicles.map((v) => [v.key, v])),
    ...(db.openTolls.length > 0 ? { openTolls: db.openTolls } : {}),
    ...(fuelSnapshot ? { fuelSnapshot } : {}),
  };
}

export interface DataPaths {
  tollBook: string;
  booths: string;
  vehicles: string;
  fuelPrices: string;
}

/** Charge les données de référence depuis des fichiers locaux (non versionnés). */
export function loadData(paths: DataPaths): LoadedData {
  const book = new TollBook((readJson(paths.tollBook) as { pairs: PricePair[] }).pairs);
  const booths = parseBooths(readJson(paths.booths));
  const vehicles = indexVehicles(readJson(paths.vehicles));
  let fuelSnapshot: LoadedData['fuelSnapshot'];
  try {
    const f = readJson(paths.fuelPrices) as FuelPriceSnapshot & { fetchedAt: string };
    fuelSnapshot = {
      snapshot: { national: f.national, departments: f.departments },
      fetchedAt: f.fetchedAt,
    };
  } catch {
    fuelSnapshot = undefined; // pas de relevé local : récupération en direct
  }
  return { book, booths, vehicles, ...(fuelSnapshot ? { fuelSnapshot } : {}) };
}
