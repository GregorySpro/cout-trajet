export {
  importAdemeLines,
  isDetailEstimated,
  normalizeAdemeLine,
  toVehicleConsumption,
  type AdemeImport,
  type VehicleFuel,
  type VehicleModel,
  type VehicleSource,
  type WltpConsumption,
} from './ademe';
export {
  CO2_G_PER_LITER,
  EEA_COLUMNS,
  EeaAccumulator,
  PHASE_RATIOS,
  detectDelimiter,
  groupEeaRecords,
  mergeVehicleSources,
  missingColumns,
  normalizeEeaRow,
  splitCsvLine,
  type EeaRecord,
  type EeaRow,
  type MergeReport,
} from './eea';
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
