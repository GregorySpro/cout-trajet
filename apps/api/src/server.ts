import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from '@cout-trajet/db';
import { z } from 'zod';
import { CachedFuelPrices } from './services/fuel-price-source';
import { buildApp } from './app';
import { loadData, loadDataFromDatabase, type LoadedData } from './data';
import { TtlCache } from './infra/cache';
import { QuotaGuard } from './infra/quota';
import { OpenRouteServiceProvider } from './providers/ors';
import type { RouteResult } from './providers/routing';
import { EstimateService } from './services/estimate-service';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// En développement, les variables viennent de .env (ignoré par git) ; en production, de l'hébergeur.
const envFile = join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    HOST: z.string().default('0.0.0.0'),
    ORS_API_KEY: z.string().min(20, 'ORS_API_KEY manquante ou trop courte'),
    ALLOWED_ORIGINS: z.string().default(''),
    TOLL_BOOK_PATH: z.string().default(join(root, 'data-sources', 'generated', 'toll-book.json')),
    OSM_BOOTHS_PATH: z
      .string()
      .default(join(root, 'data-sources', 'cache', 'osm_france_toll_booths.json')),
    VEHICLES_PATH: z.string().default(join(root, 'data-sources', 'generated', 'vehicles.json')),
    FUEL_PRICES_PATH: z
      .string()
      .default(join(root, 'data-sources', 'generated', 'fuel-prices.json')),
  })
  .parse(process.env);

// Source des données de référence : la base (si DATABASE_URL est définie) ou des fichiers locaux.
let data: LoadedData;
if (process.env['DATABASE_URL']) {
  const client = await connect();
  try {
    data = await loadDataFromDatabase(client);
  } finally {
    await client.end();
  }
} else {
  data = loadData({
    tollBook: env.TOLL_BOOK_PATH,
    booths: env.OSM_BOOTHS_PATH,
    vehicles: env.VEHICLES_PATH,
    fuelPrices: env.FUEL_PRICES_PATH,
  });
}

const quota = new QuotaGuard(20);
const routing = new OpenRouteServiceProvider({
  apiKey: env.ORS_API_KEY,
  fetchFn: (url, init) => fetch(url, init),
  quota,
  cache: new TtlCache<RouteResult>(6 * 60 * 60_000, 500),
});
const fuelPrices = new CachedFuelPrices(
  (url) => fetch(url, { signal: AbortSignal.timeout(30_000) }),
  6 * 60 * 60_000,
  Date.now,
  data.fuelSnapshot,
);

const service = new EstimateService({
  routing,
  booths: data.booths,
  book: data.book,
  fuelPrices,
  vehicles: data.vehicles,
  ...(data.openTolls ? { openTolls: data.openTolls } : {}),
});

const app = await buildApp({
  service,
  vehicles: data.vehicles,
  fuelPrices,
  quota,
  allowedOrigins: env.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  logger: true,
});

await app.listen({ port: env.PORT, host: env.HOST });
