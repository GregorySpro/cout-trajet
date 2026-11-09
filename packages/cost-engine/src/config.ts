import type { RoadClass, SpeedProfile } from './types';

/**
 * Paramètres du modèle de consommation.
 *
 * ⚠️ HYPOTHÈSES À CALIBRER : ces valeurs sont des ordres de grandeur physiques raisonnables,
 * pas des mesures. Elles doivent être calibrées sur des relevés réels (voir docs/04-donnees-et-calcul.md).
 */
export interface CostConfig {
  /** Vitesse de référence (à laquelle la conso de base est valable) et part aérodynamique. */
  reference: Record<RoadClass, { speedKmh: number; aeroShare: number }>;
  /** Conso autoroute / conso extra-urbaine, utilisée quand la conso autoroute n'est pas fournie. */
  motorwayVsRuralFactor: number;
  /** Incertitude relative sur le coût carburant (±). */
  fuelUncertainty: number;
  /** Incertitude relative sur un péage estimé (±) ; 0 pour un tarif officiel. */
  tollEstimateUncertainty: number;
}

export const DEFAULT_COST_CONFIG: CostConfig = {
  reference: {
    // En ville, la conso ADEME « urbaine » est déjà un cycle moyen : pas de correction de vitesse.
    urban: { speedKmh: 30, aeroShare: 0 },
    rural: { speedKmh: 80, aeroShare: 0.3 },
    motorway: { speedKmh: 110, aeroShare: 0.5 },
  },
  motorwayVsRuralFactor: 1.1,
  fuelUncertainty: 0.1,
  tollEstimateUncertainty: 0.15,
};

export const DEFAULT_SPEED_PROFILE: SpeedProfile = {
  urbanKmh: 30,
  ruralKmh: 80,
  motorwayKmh: 130,
};
