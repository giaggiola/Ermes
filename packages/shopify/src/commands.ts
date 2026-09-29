import { z } from "zod";
import { getPool } from "@ermes/db";
import { shopifyClient, type ShopifyClient, type Json } from "./client.js";
import {
  connector,
  requireConnector,
  stableId,
  emailOf,
  setCursor,
} from "./store.js";
import { getCustomer } from "./recovery.js";

const promotionSchema = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9_-]{3,100}$/),
    currencyCode: z.string().length(3).optional(),
    discountType: z.enum(["percentage", "fixed"]),
    discountValue: z.number().positive().finite(),
    expiresAt: z.date().optional(),
    minPurchase: z.number().nonnegative().finite().optional(),
    idempotencyKey: z.string().min(1).max(250),
    usageLimit: z.number().int().positive().max(1000000),
  })
  .strict()
  .refine(
    (v) => v.discountType !== "percentage" || v.discountValue <= 100,
    "Percentage exceeds 100",
  );
export type PromotionInput = z.infer<typeof promotionSchema>;
export async function createShopifyPromotion(
  input: PromotionInput,
  injectedClient?: ShopifyClient,
) {
  const value = promotionSchema.parse(input),
    client = injectedClient ?? (await shopifyClient()),
    shop = client.credentials.shop;
  await requireConnector(shop);
  const canonical = {
    code: value.code.toUpperCase(),
    currency: value.currencyCode ?? null,
    type: value.discountType,
    value: value.discountValue,
    endsAt: value.expiresAt?.toISOString() ?? null,
    minPurchase: value.minPurchase ?? null,
    usageLimit: value.usageLimit,
  };
  const id = stableId(shop, "discount", value.idempotencyKey),
    hash = stableId(JSON.stringify(canonical));
  const db = await getPool().connect();
  try {
    await db.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [id]);
    await db.query(
      "INSERT INTO shopify_command(id,shop_domain,kind,payload) VALUES($1,$2,'discount',$3) ON CONFLICT DO NOTHING",
      [id, shop, { ...canonical, request_hash: hash }],
    );
    const row = (
      await db.query("SELECT * FROM shopify_command WHERE id=$1", [id])
    ).rows[0];
    if (row.payload.request_hash !== hash)
      throw new Error(
        "Discount idempotency key was reused with different settings",
      );
    if (row.result) return row.result as { code: string; promotionId: string };
    if (value.currencyCode) {
      const currency = (
        await client.graphql("query ErmesDiscountCurrency{shop{currencyCode}}")
      ).shop.currencyCode;
      if (currency !== value.currencyCode)
        throw new Error(
          "Discount currency must match the Shopify store currency",
        );
    }
    const existing = await client.graphql(
      `query ErmesFindDiscount($query:String!){codeDiscountNodes(first:10,query:$query){nodes{id codeDiscount{...on DiscountCodeBasic{title codes(first:10){nodes{code}}}}}}}`,
      { query: `code:${canonical.code}` },
    );
    const found = existing.codeDiscountNodes?.nodes?.find((n: Json) =>
      n.codeDiscount?.codes?.nodes?.some(
        (c: Json) => c.code.toUpperCase() === canonical.code,
      ),
    );
    let promotionId: string | undefined = found?.id;
    if (
      found &&
      (!row.attempts ||
        found.codeDiscount.title !==
          `Ermes · ${canonical.code} · ${id.slice(0, 12)}`)
    )
      throw new Error("Discount code already exists in Shopify");
    if (!promotionId) {
      await db.query(
        "UPDATE shopify_command SET attempts=attempts+1 WHERE id=$1",
        [id],
      );
      const discount = {
        title: `Ermes · ${canonical.code} · ${id.slice(0, 12)}`,
        code: canonical.code,
        context: { all: "ALL" },
        appliesOncePerCustomer: true,
        usageLimit: value.usageLimit,
        startsAt: new Date().toISOString(),
        ...(value.expiresAt ? { endsAt: value.expiresAt.toISOString() } : {}),
        ...(value.minPurchase !== undefined
          ? {
              minimumRequirement: {
                subtotal: {
                  greaterThanOrEqualToSubtotal: String(value.minPurchase),
                },
              },
            }
          : {}),
        customerGets: {
          items: { all: true },
          value:
            value.discountType === "percentage"
              ? { percentage: value.discountValue / 100 }
              : {
                  discountAmount: {
                    amount: String(value.discountValue),
                    appliesOnEachItem: false,
                  },
                },
        },
      };
      const data = await client.graphql(
        `mutation ErmesCreateDiscount($input:DiscountCodeBasicInput!){discountCodeBasicCreate(basicCodeDiscount:$input){codeDiscountNode{id}userErrors{field message}}}`,
        { input: discount },
      );
      const result = data.discountCodeBasicCreate;
      if (result?.userErrors?.length || !result?.codeDiscountNode?.id)
        throw new Error(
          "Shopify rejected the discount. Check its settings and write_discounts access.",
        );
      promotionId = result.codeDiscountNode.id;
    }
    const result = { code: canonical.code, promotionId: promotionId! };
    await db.query(
      "UPDATE shopify_command SET state='completed',result=$2,last_error=NULL WHERE id=$1",
      [id, result],
    );
    return result;
  } finally {
    await db.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [id]);
    db.release();
  }
}
export async function collectConsentChanges(client: ShopifyClient) {
  const shop = client.credentials.shop,
    state = await connector(shop);
  if (!state?.enabled) return;
  const cursor = state.cursors.consent;
  const rows = (
    await getPool().query(
      "SELECT * FROM email_consent_event WHERE source NOT LIKE 'shopify%' AND (created_at,id::text) > ($1::timestamptz,$2) ORDER BY created_at,id::text LIMIT 100",
      [cursor?.at ?? state.started_at, cursor?.id ?? ""],
    )
  ).rows;
  for (const row of rows) {
    await getPool().query(
      "INSERT INTO shopify_command(id,shop_domain,kind,payload) VALUES($1,$2,'consent',$3) ON CONFLICT DO NOTHING",
      [
        stableId(shop, "consent", row.id),
        shop,
        {
          email: row.email,
          action: row.action,
          occurredAt: row.occurred_at.toISOString(),
        },
      ],
    );
    await setCursor(getPool(), shop, "consent", {
      at: row.created_at.toISOString(),
      id: row.id,
    });
  }
}
export async function syncConsent(client: ShopifyClient, p: Json) {
  const email = emailOf(p.email);
  if (!email) return;
  const local = (
    await getPool().query(
      "SELECT subscribed,deleted_at,first_name FROM email_subscriber WHERE email=$1 ORDER BY deleted_at NULLS FIRST LIMIT 1",
      [email],
    )
  ).rows[0];
  const latest = (
    await getPool().query(
      "SELECT action,occurred_at FROM email_consent_event WHERE email=$1 ORDER BY occurred_at DESC,created_at DESC LIMIT 1",
      [email],
    )
  ).rows[0];
  if (latest && +latest.occurred_at > +new Date(p.occurredAt)) return;
  const subscribed = Boolean(
    local?.subscribed && !local.deleted_at && p.action === "subscribed",
  );
  // A queued subscribe can never override a later local unsubscribe/deletion.
  const customer = await getCustomer(client, null, email);
  if (!customer && !subscribed) return;
  // A newer Shopify choice wins over an old command that was waiting for a retry.
  if (
    customer?.defaultEmailAddress?.marketingUpdatedAt &&
    +new Date(customer.defaultEmailAddress.marketingUpdatedAt) >
      +new Date(p.occurredAt)
  )
    return;
  const consent = {
    marketingState: subscribed ? "SUBSCRIBED" : "UNSUBSCRIBED",
    marketingOptInLevel: "SINGLE_OPT_IN",
    consentUpdatedAt: p.occurredAt,
  };
  const data = customer
    ? await client.graphql(
        `mutation ErmesUpdateConsent($input:CustomerEmailMarketingConsentUpdateInput!){customerEmailMarketingConsentUpdate(input:$input){customer{id}userErrors{field message}}}`,
        { input: { customerId: customer.id, emailMarketingConsent: consent } },
      )
    : await client.graphql(
        `mutation ErmesCreateSubscriber($input:CustomerInput!){customerCreate(input:$input){customer{id}userErrors{field message}}}`,
        {
          input: {
            email,
            firstName: local?.first_name || undefined,
            emailMarketingConsent: consent,
          },
        },
      );
  const result =
    data.customerEmailMarketingConsentUpdate ?? data.customerCreate;
  if (!result?.customer?.id || result.userErrors?.length)
    throw new Error(
      "Shopify consent update failed. Check write_customers permission.",
    );
}
export async function drainConsentCommands(client: ShopifyClient) {
  const rows = (
    await getPool().query(
      "SELECT * FROM shopify_command WHERE shop_domain=$1 AND kind='consent' AND state='pending' AND next_attempt_at<=now() ORDER BY created_at LIMIT 30",
      [client.credentials.shop],
    )
  ).rows;
  for (const row of rows) {
    try {
      await syncConsent(client, row.payload);
      await getPool().query(
        "UPDATE shopify_command SET state='completed',payload='{}',last_error=NULL WHERE id=$1",
        [row.id],
      );
    } catch {
      await getPool().query(
        "UPDATE shopify_command SET attempts=attempts+1,next_attempt_at=now()+least(3600,power(2,least(attempts,10))*30)*interval '1 second',last_error='Shopify consent update failed; check permissions' WHERE id=$1",
        [row.id],
      );
    }
  }
}
