import { readFileSync } from 'node:fs';
import pg from 'pg';

/**
 * Options de connexion Postgres (Supabase) à partir de l'environnement :
 *  - `DATABASE_URL` : chaîne de connexion, à prendre dans Supabase (« Connect » → pooler de session,
 *    compatible IPv4). Elle contient le mot de passe de la base : ne jamais l'afficher ni la versionner ;
 *  - `DATABASE_CA_PATH` (facultatif) : certificat racine de Supabase pour vérifier le serveur.
 *    Sans lui, la connexion est chiffrée mais l'identité du serveur n'est pas vérifiée.
 */
export function connectionOptions(env: NodeJS.ProcessEnv = process.env): pg.ClientConfig {
  const url = env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL absente (voir docs/08-supabase.md).');
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(
      'DATABASE_URL illisible : format attendu postgresql://utilisateur:motdepasse@hote:port/base',
    );
  }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const ca = env['DATABASE_CA_PATH'];
  return {
    connectionString: url,
    connectionTimeoutMillis: 15_000,
    ssl: local
      ? false
      : ca
        ? { ca: readFileSync(ca, 'utf-8'), rejectUnauthorized: true }
        : { rejectUnauthorized: false },
  };
}

export async function connect(env: NodeJS.ProcessEnv = process.env): Promise<pg.Client> {
  const client = new pg.Client(connectionOptions(env));
  await client.connect();
  return client;
}
