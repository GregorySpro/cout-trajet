/**
 * Construit le livre de tarifs local à partir des grilles officielles stockées dans `data-sources/`
 * (documents tiers non versionnés), puis vérifie quelques tarifs de référence.
 *
 * Usage : pnpm --filter @cout-trajet/tolls run build-data
 * Sortie : data-sources/generated/toll-book.json (non versionné)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TollBook,
  parseAprrText,
  parseSanefText,
  parseVinciCsv,
  type ParseResult,
} from '../src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (name: string): string => readFileSync(join(root, 'data-sources', name), 'utf-8');

const sources: [string, () => ParseResult][] = [
  ['APRR (PDF)', () => parseAprrText(read('aprr_texte_extrait.txt'), 'APRR')],
  ['ASF (CSV Vinci)', () => parseVinciCsv(read('vinci_asf.txt'), 'ASF')],
  ['Escota (CSV Vinci)', () => parseVinciCsv(read('vinci_escota.txt'), 'ESCOTA')],
  ['Cofiroute (CSV Vinci)', () => parseVinciCsv(read('vinci_cofiroute.txt'), 'COFIROUTE')],
  ['Sanef (PDF)', () => parseSanefText(read('sanef_texte_extrait.txt'))],
];

const book = new TollBook();
for (const [label, run] of sources) {
  const { pairs, warnings } = run();
  book.add(pairs);
  console.log(`${label.padEnd(24)} ${String(pairs.length).padStart(6)} couples de gares`);
  for (const w of warnings.slice(0, 5)) console.log(`   ⚠ ${w}`);
  if (warnings.length > 5) console.log(`   ⚠ … ${warnings.length - 5} autre(s) avertissement(s)`);
}
console.log(`\nTotal : ${book.size} couples de gares`);

mkdirSync(join(root, 'data-sources', 'generated'), { recursive: true });
writeFileSync(
  join(root, 'data-sources', 'generated', 'toll-book.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), pairs: book.toArray() }),
);

// Contrôles : tarifs de référence officiels (classe 1), relevés le 2026-11-09.
const checks: [string, string, number][] = [
  ['APRR:FLEURY-EN-BIERE', 'APRR:VILLEFRANCHE-LIMAS', 41.3],
  ['ASF:VIENNE', 'ASF:LANCON', 28.1],
  ['ASF:TOULOUSE-NORD/EST', 'ASF:SAINT-SELVE', 22.9],
  ['ASF:TOULOUSE-NORD/OUEST', 'ASF:SAINT-SELVE', 22.2],
  ['SANEF:PARIS / ROISSY (PEAGE DE CHAMANT)', 'SANEF:LILLE / DOURGES (PEAGE DE FRESNES)', 18.9],
];
console.log('\nContrôles sur les tarifs de référence (classe 1) :');
let failed = 0;
for (const [from, to, expected] of checks) {
  const got = book.priceBetween(from, to, 1);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`  ${ok ? 'OK  ' : 'ÉCHEC'} ${from} → ${to} : attendu ${expected}, obtenu ${got}`);
}
process.exitCode = failed === 0 ? 0 : 1;
