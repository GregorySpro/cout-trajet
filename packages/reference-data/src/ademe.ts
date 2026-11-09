import type { VehicleConsumption } from '@cout-trajet/cost-engine';
import { finiteOrNull, fixMojibake, midpoint } from './text';

/** Carburant principal d'un véhicule thermique ou hybride non rechargeable. */
export type VehicleFuel = 'gasoline' | 'diesel';

/**
 * Consommations en L/100 km, mesurées au cycle WLTP, par phase :
 *  - `low`       : basse vitesse (≈ 26 km/h de moyenne)   → utilisée comme consommation urbaine ;
 *  - `medium`    : moyenne vitesse (≈ 47 km/h) ;
 *  - `high`      : haute vitesse (≈ 78 km/h)               → utilisée comme consommation « route » ;
 *  - `extraHigh` : très haute vitesse (≈ 94 km/h, jusqu'à 131) → utilisée comme consommation autoroute ;
 *  - `mixed`     : cycle complet (consommation « mixte » affichée sur l'étiquette).
 * ⚠️ La correspondance phase → type de route est une hypothèse à calibrer (voir docs/04).
 */
export interface WltpConsumption {
  low: number;
  medium: number | null;
  high: number;
  extraHigh: number;
  mixed: number | null;
}

export interface VehicleModel {
  /** Clé d'identité stable (marque|modèle|description|énergie|boîte|puissance|cylindrée|mixte). */
  key: string;
  brand: string;
  model: string;
  /** Libellé commercial du modèle (ex. « SERIE 2 »). */
  label: string;
  /** Description de la version (ex. « 220i Gran Coupé »). */
  description: string;
  fuel: VehicleFuel;
  /** Hybride non rechargeable (la consommation WLTP inclut la contribution électrique). */
  hybrid: boolean;
  gearbox: string | null;
  powerKw: number | null;
  co2MixedGPerKm: number | null;
  priceEur: number | null;
  l100: WltpConsumption;
  source: 'ademe-car-labelling';
}

/** Énergies retenues pour le MVP (thermique et hybride non rechargeable). */
const ENERGY: Readonly<Record<string, { fuel: VehicleFuel; hybrid: boolean }>> = {
  ESSENCE: { fuel: 'gasoline', hybrid: false },
  GAZOLE: { fuel: 'diesel', hybrid: false },
  'ESS+ELEC HNR': { fuel: 'gasoline', hybrid: true },
  'GAZ+ELEC HNR': { fuel: 'diesel', hybrid: true },
};

type RawRecord = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? fixMojibake(value.trim()) : '';
}

/**
 * Transforme une ligne de l'API ADEME « Car Labelling » en modèle de véhicule.
 * Renvoie `null` pour les énergies hors MVP (électrique, hybride rechargeable, E85, GPL) et pour les
 * lignes sans consommation exploitable.
 */
export function normalizeAdemeLine(raw: RawRecord): VehicleModel | null {
  const energy = typeof raw['Energie'] === 'string' ? raw['Energie'].trim() : '';
  const kind = ENERGY[energy];
  if (!kind) return null;

  const low = midpoint(raw['Conso_basse_vitesse_Min'], raw['Conso_basse_vitesse_Max']);
  const high = midpoint(raw['Conso_haute_vitesse_Min'], raw['Conso_haute_vitesse_Max']);
  const extraHigh = midpoint(raw['Conso_T-haute_vitesse_Min'], raw['Conso_T-haute_vitesse_Max']);
  if (low === null || high === null || extraHigh === null) return null;
  if (!(low > 0 && high > 0 && extraHigh > 0)) return null;

  const medium = midpoint(raw['Conso_moyenne_vitesse_Min'], raw['Conso_moyenne_vitesse_Max']);
  const mixed = midpoint(raw['Conso_vitesse_mixte_Min'], raw['Conso_vitesse_mixte_Max']);
  const brand = text(raw['Marque']);
  const model = text(raw['Modèle']);
  const description = text(raw['Description_Commerciale']);
  if (brand === '' || model === '') return null;

  const gearbox = text(raw['Type_de_boite']) || null;
  const powerKw = finiteOrNull(raw['Puissance_maximale']);
  const cylinder = finiteOrNull(raw['Cylindrée']);
  const key = [
    brand,
    model,
    description,
    energy,
    gearbox ?? '',
    powerKw ?? '',
    cylinder ?? '',
    mixed === null ? '' : mixed.toFixed(2),
  ].join('|');

  return {
    key,
    brand,
    model,
    label: text(raw['Libellé_modèle']),
    description,
    fuel: kind.fuel,
    hybrid: kind.hybrid,
    gearbox,
    powerKw,
    co2MixedGPerKm: midpoint(raw['CO2_vitesse_mixte_Min'], raw['CO2_vitesse_mixte_Max']),
    priceEur: finiteOrNull(raw['Prix_véhicule']),
    l100: { low, medium, high, extraHigh, mixed },
    source: 'ademe-car-labelling',
  };
}

/** Convertit un modèle ADEME en consommations pour le moteur de coût. */
export function toVehicleConsumption(model: VehicleModel): VehicleConsumption {
  return {
    urban: model.l100.low,
    rural: model.l100.high,
    motorway: model.l100.extraHigh,
  };
}

export interface AdemeImport {
  vehicles: VehicleModel[];
  /** Lignes ignorées, par raison (énergie hors MVP, consommation manquante…). */
  skipped: number;
  duplicates: number;
}

/** Normalise une liste de lignes brutes, écarte les non-éligibles et dédoublonne par clé. */
export function importAdemeLines(lines: readonly RawRecord[]): AdemeImport {
  const byKey = new Map<string, VehicleModel>();
  let skipped = 0;
  let duplicates = 0;
  for (const line of lines) {
    const vehicle = normalizeAdemeLine(line);
    if (!vehicle) {
      skipped++;
    } else if (byKey.has(vehicle.key)) {
      duplicates++;
    } else {
      byKey.set(vehicle.key, vehicle);
    }
  }
  return { vehicles: [...byKey.values()], skipped, duplicates };
}
