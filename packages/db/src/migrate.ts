import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getPool } from "./client.js";

const MIGRATION_LOCK_KEY_1 = 17815779;
const MIGRATION_LOCK_KEY_2 = 17819586;

// The drizzle SQL folder isn't traced into the web app's Next standalone bundle, so we
// resolve it from a few known runtime locations. Both Docker images copy it to
// /app/packages/db/drizzle (== <cwd>/packages/db/drizzle); the module-relative path
// covers the worker layout and local dev.
function resolveMigrationsFolder(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    resolve(process.cwd(), "packages/db/drizzle"),
    resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle"),
  ].filter((path): path is string => Boolean(path));
  return (
    candidates.find((path) => existsSync(path)) ??
    candidates[candidates.length - 1]
  );
}

// Apply pending migrations under a pg advisory lock so concurrent app boots (web +
// worker) don't race. Idempotent and safe to run on every startup. Does NOT close the
// pool — long-lived servers keep using it; the CLI closes it itself.
export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  const db = drizzle(client);

  await client.query("select pg_advisory_lock($1, $2)", [
    MIGRATION_LOCK_KEY_1,
    MIGRATION_LOCK_KEY_2,
  ]);
  try {
    await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
    console.log("[db:migrate] migrations complete");
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1, $2)", [
        MIGRATION_LOCK_KEY_1,
        MIGRATION_LOCK_KEY_2,
      ]);
    } finally {
      client.release();
    }
  }
}
