import { createHash } from "node:crypto";

import {
  MEDUSA_EMAIL_TEMPLATES,
  type MedusaEmailTemplate,
  selectStandardFlowRecipes,
} from "@ermes/core";

import { getMessagingService } from "./service.js";

type EmailTemplateRecord = Record<string, unknown>;

export interface StandardEmailTemplateStore {
  createEmailTemplates(rows: Record<string, unknown>[]): Promise<unknown>;
  listEmailTemplates(): Promise<Record<string, unknown>[]>;
  updateEmailTemplates(input: Record<string, unknown>): Promise<unknown>;
}

const legacyPlaceholderMarker =
  "This is placeholder content. Replace it before enabling and publishing the flow.";

const legacyTemplateUpgrades: ReadonlyArray<{
  id: string;
  template: MedusaEmailTemplate;
}> = [
  {
    id: "tpl_welcome_newsletter_v1",
    template: MEDUSA_EMAIL_TEMPLATES.welcome,
  },
  {
    id: "tpl_placeholder_abandoned_cart_v1",
    template: MEDUSA_EMAIL_TEMPLATES.abandonedCart,
  },
  {
    id: "tpl_placeholder_abandoned_checkout_v1",
    template: MEDUSA_EMAIL_TEMPLATES.abandonedCheckout,
  },
  {
    id: "tpl_placeholder_post_purchase_3_days_v1",
    template: MEDUSA_EMAIL_TEMPLATES.postPurchaseThreeDays,
  },
  {
    id: "tpl_placeholder_post_purchase_7_days_v1",
    template: MEDUSA_EMAIL_TEMPLATES.postPurchaseSevenDays,
  },
  {
    id: "tpl_placeholder_win_back_30_days_v1",
    template: MEDUSA_EMAIL_TEMPLATES.winBack,
  },
];

// Hashes of the last shipped built-in HTML. They let us improve untouched
// Eilish templates in place without overwriting any studio edits.
const previousBuiltInHtmlHashes: Readonly<Record<string, string>> = {
  tpl_placeholder_abandoned_cart_v1:
    "6900636fbad5f8e841fbd968fa3e7eb78690ae1dc61a6be553ea7dad85a7a2bb",
  tpl_placeholder_abandoned_checkout_v1:
    "a17035d3aa9e2a89bec20a2be842f0fd082effc6bc9b7a7e139bec9efd1c8737",
  tpl_placeholder_post_purchase_3_days_v1:
    "bfdd77fef7281b716d46fb57482f6ad7ad44c52f8a603b5fe624302759718a49",
  tpl_placeholder_post_purchase_7_days_v1:
    "df7e293c493530317cfe7eeb3b19ed3d007c46a55546390fa79515cc60f0f943",
  tpl_placeholder_win_back_30_days_v1:
    "aa50015acaffb7940785b9441e7cd9f3b36bb4adfc58371d1b9f08dd066d75a7",
  tpl_welcome_newsletter_v1:
    "f97a58f5fd2a75359ba404c183bd5a9c5f722f0a4187426a47af2350aa0cf539",
  tpl_medusa_delivery_failed_v2:
    "df62337d847e376d837c7282e19d87ea88225e82fec01958d7edf50ecd967467",
  tpl_medusa_gift_card_v2:
    "a96aceecaafae5104743b25eb7012402871dab0eb1213a9ec5426e2c679bd720",
  tpl_medusa_order_delivered_v2:
    "4441c9a1bbe7909759bfa2a97b9921c9dfd86a92045787fb956fb199d184c52b",
  tpl_medusa_order_returned_v2:
    "a8586596b845d59aa1d12265ccef6ec90a496fac39b4a315f6636a9677dc8070",
  tpl_medusa_order_shipped_v2:
    "29d9752e8d78c65752faa51adc13aafc0b5e3bdddb55e662adfebd3609562562",
  tpl_medusa_out_for_delivery_v2:
    "b50bfc3d644ba9bc05def7487505742ace682c29b51c0a293e982a7775c2504e",
  tpl_medusa_post_purchase_3_days_v2:
    "bfdd77fef7281b716d46fb57482f6ad7ad44c52f8a603b5fe624302759718a49",
  tpl_medusa_post_purchase_7_days_v2:
    "df7e293c493530317cfe7eeb3b19ed3d007c46a55546390fa79515cc60f0f943",
  tpl_medusa_welcome_v2:
    "36f16f87f5289f45fd77ab9fef619b186a1c51df5e1b99d352ef61fcc78cc12a",
  tpl_medusa_win_back_30_days_v2:
    "aa50015acaffb7940785b9441e7cd9f3b36bb4adfc58371d1b9f08dd066d75a7",
};

// Hashes of the built-in HTML immediately before global email branding was
// added. Keep these separate from the older upgrade hashes so either shipped
// built-in revision can move forward without touching studio-authored HTML.
const preBrandingBuiltInHtmlHashes: Readonly<Record<string, string>> = {
  tpl_eilish_cart_price_drop_v1:
    "329d656931aa4646b1e8626ecc293a0bc6e818616d645b12b71cb58fb603cf8c",
  tpl_eilish_referral_invitation_v1:
    "0c5c1c55ef0ed94624835bc15fb79b1fecb10f5a48d2892ee0e527bba97c8dee",
  tpl_eilish_referral_reward_v1:
    "aa7b1ed26233e2bf6ec01130797a5d9eeca18ae7ec03f1fa035721f63e3c1ca8",
  tpl_medusa_abandoned_cart_v2:
    "6900636fbad5f8e841fbd968fa3e7eb78690ae1dc61a6be553ea7dad85a7a2bb",
  tpl_medusa_abandoned_checkout_v2:
    "a17035d3aa9e2a89bec20a2be842f0fd082effc6bc9b7a7e139bec9efd1c8737",
  tpl_medusa_back_in_stock_v2:
    "99140e049b11a884580c7302ff82819dd215b0e949081a9a2f8cd71e1d18814d",
  tpl_medusa_delivery_failed_v2:
    "14be754a22ba374204ce209e6a885153a60df85fd3726bbb0ea6d9aa3416315f",
  tpl_medusa_gift_card_v2:
    "b19191b548b7888953d1c881f6225c0cccdd4c23bde724dc6352db0693a3f619",
  tpl_medusa_order_confirmation_v2:
    "c0522b71deb58c3acc67e175a1bf553321689e6535445cf3729d4e0377b9ce21",
  tpl_medusa_order_delivered_v2:
    "aab1097649f507d9e07141f4676dfda7bf89070d476a4d1e3c9d6ab5171e9343",
  tpl_medusa_order_returned_v2:
    "111ebef7727ca0a204a72bc113adce318c930afa2e79eca31f7e5bc1ae6b1603",
  tpl_medusa_order_shipped_v2:
    "89565b07a8b0ed48bd77fb8d45444e5f8ed0f7c6fc56424f573271178e8424e6",
  tpl_medusa_out_for_delivery_v2:
    "f7708aedf112c374589c0807bcd4a7828c9964c2c0f2cd0b1e5c4840048a417f",
  tpl_medusa_post_purchase_3_days_v2:
    "3947da936abb24dd6e3481a4ea6437ed64de98417730cc40ec715c78c3c395b2",
  tpl_medusa_post_purchase_7_days_v2:
    "6e94719715c97da824bf89acdae3cf985c8ef65a335aea9b4c79e4c750b86314",
  tpl_medusa_price_drop_v2:
    "db5682318d13c3701bf8dbfd906c7839809bcc1fafff4e9784f305099080fc99",
  tpl_medusa_welcome_v2:
    "e2f71cc25def737ae987dfdbb36c79a37be2e0a913e09d0ea00fe2ce42433690",
  tpl_medusa_win_back_30_days_v2:
    "c800709226bbab30420cb0e86f16648d96ffbf4a3b8c8d720139106817149652",
};

function isPreviousUntouchedBuiltIn(template: EmailTemplateRecord) {
  const html = template.html_content;
  if (typeof html !== "string") return false;
  const hash = createHash("sha256").update(html).digest("hex");
  const id = String(template.id);
  return (
    hash === previousBuiltInHtmlHashes[id] ||
    hash === preBrandingBuiltInHtmlHashes[id]
  );
}

function isUntouchedLegacyPlaceholder(template: EmailTemplateRecord) {
  const name = typeof template.name === "string" ? template.name : "";
  const subject =
    typeof template.subject === "string" ? template.subject : "";
  const html =
    typeof template.html_content === "string" ? template.html_content : "";
  const text =
    typeof template.text_content === "string" ? template.text_content : "";

  return (
    name.startsWith("Placeholder —") &&
    subject.startsWith("[Placeholder]") &&
    (html.includes(legacyPlaceholderMarker) ||
      text.includes(legacyPlaceholderMarker))
  );
}

function templateDraft(
  template: MedusaEmailTemplate,
  id = template.id,
): Record<string, unknown> {
  return {
    category: template.category,
    html_content: template.htmlContent,
    id,
    name: template.name,
    preview_text: template.previewText,
    subject: template.subject,
    text_content: template.textContent,
    variables: template.variables,
  };
}

/**
 * Reconcile built-in email designs without enabling flows or overwriting edits.
 * Missing templates are inactive drafts. Legacy templates are upgraded in place
 * only while their original placeholder marker is still intact.
 */
export async function ensureStandardEmailTemplates(
  store: StandardEmailTemplateStore = getMessagingService(),
) {
  const existing = await store.listEmailTemplates();
  const byId = new Map(
    existing.map((template) => [String(template.id), template]),
  );
  const definitions = new Map<string, MedusaEmailTemplate>();

  for (const recipe of selectStandardFlowRecipes()) {
    const compatibleRecipe = recipe as unknown as {
      template?: MedusaEmailTemplate;
      templates?: MedusaEmailTemplate[];
    };
    const recipeTemplates =
      compatibleRecipe.templates ??
      (compatibleRecipe.template ? [compatibleRecipe.template] : []);
    for (const template of recipeTemplates) {
      definitions.set(template.id, template);
    }
  }

  const missing = Array.from(definitions.values()).filter(
    (template) => !byId.has(template.id),
  );
  if (missing.length > 0) {
    await store.createEmailTemplates(
      missing.map((template) => ({
        ...templateDraft(template),
        is_active: false,
      })),
    );
  }

  const upgradedLegacyTemplateIds: string[] = [];
  for (const upgrade of legacyTemplateUpgrades) {
    const current = byId.get(upgrade.id);
    if (
      !current ||
      (!isUntouchedLegacyPlaceholder(current) &&
        !isPreviousUntouchedBuiltIn(current))
    ) {
      continue;
    }

    await store.updateEmailTemplates({
      ...templateDraft(upgrade.template, upgrade.id),
      _publish: current.is_active === true,
    });
    upgradedLegacyTemplateIds.push(upgrade.id);
  }

  const updatedStandardTemplateIds: string[] = [];
  for (const template of definitions.values()) {
    const current = byId.get(template.id);
    if (!current || !isPreviousUntouchedBuiltIn(current)) continue;

    await store.updateEmailTemplates({
      ...templateDraft(template),
      _publish: current.is_active === true,
    });
    updatedStandardTemplateIds.push(template.id);
  }

  return {
    created_template_ids: missing.map((template) => template.id),
    updated_standard_template_ids: updatedStandardTemplateIds,
    upgraded_legacy_template_ids: upgradedLegacyTemplateIds,
  };
}
