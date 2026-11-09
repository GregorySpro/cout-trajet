/**
 * Importe les véhicules du jeu ADEME « Car Labelling » (API data-fair, sans clé), ne garde que les
 * véhicules éligibles au MVP et les enregistre dans data-sources/generated/vehicles.json.
 *
 * Usage : pnpm --filter @cout-trajet/reference-data run fetch-ademe
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAdemeLines, importAdemeLines } from '../src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const lines = await fetchAdemeLines((url) => fetch(url, { signal: AbortSignal.timeout(120_000) }));
const result = importAdemeLines(lines);

const outDir = join(root, 'data-sources', 'generated');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, 'vehicles.json');
writeFileSync(file, JSON.stringify({ fetchedAt: new Date().toISOString(), ...result }));

const count = (key: (v: (typeof result.vehicles)[number]) => string): Map<string, number> => {
  const m = new Map<string, number>();
  for (const v of result.vehicles) m.set(key(v), (m.get(key(v)) ?? 0) + 1);
  return m;
};
console.log(`Lignes reçues : ${lines.length}`);
console.log(
  `Véhicules retenus : ${result.vehicles.length} ; écartés : ${result.skipped} ; doublons : ${result.duplicates}`,
);
console.log('Par carburant :', Object.fromEntries(count((v) => v.fuel)));
console.log('Hybrides non rechargeables :', result.vehicles.filter((v) => v.hybrid).length);
console.log('Marques distinctes :', new Set(result.vehicles.map((v) => v.brand)).size);
const mixed = result.vehicles.map((v) => v.l100.mixed).filter((x): x is number => x !== null);
mixed.sort((a, b) => a - b);
console.log(
  `Consommation mixte (L/100) : min ${mixed[0]?.toFixed(1)} ; médiane ${mixed[Math.floor(mixed.length / 2)]?.toFixed(1)} ; max ${mixed[mixed.length - 1]?.toFixed(1)}`,
);
const bad = result.vehicles.filter(
  (v) => v.l100.extraHigh < v.l100.low * 0.4 || v.l100.extraHigh > v.l100.low * 2,
);
console.log(`Lignes à ratio autoroute/ville atypique (à vérifier) : ${bad.length}`);
console.log(`Fichier : ${file}`);
