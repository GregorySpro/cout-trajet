/**
 * Validation de P2 sur des trajets INCONNUS (jamais utilisés pour écrire la table de correspondance).
 *
 * Pour chaque trajet : itinéraire OpenRouteService (cache ou appel avec la clé de .env), gares OSM
 * à ≤ 10 m, traduction en gares de grille, prix. On mesure surtout la couverture :
 * combien de gares détectées n'ont pas de correspondance, et le prix obtenu s'il y en a un.
 * Les références viennent du PDF « principales liaisons » de Vinci (classe 1, 2026), lecture indépendante.
 *
 * Usage : pnpm --filter @cout-trajet/tolls run check-unseen
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
  from: LonLat;
  to: LonLat;
  expectedEur: number;
  referenceNote: string;
}

const PARIS: LonLat = [2.3522, 48.8566];
const TRIPS: Trip[] = [
  {
    id: 'U1',
    name: 'Paris → Orléans',
    from: PARIS,
    to: [1.909, 47.9029],
    expectedEur: 12.0,
    referenceNote: 'Vinci : Paris (La Folie-Bessin) / Orléans-nord',
  },
  {
    id: 'U2',
    name: 'Paris → Tours',
    from: PARIS,
    to: [0.6848, 47.3941],
    expectedEur: 26.0,
    referenceNote: 'Vinci : Paris (La Folie-Bessin) / Tours-centre',
  },
  {
    id: 'U3',
    name: 'Paris → Nantes',
    from: PARIS,
    to: [-1.5534, 47.2184],
    expectedEur: 43.3,
    referenceNote: 'Vinci : Paris (La Folie-Bessin) / Nantes (A11)',
  },
  {
    id: 'U4',
    name: 'Lyon → Montpellier',
    from: [4.8357, 45.764],
    to: [3.8767, 43.6108],
    expectedEur: 32.8,
    referenceNote: 'Vinci : Lyon / Montpellier (A7/A9)',
  },
  {
    id: 'U5',
    name: 'Montpellier → Toulouse',
    from: [3.8767, 43.6108],
    to: [1.4442, 43.6047],
    expectedEur: 27.6,
    referenceNote: 'Vinci : Montpellier / Toulouse sud-ouest (A9/A61)',
  },
];

interface OsmNode {
  lat: number;
  lon: number;
  tags?: { name?: string; operator?: string };
}

function orsKey(): string {
  const env = readFileSync(join(root, '.env'), 'utf-8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('ORS_API_KEY='));
  const key = line?.slice('ORS_API_KEY='.length).trim();
  if (!key) throw new Error('ORS_API_KEY absente de .env');
  return key;
}

async function loadRoute(trip: Trip): Promise<readonly LonLat[] | null> {
  const file = join(cacheDir, `ors_${trip.id}.json`);
  if (!existsSync(file)) {
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: {
        Authorization: orsKey(),
        'Content-Type': 'application/json',
        Accept: 'application/json, application/geo+json',
      },
      body: JSON.stringify({ coordinates: [trip.from, trip.to], instructions: false }),
      signal: AbortSignal.timeout(90_000),
    });
    const remaining = res.headers.get('x-ratelimit-remaining');
    console.log(`  ORS : HTTP ${res.status}, requêtes restantes : ${remaining ?? '?'}`);
    if (!res.ok) return null;
    writeFileSync(file, JSON.stringify(await res.json()));
  }
  const json = JSON.parse(readFileSync(file, 'utf-8')) as {
    features: { geometry: { coordinates: LonLat[] } }[];
  };
  return json.features[0]?.geometry.coordinates ?? null;
}

async function loadBooths(id: string, route: readonly LonLat[]): Promise<OsmBooth[] | null> {
  const file = join(cacheDir, `osm_${id}.json`);
  let nodes: OsmNode[] | null = null;
  const national = join(cacheDir, 'osm_france_toll_booths.json');
  if (existsSync(national)) {
    // Export national (tools/export-osm-toll-booths.py) : plus d'appel réseau par trajet.
    nodes = (JSON.parse(readFileSync(national, 'utf-8')) as { elements: OsmNode[] }).elements;
  } else if (existsSync(file)) {
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
      'https://overpass.private.coffee/api/interpreter',
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
const book = new TollBook(
  (JSON.parse(readFileSync(bookFile, 'utf-8')) as { pairs: PricePair[] }).pairs,
);

const knownGates = book.gates();
let detectedTotal = 0;
let unmappedTotal = 0;
let autoTotal = 0;
let priced = 0;
let within10 = 0;
let skipped = 0;
for (const trip of TRIPS) {
  console.log(`\n=== ${trip.id} ${trip.name} (référence ${trip.expectedEur.toFixed(2)} €) ===`);
  console.log(`  référence : ${trip.referenceNote}`);
  const route = await loadRoute(trip);
  if (!route) {
    console.log('  itinéraire indisponible : ignoré');
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
  console.log(`  gares franchies (${detected.length}) :`);
  for (const g of detected) {
    console.log(
      `    km ${(g.alongM / 1000).toFixed(0).padStart(3)}  ${g.name}  [${g.operator ?? '?'}]`,
    );
  }
  const {
    gates,
    warnings: rw,
    autoMatched,
    uncertain,
    alternatives,
  } = resolveRouteGates(detected, GATE_MAPPINGS, { knownGates });
  const unmapped = rw.filter((w) => w.includes('sans correspondance')).length;
  detectedTotal += detected.length;
  unmappedTotal += unmapped;
  autoTotal += autoMatched.length;
  console.log(`  gares traduites : ${gates.length} ; sans correspondance : ${unmapped}`);
  if (autoMatched.length > 0)
    console.log(`  traduites automatiquement : ${autoMatched.join(', ')}`);
  const { charges, warnings } = computeTripTolls(gates, {
    book,
    openTolls: OPEN_TOLLS,
    vehicleClass: 1,
    date: new Date('2026-11-09'),
    uncertainGates: new Set(uncertain),
    alternatives: new Map(Object.entries(alternatives)),
  });
  for (const w of [...rw, ...warnings].slice(0, 6)) console.log(`  ⚠ ${w}`);
  if (charges.length === 0) {
    console.log('  péage calculé : aucun (gares non traduites)');
    continue;
  }
  const total = Math.round(charges.reduce((s, c) => s + c.amountEur, 0) * 100) / 100;
  const err = (Math.abs(total - trip.expectedEur) / trip.expectedEur) * 100;
  priced++;
  if (err <= 10) within10++;
  console.log(`  péage calculé : ${total.toFixed(2)} €  | écart : ${err.toFixed(1)} %`);
}
console.log(
  `\nBilan : ${TRIPS.length - skipped} trajets analysés ; gares détectées : ${detectedTotal}, ` +
    `dont traduites automatiquement : ${autoTotal} ; sans correspondance : ${unmappedTotal} ; trajets chiffrés : ${priced}, dont ≤ 10 % : ${within10}.`,
);
