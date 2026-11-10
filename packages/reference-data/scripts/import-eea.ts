/**
 * Ajoute à data-sources/generated/vehicles.json les véhicules de la base européenne de surveillance
 * du CO₂ (EEA) : fichiers CSV à déposer dans data-sources/eea/ (un par année, téléchargés à la main).
 * Seules les immatriculations françaises sont gardées ; l'ADEME reste prioritaire.
 *
 * Usage : pnpm --filter @cout-trajet/reference-data run import-eea [-- options]
 *   --dir <dossier>   dossier des CSV (défaut : data-sources/eea)
 *   --dry             n'écrit rien, affiche seulement le bilan
 *   --show <texte>    liste les véhicules importés dont le modèle contient ce texte
 *   --year <année>    année à appliquer aux fichiers sans colonne Year ni année dans leur nom
 */
import { createReadStream, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  EeaAccumulator,
  detectDelimiter,
  mergeVehicleSources,
  missingColumns,
  normalizeEeaRow,
  splitCsvLine,
  type VehicleModel,
} from '../src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const vehiclesFile = join(root, 'data-sources', 'generated', 'vehicles.json');

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const eeaDir = option('--dir')
  ? resolve(option('--dir') as string)
  : join(root, 'data-sources', 'eea');
const dry = args.includes('--dry');
const show = option('--show');
const forcedYear = option('--year');

if (!existsSync(eeaDir)) {
  console.error(
    `Dossier introuvable : ${eeaDir}\nDépose-y les fichiers CSV de l'EEA (voir docs/09-vehicules-eea.md).`,
  );
  process.exit(1);
}
// Les téléchargements en cours (.crdownload) et les archives (.zip) sont ignorés.
const files = readdirSync(eeaDir).filter((f) => /\.(csv|txt)$/i.test(f));
if (files.length === 0) {
  console.error(`Aucun fichier .csv ou .txt dans ${eeaDir} (extrais d'abord les archives .zip).`);
  process.exit(1);
}

const acc = new EeaAccumulator();
const seenFt = new Map<string, number>();
const seenFm = new Map<string, number>();
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
let frRows = 0;
let kept = 0;

for (const file of files) {
  const lines = createInterface({
    input: createReadStream(join(eeaDir, file), { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  // Les anciens fichiers n'ont pas de colonne Year : on prend l'année du nom du fichier.
  const fileYear = /(20\d{2})/.exec(file)?.[1] ?? forcedYear;
  let header: string[] | null = null;
  let delimiter = ',';
  let total = 0;
  let fileFr = 0;
  let fileKept = 0;
  for await (const raw of lines) {
    // Le premier caractère d'un fichier peut être une marque d'ordre des octets (BOM).
    const line = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    if (line === '') continue;
    if (header === null) {
      delimiter = detectDelimiter(line);
      header = splitCsvLine(line, delimiter).map((h) => h.trim());
      const missing = missingColumns(header);
      if (missing.length > 0) {
        console.error(
          `${file} : colonnes absentes (${missing.join(', ')}). En-tête : ${header.join(' | ')}`,
        );
        process.exit(1);
      }
      continue;
    }
    total++;
    // Filtre rapide avant l'analyse complète : on ne veut que la France.
    if (!/(^|[,;\t|"])FR([,;\t|"]|$)/.test(line)) continue;
    const cells = splitCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    const ms = Object.entries(row).find(([k]) => k.toLowerCase() === 'ms')?.[1];
    if (ms?.trim() !== 'FR') continue;
    fileFr++;
    for (const [k, v] of Object.entries(row)) {
      const key = k.toLowerCase();
      if (key === 'ft') bump(seenFt, v.trim().toLowerCase());
      if (key === 'fm') bump(seenFm, v.trim().toUpperCase());
    }
    const record = normalizeEeaRow(row, fileYear ? Number(fileYear) : undefined);
    if (record) {
      acc.add(record);
      fileKept++;
    }
  }
  frRows += fileFr;
  kept += fileKept;
  console.log(
    `${file} : ${total} lignes, ${fileFr} françaises, ${fileKept} retenues (année ${fileYear ?? 'colonne Year'})`,
  );
}

console.log('Carburants (Ft) rencontrés :', Object.fromEntries(seenFt));
console.log('Modes (Fm) rencontrés :', Object.fromEntries(seenFm));
console.log(`Lignes françaises : ${frRows} ; retenues : ${kept} ; motorisations : ${acc.size}`);

const eea = acc.vehicles();
if (show) {
  const needle = show.toUpperCase();
  for (const v of eea.filter((x) => x.model.includes(needle))) {
    console.log(
      `  ${v.brand} ${v.description} : ${v.l100.mixed} L/100 (CO₂ ${v.co2MixedGPerKm ?? '?'} g/km)`,
    );
  }
}

const current = JSON.parse(readFileSync(vehiclesFile, 'utf-8')) as {
  vehicles: VehicleModel[];
} & Record<string, unknown>;
// On repart toujours des seuls véhicules ADEME : relancer l'import ne cumule rien.
const ademe = current.vehicles.filter((v) => v.source === 'ademe-car-labelling');
const merged = mergeVehicleSources(ademe, eea);
console.log(
  `ADEME : ${merged.ademe} ; EEA gardés : ${merged.eeaKept} ; EEA écartés (modèle déjà dans l'ADEME) : ${merged.eeaDropped}`,
);

if (dry) {
  console.log("Mode --dry : rien n'a été écrit.");
} else {
  writeFileSync(vehiclesFile, JSON.stringify({ ...current, vehicles: merged.vehicles }));
  console.log(`Total : ${merged.vehicles.length} véhicules → ${vehiclesFile}`);
}
