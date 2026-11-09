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
}

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const kx = 111_320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot((lon1 - lon2) * kx, (lat1 - lat2) * 110_540);
}

/** Traduit les gares OpenStreetMap franchies en gares de grille, dans l'ordre du trajet. */
export function resolveRouteGates(
  osmGates: readonly OsmGate[],
  mappings: readonly GateMapping[],
): ResolvedRouteGates {
  const gates: string[] = [];
  const warnings: string[] = [];

  for (const osm of osmGates) {
    const name = normalizeGateName(osm.name);
    const matching = mappings.filter((m) => m.names.some((n) => normalizeGateName(n) === name));
    const located = matching.find(
      (m) => m.at !== undefined && distanceM(osm.lat, osm.lon, m.at.lat, m.at.lon) <= m.at.radiusM,
    );
    const mapping = located ?? matching.find((m) => m.at === undefined);
    if (!mapping) {
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
  return { gates, warnings };
}
