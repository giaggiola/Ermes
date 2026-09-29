import {
  MEDUSA_EMAIL_TEMPLATES,
  type MedusaEmailTemplate,
} from "./email-templates.js";
import type { MessageKind } from "./events.js";
import type { FlowStep } from "./flow-types.js";

export const STANDARD_FLOW_RECIPE_KEYS = [
  "welcome",
  "abandoned-cart",
  "abandoned-checkout",
  "order-confirmation",
  "order-shipped",
  "order-out-for-delivery",
  "order-delivered",
  "order-delivery-failed",
  "order-returned",
  "gift-card-issued",
  "back-in-stock",
  "price-drop",
  "cart-item-price-drop",
  "post-delivery-follow-up",
  "referral-invitation",
  "referral-reward",
  "win-back-30-days",
] as const;

export type StandardFlowRecipeKey = (typeof STANDARD_FLOW_RECIPE_KEYS)[number];

export type StandardFlowRecipe = {
  description: string;
  flowId: string;
  key: StandardFlowRecipeKey;
  messageKind: MessageKind;
  name: string;
  reentry:
    | { mode: "always" }
    | { mode: "never" }
    | {
        duration: number;
        mode: "after_duration";
        unit: "hours" | "days";
      };
  steps: FlowStep[];
  tags: string[];
  templates: MedusaEmailTemplate[];
  triggerEvent: string;
};

function disabledEmail(
  stepId: string,
  name: string,
  templateId: string,
  options: {
    skipIfEventTypesSinceStart?: string[];
    orderScopedEventFilters?: boolean;
    smartSendingHours?: number;
  } = {},
): FlowStep {
  return {
    name,
    ...(options.skipIfEventTypesSinceStart
      ? {
          skip_if_event_types_since_start: options.skipIfEventTypesSinceStart,
        }
      : {}),
    ...(options.orderScopedEventFilters
      ? { skip_if_event_types_since_start_order_scoped: true }
      : {}),
    ...(options.smartSendingHours
      ? {
          skip_recently_emailed: true,
          skip_recently_emailed_hours: options.smartSendingHours,
        }
      : {}),
    step_id: stepId,
    step_status: "disabled",
    template_id: templateId,
    type: "email",
  };
}

function emailRecipe(input: {
  description: string;
  key: StandardFlowRecipeKey;
  messageKind: MessageKind;
  name: string;
  reentry: StandardFlowRecipe["reentry"];
  step?: Parameters<typeof disabledEmail>[3];
  tags: string[];
  template: MedusaEmailTemplate;
  triggerEvent: string;
}): StandardFlowRecipe {
  const { step, template, ...recipe } = input;
  return {
    ...recipe,
    flowId: `flow_medusa_${input.key.replaceAll("-", "_")}_v2`,
    steps: [
      disabledEmail(`${input.key}-email`, input.name, input.template.id, step),
    ],
    templates: [template],
  };
}

export const STANDARD_FLOW_RECIPES: StandardFlowRecipe[] = [
  {
    description:
      "Welcome a profile after their first newsletter subscription with a unique Shopify discount.",
    flowId: "flow_medusa_welcome_v2",
    key: "welcome",
    messageKind: "marketing",
    name: "Newsletter Welcome",
    reentry: { mode: "never" },
    steps: [
      {
        code_prefix: "WELCOME",
        discount_type: "percentage",
        discount_value: 15,
        expires_in_days: 14,
        step_id: "welcome-discount",
        type: "discount",
        usage_limit: 1,
      },
      disabledEmail(
        "welcome-email",
        "Newsletter Welcome",
        MEDUSA_EMAIL_TEMPLATES.welcome.id,
      ),
    ],
    tags: ["starter", "medusa", "welcome"],
    templates: [MEDUSA_EMAIL_TEMPLATES.welcome],
    triggerEvent: "newsletter.subscribed",
  },
  emailRecipe({
    description:
      "Bring a known shopper back to a cart with live product imagery, variants, quantities, and prices.",
    key: "abandoned-cart",
    messageKind: "marketing",
    name: "Abandoned Cart",
    reentry: { duration: 7, mode: "after_duration", unit: "days" },
    step: {
      skipIfEventTypesSinceStart: ["checkout.abandoned", "order.placed"],
      smartSendingHours: 16,
    },
    tags: ["starter", "medusa", "abandonment", "cart"],
    template: MEDUSA_EMAIL_TEMPLATES.abandonedCart,
    triggerEvent: "cart.abandoned",
  }),
  emailRecipe({
    description:
      "Return a shopper to checkout with the exact product selection captured by commerce.",
    key: "abandoned-checkout",
    messageKind: "marketing",
    name: "Abandoned Checkout",
    reentry: { duration: 7, mode: "after_duration", unit: "days" },
    step: {
      skipIfEventTypesSinceStart: ["order.placed"],
      smartSendingHours: 16,
    },
    tags: ["starter", "medusa", "abandonment", "checkout"],
    template: MEDUSA_EMAIL_TEMPLATES.abandonedCheckout,
    triggerEvent: "checkout.abandoned",
  }),
  emailRecipe({
    description:
      "Confirm an order immediately with Shopify line items, product assets, totals, and status link.",
    key: "order-confirmation",
    messageKind: "transactional",
    name: "Order Confirmation",
    reentry: { mode: "always" },
    tags: ["starter", "medusa", "transactional", "order"],
    template: MEDUSA_EMAIL_TEMPLATES.orderConfirmation,
    triggerEvent: "order.placed",
  }),
  emailRecipe({
    description:
      "Tell a customer that their order has shipped and provide carrier tracking details.",
    key: "order-shipped",
    messageKind: "transactional",
    name: "Order Shipped",
    reentry: { mode: "always" },
    tags: ["starter", "medusa", "transactional", "fulfillment"],
    template: MEDUSA_EMAIL_TEMPLATES.orderShipped,
    triggerEvent: "order.shipped",
  }),
  emailRecipe({
    description:
      "Send a concise delivery-day update with the live Shopify tracking link.",
    key: "order-out-for-delivery",
    messageKind: "transactional",
    name: "Out for Delivery",
    reentry: { mode: "always" },
    tags: ["starter", "medusa", "transactional", "fulfillment"],
    template: MEDUSA_EMAIL_TEMPLATES.outForDelivery,
    triggerEvent: "order.out_for_delivery",
  }),
  emailRecipe({
    description:
      "Confirm delivery and show the customer the Shopify products that arrived.",
    key: "order-delivered",
    messageKind: "transactional",
    name: "Order Delivered",
    reentry: { mode: "always" },
    tags: ["starter", "medusa", "transactional", "fulfillment"],
    template: MEDUSA_EMAIL_TEMPLATES.orderDelivered,
    triggerEvent: "order.delivered",
  }),
  emailRecipe({
    description:
      "Explain a failed delivery attempt and direct the customer to current tracking instructions.",
    key: "order-delivery-failed",
    messageKind: "transactional",
    name: "Delivery Failed",
    reentry: { mode: "always" },
    tags: ["starter", "medusa", "transactional", "fulfillment"],
    template: MEDUSA_EMAIL_TEMPLATES.deliveryFailed,
    triggerEvent: "order.delivery_failed",
  }),
  emailRecipe({
    description:
      "Acknowledge that a return has reached the studio and set expectations for review.",
    key: "order-returned",
    messageKind: "transactional",
    name: "Order Returned",
    reentry: { mode: "always" },
    tags: ["starter", "medusa", "transactional", "return"],
    template: MEDUSA_EMAIL_TEMPLATES.orderReturned,
    triggerEvent: "order.returned",
  }),
  emailRecipe({
    description:
      "Deliver a gift card with its Shopify value, code, personal message, and redemption link.",
    key: "gift-card-issued",
    messageKind: "transactional",
    name: "Gift Card Issued",
    reentry: { mode: "always" },
    tags: ["starter", "medusa", "transactional", "gift-card"],
    template: MEDUSA_EMAIL_TEMPLATES.giftCard,
    triggerEvent: "gift_card.issued",
  }),
  emailRecipe({
    description:
      "Notify a product watcher with the current Shopify product image, variant, price, and URL.",
    key: "back-in-stock",
    messageKind: "marketing",
    name: "Back in Stock",
    reentry: { mode: "always" },
    step: { smartSendingHours: 16 },
    tags: ["starter", "medusa", "product", "back-in-stock"],
    template: MEDUSA_EMAIL_TEMPLATES.backInStock,
    triggerEvent: "product.back-in-stock",
  }),
  emailRecipe({
    description:
      "Notify a product watcher when Shopify reports a lower current price.",
    key: "price-drop",
    messageKind: "marketing",
    name: "Price Drop",
    reentry: { mode: "always" },
    step: { smartSendingHours: 16 },
    tags: ["starter", "medusa", "product", "price-drop"],
    template: MEDUSA_EMAIL_TEMPLATES.priceDrop,
    triggerEvent: "product.price-drop",
  }),
  emailRecipe({
    description:
      "Tell a known shopper when an item from their abandoned bag is reduced, using its live Shopify image and prices.",
    key: "cart-item-price-drop",
    messageKind: "marketing",
    name: "Cart Item on Sale",
    reentry: { mode: "always" },
    step: { smartSendingHours: 16 },
    tags: ["starter", "medusa", "abandonment", "product", "price-drop"],
    template: MEDUSA_EMAIL_TEMPLATES.cartPriceDrop,
    triggerEvent: "product.cart-price-drop",
  }),
  {
    description:
      "Follow up after delivery with care guidance, a feedback request, and a one-use thank-you code without repeating item prices.",
    flowId: "flow_medusa_post_delivery_follow_up_v2",
    key: "post-delivery-follow-up",
    messageKind: "marketing",
    name: "Post-delivery Follow-up",
    reentry: { mode: "always" },
    steps: [
      { duration: 3, step_id: "wait-3-days", type: "delay", unit: "days" },
      disabledEmail(
        "post-delivery-care-email",
        "Post-delivery Care",
        MEDUSA_EMAIL_TEMPLATES.postPurchaseThreeDays.id,
        {
          orderScopedEventFilters: true,
          skipIfEventTypesSinceStart: ["order.returned"],
          smartSendingHours: 16,
        },
      ),
      { duration: 4, step_id: "wait-4-more-days", type: "delay", unit: "days" },
      {
        code_prefix: "THANKYOU",
        discount_type: "percentage",
        discount_value: 10,
        expires_in_days: 14,
        step_id: "post-delivery-discount",
        type: "discount",
        usage_limit: 1,
      },
      disabledEmail(
        "post-delivery-feedback-email",
        "Post-delivery Feedback",
        MEDUSA_EMAIL_TEMPLATES.postPurchaseSevenDays.id,
        {
          orderScopedEventFilters: true,
          skipIfEventTypesSinceStart: ["order.returned"],
          smartSendingHours: 16,
        },
      ),
    ],
    tags: ["starter", "medusa", "post-delivery", "feedback", "care"],
    templates: [
      MEDUSA_EMAIL_TEMPLATES.postPurchaseThreeDays,
      MEDUSA_EMAIL_TEMPLATES.postPurchaseSevenDays,
    ],
    triggerEvent: "order.delivered",
  },
  {
    description:
      "Send a restrained private referral invitation three days after an eligible delivery.",
    flowId: "flow_eilish_referral_invitation_v1",
    key: "referral-invitation",
    messageKind: "marketing",
    name: "Private referral invitation",
    reentry: { mode: "always" },
    steps: [
      { duration: 3, step_id: "wait-3-days", type: "delay", unit: "days" },
      disabledEmail(
        "referral-invitation-email",
        "Private referral invitation",
        MEDUSA_EMAIL_TEMPLATES.referralInvitation.id,
        {
          orderScopedEventFilters: true,
          skipIfEventTypesSinceStart: [
            "order.returned",
            "referral.invitation_cancelled",
          ],
          smartSendingHours: 16,
        },
      ),
    ],
    tags: ["starter", "shopify", "referral", "marketing"],
    templates: [MEDUSA_EMAIL_TEMPLATES.referralInvitation],
    triggerEvent: "referral.invitation_ready",
  },
  emailRecipe({
    description:
      "Deliver the advocate's single-use thank-you after a referred order clears review.",
    key: "referral-reward",
    messageKind: "transactional",
    name: "Referral thank-you",
    reentry: { mode: "always" },
    tags: ["starter", "shopify", "referral", "transactional"],
    template: MEDUSA_EMAIL_TEMPLATES.referralReward,
    triggerEvent: "referral.reward_issued",
  }),
  {
    description:
      "Invite an inactive customer back with new-season imagery and a one-use welcome-back code.",
    flowId: "flow_medusa_win_back_30_days_v2",
    key: "win-back-30-days",
    messageKind: "marketing",
    name: "Win-back — 30 days inactive",
    reentry: { duration: 60, mode: "after_duration", unit: "days" },
    steps: [
      {
        code_prefix: "COMEBACK",
        discount_type: "percentage",
        discount_value: 10,
        expires_in_days: 10,
        step_id: "win-back-discount",
        type: "discount",
        usage_limit: 1,
      },
      disabledEmail(
        "win-back-email",
        "Win-back — 30 days inactive",
        MEDUSA_EMAIL_TEMPLATES.winBack.id,
        {
          skipIfEventTypesSinceStart: ["order.placed"],
          smartSendingHours: 16,
        },
      ),
    ],
    tags: ["starter", "medusa", "win-back"],
    templates: [MEDUSA_EMAIL_TEMPLATES.winBack],
    triggerEvent: "customer.inactive",
  },
];

export function selectStandardFlowRecipes(
  keys?: readonly string[],
): StandardFlowRecipe[] {
  if (!keys?.length) {
    return STANDARD_FLOW_RECIPES;
  }

  const requested = new Set(keys);
  const unknown = [...requested].filter(
    (key) => !STANDARD_FLOW_RECIPE_KEYS.includes(key as StandardFlowRecipeKey),
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown standard flow recipe: ${unknown.join(", ")}`);
  }

  return STANDARD_FLOW_RECIPES.filter((recipe) => requested.has(recipe.key));
}
