/** Produits suivis dans le flux officiel « Prix des carburants en France - Flux instantané - v2 ». */
export const FUEL_PRODUCTS = ['gazole', 'e10', 'sp95', 'sp98', 'e85', 'gplc'] as const;
export type FuelProduct = (typeof FUEL_PRODUCTS)[number];

export const FUEL_API_BASE =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';

/** Statistique de prix d'un produit sur un territoire (France entière ou un département). */
export interface FuelPriceStat {
  /** `FR` pour la France entière, sinon le code du département (`01`, `2A`, `75`…). */
  scope: string;
  product: FuelProduct;
  avgEurPerL: number;
  /** Médiane si disponible (France entière uniquement). */
  medianEurPerL: number | null;
  /** Nombre de stations qui publient un prix pour ce produit. */
  stations: number;
}

type Row = Record<string, unknown>;

function num(row: Row, key: string): number | null {
  const v = row[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function selectClause(withMedian: boolean): string {
  return FUEL_PRODUCTS.flatMap((p) => [
    `avg(${p}_prix) as ${p}_avg`,
    ...(withMedian ? [`median(${p}_prix) as ${p}_med`] : []),
    `count(${p}_prix) as ${p}_n`,
  ]).join(',');
}

/** Assemble une URL avec des espaces encodés en %20 (et non en « + »). */
function buildUrl(params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${FUEL_API_BASE}?${query}`;
}

/** URL de la requête d'agrégation nationale (une seule ligne de résultat). */
export function nationalQueryUrl(): string {
  return buildUrl({ select: selectClause(true), limit: '1' });
}

/** URL de la requête d'agrégation par département (une ligne par département, ≈ 97). */
export function departmentQueryUrl(): string {
  return buildUrl({
    select: `code_departement,${selectClause(false)}`,
    group_by: 'code_departement',
    order_by: 'code_departement',
    limit: '120',
  });
}

function statsFromRow(row: Row, scope: string): FuelPriceStat[] {
  const out: FuelPriceStat[] = [];
  for (const product of FUEL_PRODUCTS) {
    const avg = num(row, `${product}_avg`);
    const stations = num(row, `${product}_n`) ?? 0;
    if (avg === null || avg <= 0 || stations <= 0) continue;
    out.push({
      scope,
      product,
      avgEurPerL: avg,
      medianEurPerL: num(row, `${product}_med`),
      stations,
    });
  }
  return out;
}

/** Lit la réponse de `nationalQueryUrl()`. */
export function parseNationalPrices(json: unknown): FuelPriceStat[] {
  const row = (json as { results?: Row[] })?.results?.[0];
  return row ? statsFromRow(row, 'FR') : [];
}

/** Lit la réponse de `departmentQueryUrl()` ; les stations sans département sont ignorées. */
export function parseDepartmentPrices(json: unknown): FuelPriceStat[] {
  const rows = (json as { results?: Row[] })?.results ?? [];
  return rows.flatMap((row) => {
    const code = row['code_departement'];
    return typeof code === 'string' && code !== '' ? statsFromRow(row, code) : [];
  });
}

/** Table de prix pour un produit : prix par territoire. */
export class FuelPriceTable {
  private readonly byKey = new Map<string, FuelPriceStat>();

  constructor(stats: Iterable<FuelPriceStat>) {
    for (const s of stats) this.byKey.set(`${s.scope}|${s.product}`, s);
  }

  get(scope: string, product: FuelProduct): FuelPriceStat | undefined {
    return this.byKey.get(`${scope}|${product}`);
  }

  national(product: FuelProduct): number | undefined {
    return this.get('FR', product)?.avgEurPerL;
  }
}

export interface DepartmentShare {
  department: string;
  km: number;
}

/**
 * Prix moyen du carburant sur un trajet : moyenne des prix départementaux pondérée par les
 * kilomètres parcourus dans chaque département. Un département sans prix retombe sur la moyenne
 * nationale. Renvoie `undefined` si aucun prix (ni départemental ni national) n'est disponible.
 */
export function weightedFuelPrice(
  shares: readonly DepartmentShare[],
  table: FuelPriceTable,
  product: FuelProduct,
): number | undefined {
  const national = table.national(product);
  let weighted = 0;
  let total = 0;
  for (const { department, km } of shares) {
    if (!(km > 0)) continue;
    const price = table.get(department, product)?.avgEurPerL ?? national;
    if (price === undefined) continue;
    weighted += price * km;
    total += km;
  }
  return total > 0 ? weighted / total : national;
}
