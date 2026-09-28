import type { MessageKind } from "./events.js";

/**
 * Single source of truth for flow trigger events.
 *
 * The builder UI, the flows-list "friendly label", and the trigger picker all
 * read from this catalog so trigger metadata lives in exactly one place. The
 * `value` of each entry is the canonical `trigger_event` string stored on an
 * `email_flow` row — it must match what the worker dispatches via
 * `toFlowTriggerEvent` and what `MessagingService.getActiveFlowsForEvent`
 * filters on. Keep this list aligned with `commerceEventTypeSchema` in events.ts.
 */

export type TriggerSource =
  | "newsletter"
  | "order"
  | "product"
  | "customer"
  | "referral";

export interface TriggerDefinition {
  /** Canonical `trigger_event` persisted on a flow (matches getActiveFlowsForEvent). */
  value: string;
  /** Friendly label shown in the UI, e.g. "Placed Order". */
  label: string;
  /** One-line description of when the event fires. */
  description: string;
  /** Grouping used by the trigger picker and "Your metrics" view. */
  source: TriggerSource;
  /** Message kind the event maps to (mirrors getMessageKindForEvent). */
  messageKind: MessageKind;
  /** Timed triggers (e.g. abandoned cart) expose a trigger-delay control. */
  timed?: boolean;
  /** Curated entries surfaced on the picker's "Recommended" tab. */
  recommended?: boolean;
}

/** Human-readable headers for each {@link TriggerSource} group. */
export const TRIGGER_SOURCE_LABELS: Record<TriggerSource, string> = {
  newsletter: "Newsletter & Lists",
  order: "Orders",
  product: "Products",
  customer: "Customers",
  referral: "Referrals",
};

export const TRIGGER_CATALOG: TriggerDefinition[] = [
  {
    value: "newsletter.subscribed",
    label: "Subscribed to Newsletter",
    description: "When someone subscribes to the newsletter or is added to the list.",
    source: "newsletter",
    messageKind: "marketing",
    recommended: true,
  },
  {
    value: "order.placed",
    label: "Placed Order",
    description: "When a customer completes an order. Use for thank-yous and post-purchase.",
    source: "order",
    messageKind: "transactional",
    recommended: true,
  },
  {
    value: "cart.abandoned",
    label: "Abandoned Cart",
    description: "When a known shopper leaves a cart before entering checkout details.",
    source: "order",
    messageKind: "marketing",
    timed: true,
    recommended: true,
  },
  {
    value: "checkout.abandoned",
    label: "Abandoned Checkout",
    description: "When a shopper enters checkout details but does not place the order.",
    source: "order",
    messageKind: "marketing",
    timed: true,
    recommended: true,
  },
  {
    value: "order.shipped",
    label: "Order Shipped",
    description: "When an order is marked as shipped.",
    source: "order",
    messageKind: "transactional",
  },
  {
    value: "order.delivered",
    label: "Order Delivered",
    description: "When an order is delivered.",
    source: "order",
    messageKind: "transactional",
  },
  {
    value: "order.out_for_delivery",
    label: "Out for Delivery",
    description: "When an order is marked out for delivery.",
    source: "order",
    messageKind: "transactional",
  },
  {
    value: "order.delivery_failed",
    label: "Delivery Failed",
    description: "When a delivery attempt fails.",
    source: "order",
    messageKind: "transactional",
  },
  {
    value: "order.returned",
    label: "Order Returned",
    description: "When an order is returned.",
    source: "order",
    messageKind: "transactional",
  },
  {
    value: "gift_card.issued",
    label: "Gift Card Issued",
    description: "When a gift card is created with a recipient email.",
    source: "order",
    messageKind: "transactional",
  },
  {
    value: "product.back-in-stock",
    label: "Back in Stock",
    description: "When a watched product is restocked.",
    source: "product",
    messageKind: "marketing",
    recommended: true,
  },
  {
    value: "product.price-drop",
    label: "Price Drop",
    description: "When a watched product's price drops below the saved reference price.",
    source: "product",
    messageKind: "marketing",
  },
  {
    value: "product.cart-price-drop",
    label: "Cart Item on Sale",
    description:
      "When a product left in a known shopper's abandoned cart drops below its captured price.",
    source: "product",
    messageKind: "marketing",
  },
  {
    value: "customer.inactive",
    label: "Customer Inactive",
    description: "When a customer has been inactive for a while. Use for win-back flows.",
    source: "customer",
    messageKind: "marketing",
  },
  {
    value: "referral.invitation_ready",
    label: "Referral Invitation Ready",
    description: "When an eligible delivered Shopify order is ready for a private invitation.",
    source: "referral",
    messageKind: "marketing",
  },
  {
    value: "referral.invitation_cancelled",
    label: "Referral Invitation Cancelled",
    description: "When an invitation must be suppressed after its source order changes.",
    source: "referral",
    messageKind: "marketing",
  },
  {
    value: "referral.reward_issued",
    label: "Referral Reward Issued",
    description: "When a referred order clears review and its advocate reward is ready.",
    source: "referral",
    messageKind: "transactional",
  },
];

const triggerIndex = new Map(TRIGGER_CATALOG.map((trigger) => [trigger.value, trigger]));

/** Look up a trigger definition by its canonical value. */
export function triggerByValue(value: string): TriggerDefinition | undefined {
  return triggerIndex.get(value);
}

/**
 * Friendly label for a trigger value. Falls back to a humanized version of the
 * raw event string so unknown/legacy triggers still render sensibly in lists.
 */
export function triggerLabel(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const known = triggerIndex.get(value);
  if (known) {
    return known.label;
  }

  return value
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Curated triggers for the picker's "Recommended" tab. */
export function recommendedTriggers(): TriggerDefinition[] {
  return TRIGGER_CATALOG.filter((trigger) => trigger.recommended);
}

/** All triggers grouped by {@link TriggerSource}, preserving catalog order. */
export function triggersBySource(): Record<TriggerSource, TriggerDefinition[]> {
  const grouped: Record<TriggerSource, TriggerDefinition[]> = {
    newsletter: [],
    order: [],
    product: [],
    customer: [],
    referral: [],
  };

  for (const trigger of TRIGGER_CATALOG) {
    grouped[trigger.source].push(trigger);
  }

  return grouped;
}
