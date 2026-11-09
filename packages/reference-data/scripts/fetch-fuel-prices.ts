/**
 * Récupère les prix moyens des carburants (France entière et par département) via 2 requêtes
 * d'agrégation sur data.economie.gouv.fr, et les enregistre dans data-sources/generated/.
 *
 * Usage : pnpm --filter @cout-trajet/reference-data run fetch-fuel
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchFuelPrices } from '../src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const snapshot = await fetchFuelPrices((url) =>
  fetch(url, { signal: AbortSignal.timeout(60_000) }),
);
const outDir = join(root, 'data-sources', 'generated');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'fuel-prices.json'),
  JSON.stringify({ fetchedAt: new Date().toISOString(), ...snapshot }),
);

console.log('France entière :');
for (const s of snapshot.national) {
  console.log(
    `  ${s.product.padEnd(7)} moyenne ${s.avgEurPerL.toFixed(3)} €/L` +
      `  médiane ${s.medianEurPerL?.toFixed(3) ?? '—'}  (${s.stations} stations)`,
  );
}
const departments = new Set(snapshot.departments.map((s) => s.scope));
console.log(`\nDépartements couverts : ${departments.size}`);
const gazole = snapshot.departments
  .filter((s) => s.product === 'gazole')
  .sort((a, b) => a.avgEurPerL - b.avgEurPerL);
const first = gazole[0];
const last = gazole[gazole.length - 1];
if (first && last) {
  console.log(
    `Gazole le moins cher : dép. ${first.scope} (${first.avgEurPerL.toFixed(3)} €/L) ; ` +
      `le plus cher : dép. ${last.scope} (${last.avgEurPerL.toFixed(3)} €/L)`,
  );
}
