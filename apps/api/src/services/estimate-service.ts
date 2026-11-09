import {
  compareRoutes,
  estimateTrip,
  type Comparison,
  type Estimate,
  type SpeedProfile,
  type TollCharge,
  type VehicleConsumption,
} from '@cout-trajet/cost-engine';
import type { FuelProduct, VehicleModel } from '@cout-trajet/reference-data';
import { toVehicleConsumption } from '@cout-trajet/reference-data';
import {
  DEFAULT_TOLL_CLASS,
  isHeavyGoodsVehicle,
  tollClassFor,
  type VehicleCategory,
  type VehicleClass,
  type VehicleDimensions,
} from '@cout-trajet/shared';
import {
  GATE_MAPPINGS,
  OPEN_TOLLS,
  computeTripTolls,
  detectGatesOnRoute,
  prepareOpenTolls,
  resolveRouteGates,
  type GateMapping,
  type LonLat,
  type OpenToll,
  type OsmBooth,
  type TollBook,
} from '@cout-trajet/tolls';
import { simplifyLine } from '../infra/geometry';
import {
  RoutingError,
  type Coordinate,
  type RouteRequest,
  type RouteResult,
  type RoutingProvider,
} from '../providers/routing';
import type { FuelPriceSource } from './fuel-price-source';

/** Erreur de validation métier (entrée incohérente), renvoyée en HTTP 400/404. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface EstimateRequest {
  origin: Coordinate;
  destination: Coordinate;
  vehicle: {
    category: VehicleCategory;
    vehicleKey?: string | undefined;
    consumption?: VehicleConsumption | undefined;
    tollClass?: VehicleClass | undefined;
    dimensions?: VehicleDimensions | undefined;
  };
  fuel: { product?: FuelProduct | undefined; priceEurPerL?: number | undefined };
  speeds?: Partial<SpeedProfile> | undefined;
  date: Date;
  excludeVat: boolean;
  alternatives: boolean;
  includeGeometry: boolean;
}

export interface RouteEstimate {
  kind: 'fastest' | 'noToll';
  distanceKm: number;
  providerDurationMin: number;
  estimate: Estimate;
  tolls: {
    charges: TollCharge[];
    gates: string[];
    /** Faux si un péage n'a pas pu être chiffré (gare sans correspondance, km à péage inexpliqués…). */
    complete: boolean;
    /** Vrai si au moins un péage est une estimation (correspondance par alias ou gare ambiguë). */
    estimated: boolean;
  };
  warnings: string[];
  geometry?: LonLat[];
}

export interface EstimateResponse {
  routes: RouteEstimate[];
  comparison: Comparison | null;
  vehicle: {
    category: VehicleCategory;
    tollClass: VehicleClass;
    label: string | null;
    consumption: VehicleConsumption | 'default-for-category';
  };
  fuelPrice: {
    product: FuelProduct | null;
    eurPerL: number;
    source: 'request' | 'national-average';
    fetchedAt: string | null;
    stale: boolean;
  };
  warnings: string[];
}

export interface EstimateDeps {
  routing: RoutingProvider;
  booths: readonly OsmBooth[];
  book: TollBook;
  mappings?: readonly GateMapping[];
  openTolls?: readonly OpenToll[];
  fuelPrices: FuelPriceSource;
  vehicles: ReadonlyMap<string, VehicleModel>;
}

/** Au-delà de ce nombre de km « à péage » hors des gares identifiées, le péage est peut-être sous-estimé. */
const UNEXPLAINED_TOLL_KM = 10;
/**
 * Marge autour de la première et de la dernière gare : une route marquée « à péage » dans les
 * approches d'une gare (bretelles, rocade gratuite classée à tort) n'est pas considérée comme inexpliquée.
 */
const TOLL_MARGIN_KM = 15;

/** Distance « à péage » (km) qui se trouve en dehors de la fenêtre [première gare − marge, dernière gare + marge]. */
function unexplainedTolledKm(
  spans: readonly { fromKm: number; toKm: number }[],
  detected: readonly { alongM: number }[],
): number {
  if (spans.length === 0) return 0;
  const first = detected[0];
  const last = detected[detected.length - 1];
  if (!first || !last) return spans.reduce((s, x) => s + (x.toKm - x.fromKm), 0);
  const windowStart = first.alongM / 1000 - TOLL_MARGIN_KM;
  const windowEnd = last.alongM / 1000 + TOLL_MARGIN_KM;
  let outside = 0;
  for (const { fromKm, toKm } of spans) {
    outside += Math.max(0, Math.min(toKm, windowStart) - fromKm);
    outside += Math.max(0, toKm - Math.max(fromKm, windowEnd));
  }
  return outside;
}

export class EstimateService {
  private readonly knownGates: Set<string>;
  private readonly openTolls: readonly OpenToll[];

  constructor(private readonly deps: EstimateDeps) {
    // Gares de grille + péages à tarif fixe (ponts, barrières ouvertes) ; une barrière ouverte qui
    // porte le nom d'une gare de grille est écartée au profit de la grille.
    const prepared = prepareOpenTolls(deps.book.gates(), deps.openTolls ?? OPEN_TOLLS);
    this.knownGates = prepared.knownGates;
    this.openTolls = prepared.openTolls;
  }

  async estimate(req: EstimateRequest): Promise<EstimateResponse> {
    const warnings: string[] = [];
    const { category } = req.vehicle;
    const heavy = isHeavyGoodsVehicle(category);

    // 1. Véhicule : consommation, carburant, classe de péage.
    let model: VehicleModel | undefined;
    if (req.vehicle.vehicleKey !== undefined) {
      model = this.deps.vehicles.get(req.vehicle.vehicleKey);
      if (!model) throw new ApiError('Véhicule inconnu.', 404);
    }
    const consumption = model ? toVehicleConsumption(model) : req.vehicle.consumption;
    if (!consumption && !heavy) {
      throw new ApiError(
        'Indiquez un véhicule (vehicleKey) ou sa consommation en L/100 km pour cette catégorie.',
        400,
      );
    }
    const tollClass: VehicleClass =
      req.vehicle.tollClass ??
      (req.vehicle.dimensions
        ? tollClassFor(req.vehicle.dimensions)
        : DEFAULT_TOLL_CLASS[category]);

    // 2. Prix du carburant.
    let product: FuelProduct | null = req.fuel.product ?? null;
    if (product === null) {
      if (model) product = model.fuel === 'diesel' ? 'gazole' : 'e10';
      else if (heavy) product = 'gazole';
    }
    let eurPerL = req.fuel.priceEurPerL;
    let priceSource: 'request' | 'national-average' = 'request';
    let fetchedAt: string | null = null;
    let stale = false;
    if (eurPerL === undefined) {
      if (product === null) {
        throw new ApiError(
          'Indiquez le carburant (fuel.product) ou son prix (fuel.priceEurPerL).',
          400,
        );
      }
      const info = await this.deps.fuelPrices.get();
      const price = info?.table.national(product);
      if (!info || price === undefined) {
        throw new ApiError('Prix du carburant indisponible : indiquez fuel.priceEurPerL.', 400);
      }
      eurPerL = price;
      priceSource = 'national-average';
      fetchedAt = info.fetchedAt;
      stale = info.stale;
      if (stale) warnings.push('Prix des carburants non rafraîchi (service public indisponible).');
    }

    // 3. Itinéraires.
    const profile = heavy ? 'driving-hgv' : 'driving-car';
    if (!heavy && (category === 'van' || category === 'motorhome' || category === 'motorcycle')) {
      warnings.push(
        'Les restrictions de hauteur et de poids ne sont prises en compte que pour les poids lourds.',
      );
    }
    const dims = req.vehicle.dimensions;
    const restrictions =
      heavy && dims ? { heightM: dims.heightM, weightT: dims.maxWeightT } : undefined;
    const base: Omit<RouteRequest, 'avoidTolls'> = {
      origin: req.origin,
      destination: req.destination,
      profile,
      ...(restrictions ? { restrictions } : {}),
    };

    const fast = await this.deps.routing.route({ ...base, avoidTolls: false });
    const routes: RouteEstimate[] = [
      this.buildRoute('fastest', fast, req, { consumption, eurPerL, tollClass }),
    ];

    const fastest = routes[0] as RouteEstimate;
    const hasToll = fast.tolledKm >= 1 || fastest.tolls.charges.length > 0;
    if (req.alternatives && hasToll) {
      try {
        const eco = await this.deps.routing.route({ ...base, avoidTolls: true });
        const sameRoute = Math.abs(eco.distanceKm - fast.distanceKm) / fast.distanceKm < 0.005;
        if (!sameRoute) {
          routes.push(this.buildRoute('noToll', eco, req, { consumption, eurPerL, tollClass }));
        }
      } catch (error) {
        if (error instanceof RoutingError) {
          warnings.push(`Itinéraire sans péage indisponible : ${error.message}`);
        } else {
          throw error;
        }
      }
    }

    const eco = routes.find((r) => r.kind === 'noToll');
    // On ne compare que si les péages des deux itinéraires sont connus : sinon l'itinéraire rapide
    // paraîtrait gratuit et la comparaison serait trompeuse.
    const comparable = eco !== undefined && fastest.tolls.complete && eco.tolls.complete;
    if (eco !== undefined && !comparable) {
      warnings.push(
        'Comparaison indisponible : le péage de l’itinéraire rapide n’a pas pu être calculé en entier.',
      );
    }
    return {
      routes,
      comparison: comparable ? compareRoutes(fastest.estimate, eco.estimate) : null,
      vehicle: {
        category,
        tollClass,
        label: model ? `${model.brand} ${model.description}` : null,
        consumption: consumption ?? 'default-for-category',
      },
      fuelPrice: { product, eurPerL, source: priceSource, fetchedAt, stale },
      warnings,
    };
  }

  private buildRoute(
    kind: 'fastest' | 'noToll',
    route: RouteResult,
    req: EstimateRequest,
    ctx: { consumption: VehicleConsumption | undefined; eurPerL: number; tollClass: VehicleClass },
  ): RouteEstimate {
    const { book } = this.deps;
    const warnings: string[] = [];

    // Gares franchies → gares de grille → péages officiels.
    const detected = detectGatesOnRoute(route.coordinates, this.deps.booths, 10);
    const resolved = resolveRouteGates(detected, this.deps.mappings ?? GATE_MAPPINGS, {
      knownGates: this.knownGates,
    });
    const trip = computeTripTolls(resolved.gates, {
      book,
      openTolls: this.openTolls,
      vehicleClass: ctx.tollClass,
      date: req.date,
      uncertainGates: new Set(resolved.uncertain),
      alternatives: new Map(Object.entries(resolved.alternatives)),
    });
    warnings.push(...resolved.warnings, ...trip.warnings);

    const unexplainedKm = unexplainedTolledKm(route.tolledSpans, detected);
    const unexplained = unexplainedKm > UNEXPLAINED_TOLL_KM;
    if (unexplained) {
      warnings.push(
        `${Math.round(unexplainedKm)} km marqués « à péage » en dehors des gares identifiées (péage en flux libre sans barrière, comme sur l’A13 et l’A14, ou gare absente de la carte) : le péage est peut-être sous-estimé.`,
      );
    }
    if (route.restrictedKm > 1) {
      warnings.push(
        `${Math.round(route.restrictedKm)} km sur des routes à accès restreint (livraison, destination…) : vérifiez que le véhicule y est autorisé.`,
      );
    }
    if (route.ferryKm > 0.1) {
      warnings.push('L’itinéraire comprend un bac : son tarif n’est pas compté.');
    }
    // Incomplet : une gare sans correspondance, un couple sans tarif, une gare isolée, des km à péage
    // inexpliqués. Une correspondance seulement incertaine ou ambiguë donne un prix « estimé », pas un manque.
    const complete =
      !unexplained &&
      !resolved.warnings.some((w) => w.includes('sans correspondance')) &&
      !trip.warnings.some((w) => w.includes('Aucun tarif') || w.includes('Gare isolée'));
    const estimated = trip.charges.some((c) => c.source === 'estimate');

    const estimate = estimateTrip({
      segments: route.segments,
      category: req.vehicle.category,
      ...(ctx.consumption ? { vehicle: ctx.consumption } : {}),
      fuelPriceEurPerL: ctx.eurPerL,
      ...(req.speeds ? { speeds: req.speeds } : {}),
      tolls: trip.charges,
      excludeVat: req.excludeVat,
    });

    return {
      kind,
      distanceKm: Math.round(route.distanceKm * 10) / 10,
      providerDurationMin: Math.round(route.providerDurationMin),
      estimate,
      tolls: { charges: trip.charges, gates: resolved.gates, complete, estimated },
      warnings,
      ...(req.includeGeometry ? { geometry: simplifyLine(route.coordinates, 30) } : {}),
    };
  }
}
