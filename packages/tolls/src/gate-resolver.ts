import { GateIndex } from './gate-index';
import { normalizeGateName } from './normalize';

/** Gare telle que détectée sur un itinéraire (nom OpenStreetMap et position). */
export interface OsmGate {
  name: string;
  operator?: string;
  lat: number;
  lon: number;
}

/**
 * Correspondance entre une gare OpenStreetMap et une gare d'une grille tarifaire.
 * ⚠️ Établie à la main : les noms OpenStreetMap peuvent désigner une autre gare que celle de la grille
 * (ex. le nœud « Senlis » de la barrière de Chamant). Ne jamais déduire la correspondance d'une
 * ressemblance de noms.
 */
export interface GateMapping {
  /** Noms OpenStreetMap concernés (comparés après normalisation). */
  names: string[];
  /** Si présent, la correspondance ne vaut que pour une gare située dans ce rayon. */
  at?: { lat: number; lon: number; radiusM: number };
  /** Gares de la grille. Plus d'une : correspondance ambiguë (la première est utilisée, avec avertissement). */
  gates: string[];
  /**
   * Gare de frontière entre deux réseaux : la gare compte comme plusieurs gares de grille, dans
   * l'ordre du trajet (sortie du premier réseau puis entrée du suivant). Prioritaire sur `gates`.
   */
  sequence?: string[];
}

export interface ResolvedRouteGates {
  gates: string[];
  warnings: string[];
  /** Gares traduites automatiquement (sans entrée dans la table manuelle) : à contrôler. */
  autoMatched: string[];
  /** Gares dont la correspondance est incertaine (alias, ou plusieurs candidates) : prix à traiter comme estimé. */
  uncertain: string[];
  /** Pour une gare ambiguë : la gare retenue → toutes les candidates. */
  alternatives: Record<string, string[]>;
}

export interface ResolveOptions {
  /**
   * Gares connues des grilles (identifiants `RÉSEAU:NOM`). Si fourni, une gare OpenStreetMap sans
   * correspondance manuelle est rapprochée automatiquement par son nom dans le réseau de son
   * opérateur (voir `GateIndex`). Les correspondances manuelles restent prioritaires.
   */
  knownGates?: ReadonlySet<string>;
}

const OPERATOR_TO_NETWORK: Readonly<Record<string, string>> = {
  APRR: 'APRR',
  AREA: 'AREA',
  ASF: 'ASF',
  COFIROUTE: 'COFIROUTE',
  ESCOTA: 'ESCOTA',
  SANEF: 'SANEF',
  SAPN: 'SAPN',
};

// Un index par ensemble de gares (la construction coûte quelques millisecondes).
const indexCache = new WeakMap<ReadonlySet<string>, GateIndex>();
function indexFor(known: ReadonlySet<string>): GateIndex {
  let index = indexCache.get(known);
  if (!index) {
    index = new GateIndex(known);
    indexCache.set(known, index);
  }
  return index;
}

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const kx = 111_320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot((lon1 - lon2) * kx, (lat1 - lat2) * 110_540);
}

/** Traduit les gares OpenStreetMap franchies en gares de grille, dans l'ordre du trajet. */
export function resolveRouteGates(
  osmGates: readonly OsmGate[],
  mappings: readonly GateMapping[],
  options: ResolveOptions = {},
): ResolvedRouteGates {
  const gates: string[] = [];
  const warnings: string[] = [];
  const autoMatched: string[] = [];
  const uncertain = new Set<string>();
  const alternatives: Record<string, string[]> = {};
  const push = (gate: string): void => {
    if (gates[gates.length - 1] !== gate) gates.push(gate);
  };

  for (const osm of osmGates) {
    const name = normalizeGateName(osm.name);
    const matching = mappings.filter((m) => m.names.some((n) => normalizeGateName(n) === name));
    const located = matching.find(
      (m) => m.at !== undefined && distanceM(osm.lat, osm.lon, m.at.lat, m.at.lon) <= m.at.radiusM,
    );
    const mapping = located ?? matching.find((m) => m.at === undefined);

    if (mapping) {
      if (mapping.sequence && mapping.sequence.length > 0) {
        for (const g of mapping.sequence) push(g);
        continue;
      }
      const gate = mapping.gates[0];
      if (gate === undefined) continue;
      if (mapping.gates.length > 1) {
        alternatives[gate] = [...mapping.gates];
        uncertain.add(gate);
        warnings.push(
          `Gare ambiguë « ${osm.name} » : ${mapping.gates.join(' ou ')} (prix estimé sur l'ensemble des candidates).`,
        );
      }
      push(gate);
      continue;
    }

    const network = OPERATOR_TO_NETWORK[normalizeGateName(osm.operator ?? '')];
    const match =
      network !== undefined && options.knownGates
        ? indexFor(options.knownGates).match(network, osm.name)
        : undefined;
    if (!match) {
      warnings.push(`Gare OpenStreetMap sans correspondance : « ${osm.name} ».`);
      continue;
    }
    const gate = match.gates[0] as string;
    autoMatched.push(gate);
    if (match.gates.length > 1) {
      alternatives[gate] = [...match.gates];
      uncertain.add(gate);
      warnings.push(
        `Gare ambiguë « ${osm.name} » : ${match.gates.join(' ou ')} (prix estimé sur l'ensemble des candidates).`,
      );
    } else if (match.kind === 'alias') {
      uncertain.add(gate);
      warnings.push(
        `Correspondance incertaine pour « ${osm.name} » → ${gate} (rapprochement par alias).`,
      );
    }
    push(gate);
  }
  return { gates, warnings, autoMatched, uncertain: [...uncertain], alternatives };
}
