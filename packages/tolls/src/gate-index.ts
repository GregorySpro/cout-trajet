import { normalizeGateName } from './normalize';

/** Comment une gare OpenStreetMap a été rapprochée d'une gare de grille. */
export type MatchKind = 'exact' | 'loose' | 'alias';

export interface GateMatch {
  /** Gares de grille candidates (plus d'une = correspondance ambiguë). */
  gates: string[];
  kind: MatchKind;
}

// Préfixes fréquents des noms OpenStreetMap : « Péage de X », « Gare de péage de X », « Barrière de péage de X »…
const PREFIX = /^(GARE DE PEAGE |BARRIERE DE PEAGE |PEAGE |GARE )(DE LA |DE L'|DE |DU |DES |D')?/;

/**
 * Nom OpenStreetMap débarrassé de ses préfixes (« Péage de Fleury-en-Bière » → « FLEURY-EN-BIERE »)
 * et, sauf demande contraire, de son suffixe « Barrière ».
 */
export function osmBaseName(name: string, keepBarrierSuffix = false): string {
  const base = normalizeGateName(name).replace(PREFIX, '');
  return (keepBarrierSuffix ? base : base.replace(/ BARRIERE$/, '')).trim();
}

/**
 * Clé « souple » : insensible à la ponctuation, aux espaces, aux parenthèses, aux numéros de sortie
 * (N°8), à « Saint/St » et à « S/ » pour « sur ».
 */
export function looseKey(name: string): string {
  return name
    .replace(/\(.*?\)/g, ' ')
    .replace(/\bS\//g, 'SUR ')
    .replace(/\bSAINTE\b/g, 'STE')
    .replace(/\bSAINT\b/g, 'ST')
    .replace(/\bN°?\s*\d+(\.\d+)?\b/g, ' ')
    .replace(/[^A-Z0-9]/g, '');
}

interface NetworkIndex {
  exact: Map<string, string>;
  loose: Map<string, Set<string>>;
  alias: Map<string, Set<string>>;
}

function add(map: Map<string, Set<string>>, key: string, gate: string): void {
  if (key === '') return;
  const set = map.get(key) ?? new Set<string>();
  set.add(gate);
  map.set(key, set);
}

/**
 * Index des gares des grilles, par réseau, pour rapprocher automatiquement les noms OpenStreetMap.
 * Trois niveaux de confiance décroissante :
 *  - `exact`  : même nom après normalisation ;
 *  - `loose`  : même nom à la ponctuation, aux numéros de sortie et à « Saint/sur » près ;
 *  - `alias`  : le nom correspond à un alias de la gare de grille (texte entre parenthèses,
 *               nom sans parenthèses, morceau d'un nom composé « A / B » ou « A - B »).
 * ⚠️ Rapprochement par nom : un nom identique ne prouve pas qu'il s'agit de la même gare (voir le cas
 * Senlis / Chamant). Les correspondances manuelles restent prioritaires.
 */
export class GateIndex {
  private readonly networks = new Map<string, NetworkIndex>();

  constructor(knownGates: Iterable<string>) {
    for (const id of knownGates) {
      const sep = id.indexOf(':');
      if (sep < 0) continue;
      const network = id.slice(0, sep);
      const name = id.slice(sep + 1);
      let idx = this.networks.get(network);
      if (!idx) {
        idx = { exact: new Map(), loose: new Map(), alias: new Map() };
        this.networks.set(network, idx);
      }
      idx.exact.set(name, id);
      add(idx.loose, looseKey(name), id);
      for (const inner of name.matchAll(/\((.*?)\)/g)) {
        add(idx.alias, looseKey((inner[1] ?? '').replace(/^PEAGE (DE |D')?/, '')), id);
      }
      add(idx.alias, looseKey(name.replace(/\(.*?\)/g, ' ')), id);
      for (const part of name.split(/\/| - /)) {
        if (part !== name) add(idx.alias, looseKey(part), id);
      }
    }
  }

  /** Cherche la ou les gares de grille correspondant à un nom OpenStreetMap d'un réseau donné. */
  match(network: string, osmName: string): GateMatch | undefined {
    const idx = this.networks.get(network);
    if (!idx) return undefined;
    // Deux lectures du nom : avec le suffixe « Barrière » (certaines grilles l'emploient pour distinguer
    // « ST QUENTIN FAL. BARRIERE » de « ST QUENTIN FAL. BRETELLE »), puis sans.
    const withSuffix = osmBaseName(osmName, true);
    const withoutSuffix = osmBaseName(osmName);
    const bases = withSuffix === withoutSuffix ? [withoutSuffix] : [withSuffix, withoutSuffix];

    for (const base of bases) {
      const exact = idx.exact.get(base);
      if (exact !== undefined) return { gates: [exact], kind: 'exact' };
    }
    for (const base of bases) {
      const key = looseKey(base);
      if (key === '') continue;
      const loose = idx.loose.get(key);
      if (loose && loose.size > 0) return { gates: [...loose].sort(), kind: 'loose' };
    }
    for (const base of bases) {
      const key = looseKey(base);
      if (key === '') continue;
      const alias = idx.alias.get(key);
      if (alias && alias.size > 0) return { gates: [...alias].sort(), kind: 'alias' };
    }
    return undefined;
  }
}
