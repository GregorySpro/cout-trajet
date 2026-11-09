import { FUEL_API_BASE, departmentQueryUrl, nationalQueryUrl } from './fuel-prices';
import { parseDepartmentPrices, parseNationalPrices, type FuelPriceStat } from './fuel-prices';

/** Sous-ensemble de `fetch` utilisé ici, remplaçable dans les tests. */
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const ADEME_ORIGIN = 'https://data.ademe.fr/';
const ADEME_LINES_URL = `${ADEME_ORIGIN}data-fair/api/v1/datasets/ademe-car-labelling/lines`;

/** Champs réellement utilisés (réduit fortement le volume téléchargé). */
export const ADEME_FIELDS = [
  'Marque',
  'Modèle',
  'Libellé_modèle',
  'Description_Commerciale',
  'Energie',
  'Type_de_boite',
  'Puissance_maximale',
  'Cylindrée',
  'Prix_véhicule',
  'Conso_basse_vitesse_Min',
  'Conso_basse_vitesse_Max',
  'Conso_moyenne_vitesse_Min',
  'Conso_moyenne_vitesse_Max',
  'Conso_haute_vitesse_Min',
  'Conso_haute_vitesse_Max',
  'Conso_T-haute_vitesse_Min',
  'Conso_T-haute_vitesse_Max',
  'Conso_vitesse_mixte_Min',
  'Conso_vitesse_mixte_Max',
  'CO2_vitesse_mixte_Min',
  'CO2_vitesse_mixte_Max',
] as const;

async function getJson(fetchFn: FetchLike, url: string): Promise<unknown> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url.slice(0, 120)}`);
  return res.json();
}

/**
 * Récupère toutes les lignes du jeu ADEME « Car Labelling » en suivant la pagination (`next`).
 * Le lien `next` est refusé s'il ne reste pas sur data.ademe.fr (données distantes = non fiables).
 */
export async function fetchAdemeLines(
  fetchFn: FetchLike,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<Record<string, unknown>[]> {
  const pageSize = options.pageSize ?? 1000;
  const maxPages = options.maxPages ?? 20;
  const params = new URLSearchParams({ size: String(pageSize), select: ADEME_FIELDS.join(',') });
  let url: string | undefined = `${ADEME_LINES_URL}?${params.toString()}`;
  const lines: Record<string, unknown>[] = [];

  for (let page = 0; url !== undefined && page < maxPages; page++) {
    const json = (await getJson(fetchFn, url)) as {
      results?: Record<string, unknown>[];
      next?: string;
    };
    lines.push(...(json.results ?? []));
    const next: string | undefined = json.next;
    if (next === undefined || next === '') break;
    if (!next.startsWith(ADEME_ORIGIN)) {
      throw new Error(`Lien de pagination refusé (origine inattendue) : ${next.slice(0, 80)}`);
    }
    url = next;
  }
  return lines;
}

export interface FuelPriceSnapshot {
  national: FuelPriceStat[];
  departments: FuelPriceStat[];
}

/** Récupère les moyennes nationales et départementales (2 requêtes d'agrégation, pas de téléchargement massif). */
export async function fetchFuelPrices(fetchFn: FetchLike): Promise<FuelPriceSnapshot> {
  if (!nationalQueryUrl().startsWith(FUEL_API_BASE)) throw new Error('URL de requête inattendue');
  const [nat, dep] = await Promise.all([
    getJson(fetchFn, nationalQueryUrl()),
    getJson(fetchFn, departmentQueryUrl()),
  ]);
  return { national: parseNationalPrices(nat), departments: parseDepartmentPrices(dep) };
}
