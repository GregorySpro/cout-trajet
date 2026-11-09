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
}

export interface ResolvedRouteGates {
  gates: string[];
  warnings: string[];
  /** Gares traduites automatiquement (nom exact), sans entrée dans la table : à contrôler. */
  autoMatched: string[];
}

export interface ResolveOptions {
  /**
   * Gares connues des grilles (identifiants `RÉSEAU:NOM`). Si fourni, une gare OpenStreetMap sans
   * correspondance manuelle est traduite quand son nom, normalisé et sans « Péage de », est
   * exactement celui d'une gare du réseau indiqué par son opérateur. Les correspondances manuelles
   * restent prioritaires. ⚠️ Un nom identique ne prouve pas qu'il s'agit de la même gare.
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

/** Identifiant de gare déduit du nom et de l'opérateur OpenStreetMap, ou `undefined`. */
function autoGateId(osm: OsmGate): string | undefined {
  const network = OPERATOR_TO_NETWORK[normalizeGateName(osm.operator ?? '')];
  if (network === undefined) return undefined;
  const base = normalizeGateName(osm.name).replace(/^PEAGE (DE |D')/, '');
  return `${network}:${base}`;
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

  for (const osm of osmGates) {
    const name = normalizeGateName(osm.name);
    const matching = mappings.filter((m) => m.names.some((n) => normalizeGateName(n) === name));
    const located = matching.find(
      (m) => m.at !== undefined && distanceM(osm.lat, osm.lon, m.at.lat, m.at.lon) <= m.at.radiusM,
    );
    const mapping = located ?? matching.find((m) => m.at === undefined);
    if (!mapping) {
      const auto = autoGateId(osm);
      if (auto !== undefined && options.knownGates?.has(auto)) {
        autoMatched.push(auto);
        if (gates[gates.length - 1] !== auto) gates.push(auto);
        continue;
      }
      warnings.push(`Gare OpenStreetMap sans correspondance : « ${osm.name} ».`);
      continue;
    }
    const gate = mapping.gates[0];
    if (gate === undefined) continue;
    if (mapping.gates.length > 1) {
      warnings.push(
        `Gare ambiguë « ${osm.name} » : ${mapping.gates.join(' ou ')} (première retenue).`,
      );
    }
    if (gates[gates.length - 1] !== gate) gates.push(gate);
  }
  return { gates, warnings, autoMatched };
}
