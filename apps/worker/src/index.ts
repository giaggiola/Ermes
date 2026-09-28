import "dotenv/config";

import * as Sentry from "@sentry/node";
import pino from "pino";

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

async function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, "worker stopping");
  await stopBoss();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));
