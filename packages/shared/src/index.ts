/** Classes de véhicule des concessionnaires d'autoroute (1 = voiture particulière). */
export const VEHICLE_CLASSES = [1, 2, 3, 4, 5] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

export function isVehicleClass(value: number): value is VehicleClass {
  return (VEHICLE_CLASSES as readonly number[]).includes(value);
}

export {
  DEFAULT_TOLL_CLASS,
  VEHICLE_CATEGORIES,
  isHeavyGoodsVehicle,
  tollClassFor,
  type VehicleCategory,
  type VehicleDimensions,
} from './vehicle-categories';
