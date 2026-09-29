import "dotenv/config";

import * as Sentry from "@sentry/node";
import pino from "pino";

import { runShopifyTick } from "@ermes/shopify";
import { installationRow } from "@ermes/db";
import { stopBoss } from "@ermes/core";

import { registerWorkers } from "./processors.js";
import { parseWorkerEnv } from "./runtime/env.js";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  name: "ermes-worker",
});

const env = parseWorkerEnv();

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
}

logger.info("worker started");

await registerWorkers(logger);
let shopifyBusy = false;
async function syncShopify() {
  if (shopifyBusy) return;
  shopifyBusy = true;
  try {
    const row = await installationRow();
    if (row.shop_domain && row.credentials.shopifyClientSecret)
      await runShopifyTick();
  } catch {
    logger.warn("Shopify sync tick failed; retrying automatically");
  } finally {
    shopifyBusy = false;
  }
}
const shopifyTimer = setInterval(() => void syncShopify(), 15_000);
void syncShopify();

async function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, "worker stopping");
  clearInterval(shopifyTimer);
  await stopBoss();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));
