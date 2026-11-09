import { readFileSync } from 'node:fs';
import type { FuelPriceSnapshot, VehicleModel } from '@cout-trajet/reference-data';
import { TollBook, type OsmBooth, type PricePair } from '@cout-trajet/tolls';

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
  fuelSnapshot?: { snapshot: FuelPriceSnapshot; fetchedAt: string };
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
