import { z } from "zod";

const workerEnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    APP_URL: z.string().url().optional(),
    COMMERCE_COMMAND_SHARED_SECRET: z.string().min(32).optional(),
    COMMERCE_COMMAND_URL: z.string().url().optional(),
    EMAIL_LOGO_URL: z.string().url().optional(),
    EMAIL_PREFERENCES_URL: z.string().url().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PREFERENCE_TOKEN_PREVIOUS_SECRET: z.string().min(32).optional(),
    PREFERENCE_TOKEN_SECRET: z.string().min(32).optional(),
    RESEND_API_KEY: z.string().optional(),
    SENTRY_DSN: z.string().optional(),
    STOREFRONT_URL: z.string().url().optional(),
  })
  .passthrough();

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseWorkerEnv(
  env: NodeJS.ProcessEnv = process.env,
): WorkerEnv {
  const parsed = workerEnvSchema.parse(env);
  if (parsed.NODE_ENV === "production" && !parsed.PREFERENCE_TOKEN_SECRET) {
    throw new Error("PREFERENCE_TOKEN_SECRET is required in production");
  }
  return parsed;
}
