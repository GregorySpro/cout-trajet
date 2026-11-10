import type { VehicleFuel, VehicleModel } from './ademe';

/**
 * Importe la base européenne de surveillance du CO₂ des voitures neuves (règlement (UE) 2019/631,
 * Agence européenne pour l'environnement) : une ligne par voiture immatriculée. Elle complète
 * l'ADEME, qui ne couvre que peu de modèles.
 *
 * Selon l'année, les colonnes diffèrent (constaté sur le fichier 2018 et un extrait 2025) :
 *  - séparateur tabulation ou virgule, noms en casse variable (`ec (cm3)` / `Ec (cm3)`) ;
 *  - `Fc` (consommation, L/100 km) présente seulement dans les fichiers récents ;
 *  - `Year` absente dans les anciens fichiers (l'année vient alors du nom du fichier) ;
 *  - `Ewltp (g/km)` renseignée seulement pour les voitures homologuées au cycle WLTP.
 * Les noms de colonnes sont donc comparés sans tenir compte de la casse.
 */

/**
 * Rapport entre la consommation de chaque phase WLTP et la consommation mixte : médianes des 594
 * modèles de l'ADEME (mesurées le 2026-11-10). Valeurs reprises dans `apps/web/lib/api.ts`.
 */
export const PHASE_RATIOS = { low: 1.257, high: 0.861, extraHigh: 1.039 } as const;

/**
 * Masse de CO₂ émise par litre de carburant brûlé (g/L), utilisée pour retrouver la consommation
 * quand `Fc` est absente : consommation (L/100 km) = CO₂ (g/km) ÷ (valeur ÷ 100).
 */
export const CO2_G_PER_LITER = { gasoline: 2331, diesel: 2640 } as const;

/** Ligne brute d'un fichier EEA : nom de colonne → texte. */
export type EeaRow = Readonly<Record<string, string>>;

/** Colonnes indispensables (en minuscules) ; il faut aussi `fc` ou `ewltp (g/km)`. */
export const EEA_COLUMNS = ['ms', 'mk', 'cn', 'ft', 'fm', 'ec (cm3)', 'ep (kw)'];

export interface EeaRecord {
  brand: string;
  model: string;
  fuel: VehicleFuel;
  hybrid: boolean;
  cylinderCm3: number | null;
  powerKw: number | null;
  litersPer100: number;
  co2GPerKm: number | null;
  year: number;
}

function num(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Sépare une ligne CSV (guillemets pris en charge, pas de champ sur plusieurs lignes). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  out.push(cell);
  return out;
}

/** Devine le séparateur depuis la ligne d'en-tête. */
export function detectDelimiter(header: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = header.split(d).length;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** Colonnes utiles absentes d'un en-tête, sans tenir compte de la casse (vide = fichier exploitable). */
export function missingColumns(header: readonly string[]): string[] {
  const present = new Set(header.map((h) => h.trim().toLowerCase()));
  const missing = EEA_COLUMNS.filter((c) => !present.has(c));
  if (!present.has('fc') && !present.has('ewltp (g/km)')) missing.push('fc ou ewltp (g/km)');
  return missing;
}

function lowerKeys(row: EeaRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) out[k.trim().toLowerCase()] = v;
  return out;
}

/**
 * Convertit une ligne EEA. `null` pour une immatriculation hors de France, d'une énergie hors
 * périmètre (électrique, rechargeable, GPL, E85, hydrogène…), sans consommation exploitable ou
 * sans année. La consommation vient de `Fc` ; à défaut, du CO₂ WLTP. Le CO₂ du cycle NEDC
 * (ancien cycle, trop optimiste) est ignoré.
 *
 * @param fallbackYear année à utiliser quand la colonne `Year` manque (tirée du nom du fichier)
 */
export function normalizeEeaRow(row: EeaRow, fallbackYear?: number): EeaRecord | null {
  const r = lowerKeys(row);
  if ((r['ms'] ?? '').trim() !== 'FR') return null;
  const ft = (r['ft'] ?? '').trim().toLowerCase();
  const fm = (r['fm'] ?? '').trim().toUpperCase();

  let fuel: VehicleFuel;
  let hybrid: boolean;
  if (ft === 'petrol' || ft === 'diesel') {
    fuel = ft === 'petrol' ? 'gasoline' : 'diesel';
    hybrid = fm === 'H';
  } else if (ft === 'petrol/electric' || ft === 'diesel/electric') {
    if (fm !== 'H') return null; // hybride rechargeable : hors périmètre
    fuel = ft === 'petrol/electric' ? 'gasoline' : 'diesel';
    hybrid = true;
  } else {
    return null;
  }
  if (fm !== 'M' && fm !== 'H' && fm !== '') return null; // bicarburation, flex, rechargeable…

  const co2 = num(r['ewltp (g/km)']);
  let litersPer100 = num(r['fc']);
  if (litersPer100 === null && co2 !== null && co2 > 0) {
    litersPer100 = co2 / (CO2_G_PER_LITER[fuel] / 100);
  }
  if (litersPer100 === null || !(litersPer100 > 0.5 && litersPer100 < 40)) return null;

  const brand = (r['mk'] ?? '').trim().toUpperCase();
  const model = (r['cn'] ?? '').trim().toUpperCase();
  const year = num(r['year']) ?? fallbackYear ?? null;
  if (brand === '' || model === '' || year === null) return null;

  return {
    brand,
    model,
    fuel,
    hybrid,
    cylinderCm3: num(r['ec (cm3)']),
    powerKw: num(r['ep (kw)']),
    litersPer100,
    co2GPerKm: co2,
    year,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Group {
  brand: string;
  model: string;
  fuel: VehicleFuel;
  hybrid: boolean;
  cylinderCm3: number | null;
  powerKw: number | null;
  /** Année la plus récente vue pour cette configuration. */
  year: number;
  count: number;
  sumLiters: number;
  co2Count: number;
  sumCo2: number;
}

/**
 * Regroupe les lignes par configuration (marque, modèle, énergie, cylindrée, puissance) au fil de
 * l'eau : une année compte plusieurs millions de lignes pour la France, on n'en garde pas la liste.
 * Pour chaque configuration, on ne garde que l'année la plus récente et la moyenne de ses lignes.
 */
export class EeaAccumulator {
  private readonly groups = new Map<string, Group>();

  add(r: EeaRecord): void {
    const key = [r.brand, r.model, r.fuel, r.hybrid, r.cylinderCm3 ?? '', r.powerKw ?? ''].join(
      '|',
    );
    let g = this.groups.get(key);
    if (g === undefined) {
      g = {
        brand: r.brand,
        model: r.model,
        fuel: r.fuel,
        hybrid: r.hybrid,
        cylinderCm3: r.cylinderCm3,
        powerKw: r.powerKw,
        year: r.year,
        count: 0,
        sumLiters: 0,
        co2Count: 0,
        sumCo2: 0,
      };
      this.groups.set(key, g);
    }
    if (r.year < g.year) return; // une année plus récente est déjà connue
    if (r.year > g.year) {
      g.year = r.year;
      g.count = 0;
      g.sumLiters = 0;
      g.co2Count = 0;
      g.sumCo2 = 0;
    }
    g.count++;
    g.sumLiters += r.litersPer100;
    if (r.co2GPerKm !== null) {
      g.co2Count++;
      g.sumCo2 += r.co2GPerKm;
    }
  }

  get size(): number {
    return this.groups.size;
  }

  vehicles(): VehicleModel[] {
    const out: VehicleModel[] = [];
    for (const [groupKey, g] of this.groups) {
      const mixed = round1(g.sumLiters / g.count);
      const engine = [
        g.cylinderCm3 !== null ? `${g.cylinderCm3} cm³` : null,
        g.powerKw !== null ? `${g.powerKw} kW` : null,
        g.hybrid ? 'hybride' : null,
      ]
        .filter((p): p is string => p !== null)
        .join(' ');
      out.push({
        key: `EEA|${groupKey}`,
        brand: g.brand,
        model: g.model,
        label: g.model,
        description: engine === '' ? g.model : `${g.model} ${engine}`,
        fuel: g.fuel,
        hybrid: g.hybrid,
        gearbox: null,
        powerKw: g.powerKw,
        co2MixedGPerKm: g.co2Count > 0 ? round1(g.sumCo2 / g.co2Count) : null,
        priceEur: null,
        l100: {
          low: round2(mixed * PHASE_RATIOS.low),
          medium: null,
          high: round2(mixed * PHASE_RATIOS.high),
          extraHigh: round2(mixed * PHASE_RATIOS.extraHigh),
          mixed,
        },
        source: 'eea-co2-monitoring',
      });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }
}

/** Regroupe une liste de lignes déjà en mémoire (voir `EeaAccumulator` pour les gros fichiers). */
export function groupEeaRecords(records: Iterable<EeaRecord>): VehicleModel[] {
  const acc = new EeaAccumulator();
  for (const r of records) acc.add(r);
  return acc.vehicles();
}

/** Rend comparables des noms de marque ou de modèle : « B.M.W. » = « BMW ». */
function norm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function sameBrand(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));
}

/** Égalité stricte : un préfixe confondrait « C3 » et « C3 AIRCROSS ». Un doublon vaut mieux qu'un oubli. */
function sameModel(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

export interface MergeReport {
  vehicles: VehicleModel[];
  ademe: number;
  eeaKept: number;
  /** Modèles EEA écartés parce que l'ADEME les couvre déjà (plus précise). */
  eeaDropped: number;
}

/**
 * Fusionne les deux sources. Quand un modèle existe chez l'ADEME (même marque, même modèle), seules
 * ses versions sont gardées : ses consommations sont mesurées par phase, pas estimées.
 */
export function mergeVehicleSources(
  ademe: readonly VehicleModel[],
  eea: readonly VehicleModel[],
): MergeReport {
  const byBrand = new Map<string, VehicleModel[]>();
  for (const v of ademe) {
    const list = byBrand.get(norm(v.brand));
    if (list) list.push(v);
    else byBrand.set(norm(v.brand), [v]);
  }

  const kept: VehicleModel[] = [];
  let dropped = 0;
  for (const v of eea) {
    const covered = [...byBrand.entries()].some(
      ([brand, list]) => sameBrand(brand, v.brand) && list.some((a) => sameModel(a.model, v.model)),
    );
    if (covered) dropped++;
    else kept.push(v);
  }
  return {
    vehicles: [...ademe, ...kept],
    ademe: ademe.length,
    eeaKept: kept.length,
    eeaDropped: dropped,
  };
}
