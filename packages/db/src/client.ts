import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema.js";

let pool: Pool | undefined;

export function getPool(config: PoolConfig = {}): Pool {
  if (!pool) {
    const connectionString = config.connectionString ?? process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is required for Ermes database access");
    }

    pool = new Pool({
      ...config,
      connectionString,
    });
  }

  return pool;
}

export function getDb(config: PoolConfig = {}) {
  return drizzle(getPool(config), { schema });
}

export type EilishMessagingDb = ReturnType<typeof getDb>;
