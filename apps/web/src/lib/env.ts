import { z } from "zod";

export const webEnvSchema = z
  .object({
    APP_URL: z.string().url().optional(),
    DATABASE_URL: z.string().min(1).optional(),
    COMMERCE_EVENT_WEBHOOK_SECRET: z.string().min(32).optional(),
    EMAIL_LOGO_URL: z.string().url().optional(),
    EMAIL_PREFERENCES_URL: z.string().url().optional(),
    MEDUSA_EVENT_WEBHOOK_SECRET: z.string().optional(),
    OPS_MESSAGING_ADMIN_URL: z.string().url().optional(),
    OPS_MESSAGING_SHARED_SECRET: z.string().min(32).optional(),
    PREFERENCE_TOKEN_PREVIOUS_SECRET: z.string().min(32).optional(),
    PREFERENCE_TOKEN_SECRET: z.string().min(32).optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_WEBHOOK_SECRET: z.string().optional(),
    STOREFRONT_URL: z.string().url().optional(),
  })
  .passthrough();

export function parseWebEnv(env: NodeJS.ProcessEnv = process.env) {
  const parsed = webEnvSchema.parse(env);
  if (env.NODE_ENV === "production") {
    if (!/^[a-f0-9]{64}$/i.test(env.ERMES_ENCRYPTION_KEY ?? ""))
      throw new Error("ERMES_ENCRYPTION_KEY must be 64 hex characters");
    if (!env.APP_URL) throw new Error("APP_URL is required");
    if (!parsed.PREFERENCE_TOKEN_SECRET) {
      throw new Error("PREFERENCE_TOKEN_SECRET is required in production");
    }
    if (!parsed.OPS_MESSAGING_SHARED_SECRET) {
      throw new Error("OPS_MESSAGING_SHARED_SECRET is required in production");
    }
    if (
      !parsed.COMMERCE_EVENT_WEBHOOK_SECRET &&
      !parsed.MEDUSA_EVENT_WEBHOOK_SECRET
    ) {
      throw new Error(
        "COMMERCE_EVENT_WEBHOOK_SECRET is required in production",
      );
    }
  }
  return parsed;
}
