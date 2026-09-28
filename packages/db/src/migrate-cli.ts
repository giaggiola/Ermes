import { getPool } from "./client.js";
import { runMigrations } from "./migrate.js";

// Standalone migration runner for the worker image (CMD: migrate-cli && worker). Exits
// non-zero on failure so a bad migration blocks the worker boot and surfaces loudly.
runMigrations()
  .then(() => getPool().end())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[db:migrate] migrations failed", error);
    process.exit(1);
  });
