/**
 * Contrôle de bout en bout du calcul des péages sur les trajets de référence :
 *   itinéraire (OpenRouteService, en cache) → gares OSM à ≤ 10 m → gares de grille → prix officiel.
 *
 * Prérequis : `pnpm --filter @cout-trajet/tolls run build-data` (livre de tarifs) et les réponses
 * mises en cache dans data-sources/cache/ par spikes/e2e_tolls.py. Les gares OSM manquantes sont
 * demandées à Overpass (service public, parfois indisponible : le trajet est alors ignoré).
 *
 * Usage : pnpm --filter @cout-trajet/tolls run check-trips
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GATE_MAPPINGS,
  OPEN_TOLLS,
  TollBook,
  computeTripTolls,
  detectGatesOnRoute,
  resolveRouteGates,
  type LonLat,
  type OsmBooth,
  type PricePair,
} from '../src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const cacheDir = join(root, 'data-sources', 'cache');

interface Trip {
  id: string;
  name: string;
  expectedEur: number;
  date: Date;
}

// Date hors été pour Millau (11,30 €) ; T07 (Paris → Nice) n'est pas testé ici (chaînage Escota à venir).
const TRIPS: Trip[] = [
  { id: 'T01', name: 'Paris → Lyon', expectedEur: 41.3, date: new Date('2026-11-09') },
  { id: 'T02', name: 'Paris → Lille', expectedEur: 18.9, date: new Date('2026-11-09') },
  { id: 'T03', name: 'Lyon → Marseille', expectedEur: 28.1, date: new Date('2026-11-09') },
  { id: 'T04', name: 'Bordeaux → Toulouse', expectedEur: 22.9, date: new Date('2026-11-09') },
  {
    id: 'T09',
    name: 'Clermont-Ferrand → Béziers',
    expectedEur: 11.3,
    date: new Date('2026-11-09'),
  },
  { id: 'T10', name: 'Caen → Le Havre', expectedEur: 6.1, date: new Date('2026-11-09') },
];

interface OsmNode {
  lat: number;
  lon: number;
  tags?: { name?: string; operator?: string };
}

async function loadBooths(id: string, route: readonly LonLat[]): Promise<OsmBooth[] | null> {
  const file = join(cacheDir, `osm_${id}.json`);
  let nodes: OsmNode[] | null = null;
  if (existsSync(file)) {
    nodes = (JSON.parse(readFileSync(file, 'utf-8')) as { elements: OsmNode[] }).elements;
  } else {
    const lons = route.map((p) => p[0]);
    const lats = route.map((p) => p[1]);
    const bb = [
      Math.min(...lats) - 0.02,
      Math.min(...lons) - 0.02,
      Math.max(...lats) + 0.02,
      Math.max(...lons) + 0.02,
    ].join(',');
    const query = `[out:json][timeout:60];node["barrier"="toll_booth"](${bb});out body;`;
    for (const endpoint of [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ]) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          body: new URLSearchParams({ data: query }),
          headers: { 'User-Agent': 'cout-trajet-spike/0.1 (projet perso, test ponctuel)' },
          signal: AbortSignal.timeout(90_000),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as { elements: OsmNode[] };
        nodes = json.elements;
        writeFileSync(file, JSON.stringify(json));
        break;
      } catch {
        /* essai suivant */
      }
    }
  }
  if (!nodes) return null;
  return nodes
    .filter((n) => n.tags?.name !== undefined)
    .map((n) => ({
      name: n.tags?.name as string,
      ...(n.tags?.operator !== undefined ? { operator: n.tags.operator } : {}),
      lat: n.lat,
      lon: n.lon,
    }));
}

const bookFile = join(root, 'data-sources', 'generated', 'toll-book.json');
if (!existsSync(bookFile)) {
  console.error(
    'Livre de tarifs absent : lancer d’abord « pnpm --filter @cout-trajet/tolls run build-data ».',
  );
  process.exit(2);
}
const book = new TollBook(
  (JSON.parse(readFileSync(bookFile, 'utf-8')) as { pairs: PricePair[] }).pairs,
);

let failed = 0;
let skipped = 0;
for (const trip of TRIPS) {
  console.log(`\n=== ${trip.id} ${trip.name} (référence ${trip.expectedEur.toFixed(2)} €) ===`);
  const routeFile = join(cacheDir, `ors_${trip.id}.json`);
  if (!existsSync(routeFile)) {
    console.log('  itinéraire ORS absent du cache : ignoré');
    skipped++;
    continue;
  }
  const route = (
    JSON.parse(readFileSync(routeFile, 'utf-8')) as {
      features: { geometry: { coordinates: LonLat[] } }[];
    }
  ).features[0]?.geometry.coordinates;
  if (!route) {
    console.log('  géométrie illisible : ignoré');
    skipped++;
    continue;
  }
  const booths = await loadBooths(trip.id, route);
  if (!booths) {
    console.log('  gares OSM indisponibles (Overpass) : ignoré');
    skipped++;
    continue;
  }
  const detected = detectGatesOnRoute(route, booths, 10);
  console.log(
    `  gares détectées (≤ 10 m) : ${detected.map((g) => g.name).join(' → ') || 'aucune'}`,
  );
  const {
    gates,
    warnings: resolveWarnings,
    uncertain,
    alternatives,
  } = resolveRouteGates(detected, GATE_MAPPINGS, { knownGates: book.gates() });
  console.log(`  gares de grille          : ${gates.join(' → ') || 'aucune'}`);
  const { charges, warnings } = computeTripTolls(gates, {
    book,
    openTolls: OPEN_TOLLS,
    vehicleClass: 1,
    date: trip.date,
    uncertainGates: new Set(uncertain),
    alternatives: new Map(Object.entries(alternatives)),
  });
  const total = Math.round(charges.reduce((s, c) => s + c.amountEur, 0) * 100) / 100;
  for (const w of [...resolveWarnings, ...warnings]) console.log(`  ⚠ ${w}`);
  const errorPct = (Math.abs(total - trip.expectedEur) / trip.expectedEur) * 100;
  const ok = errorPct <= 10;
  if (!ok) failed++;
  console.log(
    `  péage calculé : ${total.toFixed(2)} €  | écart : ${errorPct.toFixed(1)} %  ${ok ? 'OK' : 'ÉCHEC'}`,
  );
}
console.log(
  `\nBilan : ${TRIPS.length - skipped - failed} OK, ${failed} échec(s), ${skipped} ignoré(s).`,
);
process.exitCode = failed === 0 ? 0 : 1;
