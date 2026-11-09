export { TollBook } from './book';
export { detectGatesOnRoute, type DetectedGate, type LonLat, type OsmBooth } from './detect-gates';
export { GATE_BREAK } from './gate-break';
export { GATE_MAPPINGS } from './gate-mapping';
export { GateIndex, looseKey, osmBaseName, type GateMatch, type MatchKind } from './gate-index';
export {
  resolveRouteGates,
  type GateMapping,
  type OsmGate,
  type ResolveOptions,
  type ResolvedRouteGates,
} from './gate-resolver';
export { gateId, normalizeGateName, parseFrenchNumber } from './normalize';
export { OPEN_TOLLS, openTollPrice, type OpenToll, type Season } from './open-tolls';
export { parseAprrText } from './parse-aprr';
export { parseAreaText } from './parse-area';
export { parseSanefText } from './parse-sanef';
export { parseVinciCsv } from './parse-vinci';
export { computeTripTolls, type TripTollContext, type TripTolls } from './trip-tolls';
export type {
  ClassPrices,
  Concession,
  ParseResult,
  PriceConflict,
  PricePair,
  PriceSource,
  Reliability,
} from './types';
