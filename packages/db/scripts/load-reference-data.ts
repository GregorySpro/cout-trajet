/**
 * Charge dans la base (DATABASE_URL) les données de référence produites localement :
 *  - tarifs de péage : data-sources/generated/toll-book.json (pnpm --filter @cout-trajet/tolls run build-data) ;
 *  - gares OpenStreetMap : data-sources/cache/osm_france_toll_booths.json (tools/export-osm-toll-booths.py) ;
 *  - véhicules : data-sources/generated/vehicles.json (pnpm --filter @cout-trajet/reference-data run fetch-ademe) ;
 *  - prix des carburants : data-sources/generated/fuel-prices.json (… run fetch-fuel), facultatif ;
 *  - péages à tarif fixe : code de @cout-trajet/tolls.
 *
 * Usage : pnpm --filter @cout-trajet/db run load
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FuelPriceSnapshot, VehicleModel } from '@cout-trajet/reference-data';
import { OPEN_TOLLS, type PricePair } from '@cout-trajet/tolls';
import { connect } from '../src/connect';
import { loadReferenceData, type ReferenceData } from '../src/load';
import type { OsmBoothRow } from '../src/rows';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const envFile = join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const path = (...p: string[]): string => join(root, 'data-sources', ...p);
const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf-8')) as T;
for (const f of [
  path('generated', 'toll-book.json'),
  path('cache', 'osm_france_toll_booths.json'),
  path('generated', 'vehicles.json'),
]) {
  if (!existsSync(f)) {
    console.error(`Fichier absent : ${f} (voir l'en-tête du script).`);
    process.exit(1);
  }
}

const book = read<{ generatedAt: string; pairs: PricePair[] }>(path('generated', 'toll-book.json'));
const osm = read<{
  elements: { id: number; lat: number; lon: number; tags?: { name?: string; operator?: string } }[];
}>(path('cache', 'osm_france_toll_booths.json'));
const vehicles = read<{ fetchedAt: string; vehicles: VehicleModel[] }>(
  path('generated', 'vehicles.json'),
);

// Seules les gares nommées sont utilisables pour le rapprochement avec les grilles.
const booths: OsmBoothRow[] = osm.elements
  .filter((n) => typeof n.tags?.name === 'string' && n.tags.name !== '')
  .map((n) => ({
    osmId: n.id,
    name: n.tags?.name as string,
    ...(n.tags?.operator !== undefined ? { operator: n.tags.operator } : {}),
    lat: n.lat,
    lon: n.lon,
  }));

const data: ReferenceData = {
  pairs: book.pairs,
  openTolls: [...OPEN_TOLLS],
  booths,
  vehicles: vehicles.vehicles,
  meta: { toll_book_generated_at: book.generatedAt, vehicles_fetched_at: vehicles.fetchedAt },
};
const fuelFile = path('generated', 'fuel-prices.json');
if (existsSync(fuelFile)) {
  const f = read<FuelPriceSnapshot & { fetchedAt: string }>(fuelFile);
  data.fuel = {
    snapshot: { national: f.national, departments: f.departments },
    fetchedAt: f.fetchedAt,
  };
}

let client;
try {
  client = await connect();
} catch (error) {
  console.error(`Connexion impossible : ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
try {
  const report = await loadReferenceData(client, data);
  console.log('Données chargées :');
  for (const [k, v] of Object.entries(report)) console.log(`  ${k.padEnd(12)} ${v}`);
} catch (error) {
  console.error(
    `Chargement échoué (transaction annulée) : ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
