/** Client minimal (compatible avec `pg.Client` et `pg.PoolClient`) : facilite les tests. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface Migration {
  /** Nom du fichier, ex. `20261109000001_reference_data.sql` (l'ordre alphabétique est l'ordre d'application). */
  name: string;
  sql: string;
}

const TRACKING_TABLE = 'public.schema_migrations';

/**
 * Applique les migrations qui ne l'ont pas encore été, dans l'ordre alphabétique, chacune dans sa
 * propre transaction. L'historique est conservé dans `public.schema_migrations`.
 * Renvoie les noms des migrations appliquées pendant cet appel.
 */
export async function applyMigrations(
  client: Queryable,
  migrations: readonly Migration[],
): Promise<string[]> {
  await client.query(
    `create table if not exists ${TRACKING_TABLE} (
       name       text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  // La table de suivi ne doit pas être lisible par l'API publique.
  await client.query(`alter table ${TRACKING_TABLE} enable row level security`);

  const done = new Set(
    (await client.query(`select name from ${TRACKING_TABLE}`)).rows.map((r) => String(r['name'])),
  );
  const applied: string[] = [];
  for (const m of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
    if (done.has(m.name)) continue;
    await client.query('begin');
    try {
      await client.query(m.sql);
      await client.query(`insert into ${TRACKING_TABLE} (name) values ($1)`, [m.name]);
      await client.query('commit');
      applied.push(m.name);
    } catch (error) {
      await client.query('rollback');
      throw new Error(
        `Migration ${m.name} échouée : ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  return applied;
}
