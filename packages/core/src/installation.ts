import { z } from "zod";

export class EmailDeliveryDisabledError extends Error {
  constructor() {
    super(
      "Email delivery is disabled. Complete sender setup before enabling delivery.",
    );
    this.name = "EmailDeliveryDisabledError";
  }
}

export const merchantSettingsSchema = z
  .object({
    storeName: z.string().trim().min(1).max(100),
    storefrontUrl: z
      .string()
      .url()
      .refine(
        (value) => new URL(value).protocol === "https:",
        "Use an HTTPS storefront URL",
      ),
    senderName: z.string().trim().min(1).max(100),
    senderEmail: z.string().email().max(320),
    logoUrl: z
      .union([
        z.literal(""),
        z
          .string()
          .url()
          .refine((value) => new URL(value).protocol === "https:"),
      ])
      .default(""),
    timezone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid timezone"),
  })
  .strict();
export type MerchantSettings = z.infer<typeof merchantSettingsSchema>;

export const integrationInputSchema = z
  .object({
    resendApiKey: z.string().trim().min(10).max(512).optional(),
    resendWebhookSecret: z.string().trim().min(16).max(512).optional(),
    cloudinaryCloudName: z
      .string()
      .trim()
      .regex(/^[a-z0-9_-]{1,128}$/)
      .optional(),
    cloudinaryApiKey: z
      .string()
      .trim()
      .regex(/^[0-9]{5,64}$/)
      .optional(),
    cloudinaryApiSecret: z.string().trim().min(16).max(512).optional(),
    shopDomain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/)
      .optional(),
    shopifyClientId: z.string().trim().min(8).max(256).optional(),
    shopifyClientSecret: z.string().trim().min(16).max(512).optional(),
  })
  .strict();

export interface InstallationStatus {
  merchant: MerchantSettings | null;
  credentials: Record<string, boolean>;
  shopDomain: string | null;
  deliveryEnabled: boolean;
  shopifyVerifiedAt: string | null;
  shopifyConnectorActive: boolean;
  shopifySync?: {
    counts: Record<string, number>;
    completed: string[];
    pendingWebhooks: number;
    failedJobs: number;
    lastWebhookAt: string | null;
    lastSyncAt: string | null;
    lastRecoveryAt: string | null;
    error: string | null;
  } | null;
}
