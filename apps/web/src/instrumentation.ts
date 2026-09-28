import { runMigrations } from "@ermes/db";
import { parseWebEnv } from "./lib/env";
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  parseWebEnv();
  await runMigrations();
}
