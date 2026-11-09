export { DEFAULT_COST_CONFIG, DEFAULT_SPEED_PROFILE, type CostConfig } from './config';
export { compareRoutes, type Comparison } from './compare';
export { effectiveSpeedKmh, segmentDurationMin } from './duration';
export { estimateTrip, roundEur } from './estimate';
export { baseConsumption, segmentFuelLiters, speedFactor } from './fuel';
export {
  ROAD_CLASSES,
  type Estimate,
  type EstimateInput,
  type RoadClass,
  type RoadClassBreakdown,
  type RouteSegment,
  type SpeedProfile,
  type TollCharge,
  type VehicleConsumption,
} from './types';

/** Version du moteur ; à incrémenter quand la formule change (utile pour comparer d'anciens calculs). */
export const COST_ENGINE_VERSION = '0.1.0';
