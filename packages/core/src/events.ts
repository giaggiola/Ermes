import { z } from "zod";

export const commerceEventTypeSchema = z.enum([
  "order.placed",
  "gift_card.issued",
  "order.shipped",
  "order.delivered",
  "order.out_for_delivery",
  "order.delivery_failed",
  "order.returned",
  "cart.abandoned",
  "checkout.abandoned",
  "product.back_in_stock",
  "product.price_drop",
  "product.back-in-stock",
  "product.price-drop",
  "product.cart-price-drop",
  "newsletter.subscribed",
  "customer.inactive",
  "discount.redeemed",
  "referral.invitation_ready",
  "referral.invitation_cancelled",
  "referral.reward_issued",
]);

export type CommerceEventType = z.infer<typeof commerceEventTypeSchema>;

export const commerceEventEnvelopeSchema = z.object({
  context: z.record(z.string(), z.unknown()).optional().default({}),
  eventId: z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  payload: z.record(z.string(), z.unknown()),
  source: z.enum(["shopify", "medusa"]).default("medusa"),
  type: commerceEventTypeSchema,
});

export type CommerceEventEnvelope = z.infer<typeof commerceEventEnvelopeSchema>;

/** Transitional aliases for integrations still using the former names. */
export const medusaEventTypeSchema = commerceEventTypeSchema;
export const medusaEventEnvelopeSchema = commerceEventEnvelopeSchema;
export type MedusaEventType = CommerceEventType;
export type MedusaEventEnvelope = CommerceEventEnvelope;

export const deterministicEventIdPrefixes = [
  "order.placed:",
  "gift_card.issued:",
  "order.shipped:",
  "order.delivered:",
  "order.out_for_delivery:",
  "order.delivery_failed:",
  "order.returned:",
  "cart.abandoned:",
  "checkout.abandoned:",
  "product.back_in_stock:",
  "product.price_drop:",
  "product.back-in-stock:",
  "product.price-drop:",
  "product.cart-price-drop:",
  "newsletter.subscribed:",
  "customer.inactive:",
  "discount.redeemed:",
  "referral.invitation_ready:",
  "referral.invitation_cancelled:",
  "referral.reward_issued:",
] as const;

export type MessageKind = "marketing" | "transactional";

const transactionalEvents = new Set<CommerceEventType>([
  "order.placed",
  "gift_card.issued",
  "order.shipped",
  "order.delivered",
  "order.out_for_delivery",
  "order.delivery_failed",
  "order.returned",
  "referral.reward_issued",
]);

export function getMessageKindForEvent(type: CommerceEventType): MessageKind {
  return transactionalEvents.has(type) ? "transactional" : "marketing";
}

export function toFlowTriggerEvent(type: CommerceEventType): string {
  if (type === "product.back_in_stock") {
    return "product.back-in-stock";
  }

  if (type === "product.price_drop") {
    return "product.price-drop";
  }

  if (type === "discount.redeemed") {
    return "discount.redeemed";
  }

  return type;
}

export function getEventRecipient(envelope: CommerceEventEnvelope): string | undefined {
  const fields = [
    envelope.context.email,
    envelope.context.recipient_email,
    envelope.payload.email,
    envelope.payload.recipient_email,
    envelope.payload.customer_email,
    envelope.payload.subscriber_email,
  ];

  const value = fields.find((field) => typeof field === "string" && field.includes("@"));
  return typeof value === "string" ? value : undefined;
}
