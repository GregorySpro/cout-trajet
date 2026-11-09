/**
 * Construit le livre de tarifs local à partir des grilles officielles stockées dans `data-sources/`
 * (documents tiers non versionnés), puis vérifie quelques tarifs de référence.
 *
 * Chaque source est datée et classée par fiabilité : quand deux sources donnent des prix différents
 * pour le même couple de gares, la plus récente l'emporte, puis la plus fiable (voir `TollBook`).
 *
 * Usage : pnpm --filter @cout-trajet/tolls run build-data
 * Sortie : data-sources/generated/toll-book.json (non versionné)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TollBook,
  parseAprrText,
  parseAreaText,
  parseSanefText,
  parseVinciCsv,
  type ParseResult,
  type PriceSource,
} from '../src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (name: string): string => readFileSync(join(root, 'data-sources', name), 'utf-8');
const has = (name: string): boolean => existsSync(join(root, 'data-sources', name));

const official = (id: string, label: string, effectiveFrom: string): PriceSource => ({
  id,
  label,
  effectiveFrom,
  reliability: 'official',
});

// Les fichiers « .txt » de Vinci Autoroutes portent une date de dernière modification de leur serveur
// (14/10/2026, relevée le 2026-11-09) postérieure aux guides PDF (février et juin 2026) : ils font foi.
const VINCI_DATE = '2026-10-14';

interface Source {
  label: string;
  file: string;
  source: PriceSource;
  run: () => ParseResult;
}

const sources: Source[] = [
  {
    label: 'APRR (PDF)',
    file: 'aprr_texte_extrait.txt',
    source: official('aprr-2026-02', 'Grille APRR au 01/02/2026', '2026-02-01'),
    run: () => parseAprrText(read('aprr_texte_extrait.txt'), 'APRR'),
  },
  {
    label: 'AREA (PDF)',
    file: 'area_texte_extrait.txt',
    source: official('area-2026-02', 'Grille AREA au 01/02/2026', '2026-02-01'),
    run: () => parseAreaText(read('area_texte_extrait.txt')),
  },
  {
    label: 'ASF (fichier Vinci)',
    file: 'vinci_asf.txt',
    source: official(
      'vinci-asf',
      `Tarifs ASF (fichier Vinci mis à jour le ${VINCI_DATE})`,
      VINCI_DATE,
    ),
    run: () => parseVinciCsv(read('vinci_asf.txt'), 'ASF'),
  },
  {
    label: 'Escota (fichier Vinci)',
    file: 'vinci_escota.txt',
    source: official(
      'vinci-escota',
      `Tarifs Escota (fichier Vinci mis à jour le ${VINCI_DATE})`,
      VINCI_DATE,
    ),
    run: () => parseVinciCsv(read('vinci_escota.txt'), 'ESCOTA'),
  },
  {
    label: 'Cofiroute (fichier Vinci)',
    file: 'vinci_cofiroute.txt',
    source: official(
      'vinci-cofiroute',
      `Tarifs Cofiroute (fichier Vinci mis à jour le ${VINCI_DATE})`,
      VINCI_DATE,
    ),
    run: () => parseVinciCsv(read('vinci_cofiroute.txt'), 'COFIROUTE'),
  },
  {
    label: 'Sanef (PDF)',
    file: 'sanef_texte_extrait.txt',
    source: official('sanef-2026-02', 'Brochure Sanef au 01/02/2026', '2026-02-01'),
    run: () => parseSanefText(read('sanef_texte_extrait.txt'), 'SANEF'),
  },
  {
    label: 'SAPN (PDF)',
    file: 'sapn_texte_extrait.txt',
    source: official('sapn-2026-02', 'Brochure SAPN (Paris-Normandie) au 01/02/2026', '2026-02-01'),
    run: () => parseSanefText(read('sapn_texte_extrait.txt'), 'SAPN'),
  },
];

const book = new TollBook();
for (const s of sources) {
  if (!has(s.file)) {
    console.log(`${s.label.padEnd(26)} (fichier absent : ${s.file})`);
    continue;
  }
  const { pairs, warnings } = s.run();
  book.add(pairs.map((p) => ({ ...p, source: s.source })));
  console.log(`${s.label.padEnd(26)} ${String(pairs.length).padStart(6)} couples de gares`);
  for (const w of warnings.slice(0, 4)) console.log(`   ⚠ ${w}`);
  if (warnings.length > 4) console.log(`   ⚠ … ${warnings.length - 4} autre(s) avertissement(s)`);
}
console.log(`\nTotal : ${book.size} couples de gares`);

// Conflits entre sources : la valeur la plus récente (puis la plus fiable) a été retenue.
const conflicts = book.conflicts;
console.log(`\nConflits entre sources : ${conflicts.length}`);
if (conflicts.length > 0) {
  const byReason = new Map<string, number>();
  for (const c of conflicts) byReason.set(c.reason, (byReason.get(c.reason) ?? 0) + 1);
  console.log('  par règle :', Object.fromEntries(byReason));
  for (const c of conflicts.slice(0, 8)) {
    console.log(
      `  ${c.from} → ${c.to} : retenu ${c.kept.class1Eur} € (${c.kept.sourceId}) au lieu de ${c.dropped.class1Eur} € (${c.dropped.sourceId}) [${c.reason}]`,
    );
  }
}

mkdirSync(join(root, 'data-sources', 'generated'), { recursive: true });
writeFileSync(
  join(root, 'data-sources', 'generated', 'toll-book.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), pairs: book.toArray(), conflicts }),
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
