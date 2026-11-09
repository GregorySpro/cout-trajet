/**
 * Applique les migrations SQL de `supabase/migrations/` à la base indiquée par DATABASE_URL.
 * Chaque migration est jouée une seule fois (suivi dans `public.schema_migrations`).
 *
 * Usage : pnpm --filter @cout-trajet/db run migrate
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from '../src/connect';
import { applyMigrations } from '../src/migrate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const envFile = join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const dir = join(root, 'supabase', 'migrations');
const migrations = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf-8') }));

let client;
try {
  client = await connect();
} catch (error) {
  console.error(`Connexion impossible : ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
try {
  const applied = await applyMigrations(client, migrations);
  console.log(
    applied.length === 0
      ? 'Base déjà à jour : aucune migration à appliquer.'
      : `Migrations appliquées :\n${applied.map((n) => `  - ${n}`).join('\n')}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
