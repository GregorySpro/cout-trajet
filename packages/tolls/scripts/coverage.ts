/**
 * Mesure la couverture de la correspondance automatique : pour chaque gare de péage nommée
 * d'OpenStreetMap (export national), la gare est-elle retrouvée dans les grilles chargées ?
 *
 * Prérequis : `pnpm --filter @cout-trajet/tolls run build-data` et l'export
 * `data-sources/cache/osm_france_toll_booths.json` (tools/export-osm-toll-booths.py).
 * Usage : pnpm --filter @cout-trajet/tolls run coverage
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GATE_MAPPINGS,
  GateIndex,
  normalizeGateName,
  TollBook,
  type PricePair,
} from '../src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const book = new TollBook(
  (
    JSON.parse(
      readFileSync(join(root, 'data-sources', 'generated', 'toll-book.json'), 'utf-8'),
    ) as {
      pairs: PricePair[];
    }
  ).pairs,
);
const index = new GateIndex(book.gates());
const nodes = (
  JSON.parse(
    readFileSync(join(root, 'data-sources', 'cache', 'osm_france_toll_booths.json'), 'utf-8'),
  ) as { elements: { tags?: { name?: string; operator?: string } }[] }
).elements;

const manual = new Set(GATE_MAPPINGS.flatMap((m) => m.names.map((n) => normalizeGateName(n))));
const NETWORKS = new Set(['APRR', 'AREA', 'ASF', 'COFIROUTE', 'ESCOTA', 'SANEF', 'SAPN']);
const loaded = new Set([...book.gates()].map((g) => g.split(':')[0]));

type Row = Record<string, number>;
const stats = new Map<string, Row>();
const bump = (net: string, key: string): void => {
  const row = stats.get(net) ?? {};
  row[key] = (row[key] ?? 0) + 1;
  stats.set(net, row);
};
const missing = new Map<string, Set<string>>();

for (const n of nodes) {
  const name = n.tags?.name;
  const op = normalizeGateName((n.tags?.operator ?? '').replace(/'/g, ''));
  const net = NETWORKS.has(op) ? op : 'autres réseaux';
  if (name === undefined || name === '') {
    bump(net, 'sans nom');
    continue;
  }
  if (net === 'autres réseaux') {
    bump(net, 'hors périmètre');
    continue;
  }
  if (!loaded.has(net)) {
    bump(net, 'grille non chargée');
    continue;
  }
  if (manual.has(normalizeGateName(name))) {
    bump(net, 'manuel');
    continue;
  }
  const m = index.match(net, name);
  if (!m) {
    bump(net, 'non trouvé');
    const set = missing.get(net) ?? new Set<string>();
    set.add(name);
    missing.set(net, set);
  } else if (m.gates.length > 1) {
    bump(net, 'ambigu');
  } else {
    bump(net, m.kind === 'exact' ? 'exact' : m.kind === 'loose' ? 'souple' : 'alias');
  }
}

console.log(`Nœuds OSM (barrier=toll_booth) : ${nodes.length}\n`);
for (const [net, row] of [...stats].sort()) {
  console.log(net.padEnd(16), JSON.stringify(row));
}
for (const net of ['APRR', 'ASF', 'COFIROUTE', 'ESCOTA', 'SANEF']) {
  const set = missing.get(net);
  if (set)
    console.log(
      `\n${net} — ${set.size} noms non trouvés, exemples :`,
      [...set].sort().slice(0, 12),
    );
}
