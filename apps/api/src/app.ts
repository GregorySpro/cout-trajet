import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { COST_ENGINE_VERSION, type SpeedProfile } from '@cout-trajet/cost-engine';
import { FUEL_PRODUCTS, type VehicleModel } from '@cout-trajet/reference-data';
import { VEHICLE_CATEGORIES } from '@cout-trajet/shared';
import { normalizeGateName } from '@cout-trajet/tolls';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { QuotaGuard } from './infra/quota';
import { RoutingError } from './providers/routing';
import { ApiError, type EstimateRequest, type EstimateService } from './services/estimate-service';
import type { FuelPriceSource } from './services/fuel-price-source';

export interface AppDeps {
  service: Pick<EstimateService, 'estimate'>;
  vehicles: ReadonlyMap<string, VehicleModel>;
  fuelPrices: FuelPriceSource;
  quota: QuotaGuard;
  /** Origines autorisées pour CORS (le site). Vide = CORS désactivé. */
  allowedOrigins?: readonly string[];
  logger?: boolean;
  rateLimit?: { max: number; timeWindow: string };
}

// France métropolitaine (rectangle englobant, Corse comprise) : les données de péage ne couvrent rien d'autre.
const lon = z.number().min(-5.5, 'Longitude hors de France').max(10, 'Longitude hors de France');
const lat = z.number().min(41, 'Latitude hors de France').max(51.5, 'Latitude hors de France');
const coordinate = z.object({ lon, lat });

const consumption = z.object({
  urban: z.number().positive().max(100),
  rural: z.number().positive().max(100),
  motorway: z.number().positive().max(100).optional(),
});

const estimateBody = z.object({
  origin: coordinate,
  destination: coordinate,
  vehicle: z
    .object({
      category: z.enum(VEHICLE_CATEGORIES).default('car'),
      vehicleKey: z.string().min(1).max(300).optional(),
      consumption: consumption.optional(),
      tollClass: z
        .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
        .optional(),
      dimensions: z
        .object({
          heightM: z.number().positive().max(6),
          maxWeightT: z.number().positive().max(80),
          axles: z.number().int().min(1).max(10),
          motorcycle: z.boolean().optional(),
        })
        .optional(),
    })
    .default({ category: 'car' }),
  fuel: z
    .object({
      product: z.enum(FUEL_PRODUCTS).optional(),
      priceEurPerL: z.number().positive().max(10).optional(),
    })
    .default({}),
  speeds: z
    .object({
      urbanKmh: z.number().positive().max(130).optional(),
      ruralKmh: z.number().positive().max(130).optional(),
      motorwayKmh: z.number().positive().max(130).optional(),
    })
    .optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
    .optional(),
  excludeVat: z.boolean().default(false),
  alternatives: z.boolean().default(true),
  includeGeometry: z.boolean().default(true),
});

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function toRequest(body: z.infer<typeof estimateBody>): EstimateRequest {
  let date = new Date();
  if (body.date !== undefined) {
    date = new Date(`${body.date}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new ApiError('Date invalide.', 400);
  }
  return {
    origin: body.origin,
    destination: body.destination,
    vehicle: stripUndefined(body.vehicle) as EstimateRequest['vehicle'],
    fuel: stripUndefined(body.fuel),
    ...(body.speeds ? { speeds: stripUndefined(body.speeds) as Partial<SpeedProfile> } : {}),
    date,
    excludeVat: body.excludeVat,
    alternatives: body.alternatives,
    includeGeometry: body.includeGeometry,
  };
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ?? false,
    trustProxy: true, // derrière le proxy de l'hébergeur : récupérer la vraie adresse du client
    bodyLimit: 16 * 1024,
  });

  if ((deps.allowedOrigins ?? []).length > 0) {
    await app.register(cors, {
      origin: [...(deps.allowedOrigins ?? [])],
      methods: ['GET', 'POST'],
    });
  }
  await app.register(rateLimit, {
    max: deps.rateLimit?.max ?? 60,
    timeWindow: deps.rateLimit?.timeWindow ?? '1 minute',
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'invalid-request',
        message: 'Requête invalide.',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (error instanceof ApiError) {
      return reply.status(error.status).send({ error: 'invalid-request', message: error.message });
    }
    if (error instanceof RoutingError) {
      const status =
        error.code === 'quota'
          ? 503
          : error.code === 'no-route'
            ? 422
            : error.code === 'invalid-request'
              ? 400
              : 502;
      if (error.retryable) void reply.header('Retry-After', '60');
      return reply.status(status).send({ error: `routing-${error.code}`, message: error.message });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      return reply.status(status).send({ error: 'bad-request', message: (error as Error).message });
    }
    request.log.error(error);
    return reply.status(500).send({ error: 'internal', message: 'Erreur interne.' });
  });

  app.get('/health', async () => ({
    status: 'ok',
    engineVersion: COST_ENGINE_VERSION,
    routingQuota: deps.quota.snapshot(),
  }));

  app.get('/fuel-prices', async (_req, reply) => {
    const info = await deps.fuelPrices.get();
    if (!info)
      return reply.status(503).send({ error: 'unavailable', message: 'Prix indisponibles.' });
    const national: Record<string, number> = {};
    for (const product of FUEL_PRODUCTS) {
      const price = info.table.national(product);
      if (price !== undefined) national[product] = Math.round(price * 1000) / 1000;
    }
    return { fetchedAt: info.fetchedAt, stale: info.stale, national };
  });

  const vehiclesQuery = z.object({
    q: z.string().trim().max(60).default(''),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  });
  app.get('/vehicles', async (req) => {
    const { q, limit } = vehiclesQuery.parse(req.query);
    const terms = normalizeGateName(q).split(' ').filter(Boolean);
    const out: Record<string, unknown>[] = [];
    for (const v of deps.vehicles.values()) {
      const haystack = normalizeGateName(`${v.brand} ${v.model} ${v.label} ${v.description}`);
      if (terms.every((t) => haystack.includes(t))) {
        out.push({
          key: v.key,
          brand: v.brand,
          model: v.model,
          description: v.description,
          fuel: v.fuel,
          hybrid: v.hybrid,
          mixedL100: v.l100.mixed === null ? null : Math.round(v.l100.mixed * 10) / 10,
        });
        if (out.length >= limit) break;
      }
    }
    return { total: out.length, vehicles: out };
  });

  app.post(
    '/estimate',
    { config: { rateLimit: { max: deps.rateLimit?.max ?? 20, timeWindow: '1 minute' } } },
    async (req) => {
      const body = estimateBody.parse(req.body);
      return deps.service.estimate(toRequest(body));
    },
  );

  return app;
}
