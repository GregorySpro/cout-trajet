export {
  importAdemeLines,
  normalizeAdemeLine,
  toVehicleConsumption,
  type AdemeImport,
  type VehicleFuel,
  type VehicleModel,
  type WltpConsumption,
} from './ademe';
export {
  ADEME_FIELDS,
  fetchAdemeLines,
  fetchFuelPrices,
  type FetchLike,
  type FuelPriceSnapshot,
} from './fetchers';
export {
  FUEL_API_BASE,
  FUEL_PRODUCTS,
  FuelPriceTable,
  departmentQueryUrl,
  nationalQueryUrl,
  parseDepartmentPrices,
  parseNationalPrices,
  weightedFuelPrice,
  type DepartmentShare,
  type FuelPriceStat,
  type FuelProduct,
} from './fuel-prices';
export { finiteOrNull, fixMojibake, midpoint } from './text';
