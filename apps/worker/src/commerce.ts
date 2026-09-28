import { createEilishSignature } from "@ermes/core";

export async function checkShopifyRecoveryEligibility(recoveryId: string, email: string, activityAt: string) {
  const baseUrl = process.env.COMMERCE_COMMAND_URL?.replace(/\/$/, "");
  const secret = process.env.COMMERCE_COMMAND_SHARED_SECRET;
  if (!baseUrl || !secret) throw new Error("Shopify recovery eligibility integration is required");
  const body = JSON.stringify({ recovery_id: recoveryId, email, activity_at: activityAt });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const response = await fetch(`${baseUrl}/internal/shopify/recovery/eligibility`, {
    method: "POST", body, signal: AbortSignal.timeout(15000),
    headers: {
      "content-type": "application/json",
      "x-eilish-timestamp": timestamp,
      "x-eilish-signature": createEilishSignature({ body, secret, timestamp }),
    },
  });
  if (!response.ok) throw new Error(`Shopify recovery eligibility unavailable (${response.status})`);
  const result = await response.json() as { allowed?: boolean; reason?: string };
  if (typeof result.allowed !== "boolean") throw new Error("Invalid Shopify recovery eligibility response");
  return result;
}

export interface PromotionRequest {
  code: string;
  currencyCode?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  expiresAt?: Date;
  minPurchase?: number;
  idempotencyKey: string;
  usageLimit: number;
}

export interface PromotionResult {
  code: string;
  promotionId: string;
}

export async function createCommercePromotion(
  input: PromotionRequest,
): Promise<PromotionResult> {
  const baseUrl = process.env.COMMERCE_COMMAND_URL?.replace(/\/$/, "");
  const secret = process.env.COMMERCE_COMMAND_SHARED_SECRET;
  if (!baseUrl || !secret) {
    throw new Error("Commerce command integration is required for discount delivery");
  }

  const body = JSON.stringify({
    code: input.code,
    currency_code: input.currencyCode,
    discount_type: input.discountType,
    discount_value: input.discountValue,
    expires_at: input.expiresAt?.toISOString(),
    idempotency_key: input.idempotencyKey,
    min_purchase: input.minPurchase,
    usage_limit: input.usageLimit,
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const response = await fetch(`${baseUrl}/internal/shopify/discounts`, {
    body,
    headers: {
      "content-type": "application/json",
      "x-eilish-signature": createEilishSignature({
        body,
        secret,
        timestamp,
      }),
      "x-eilish-timestamp": timestamp,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Commerce discount API failed: ${response.status} ${await response.text()}`,
    );
  }

  const payload = (await response.json()) as {
    code?: string;
    promotion_id?: string;
  };
  if (!payload.promotion_id) {
    throw new Error("Commerce discount API returned no promotion ID");
  }

  return {
    code: payload.code ?? input.code,
    promotionId: payload.promotion_id,
  };
}
