import { getPool, getMessagingService } from "@ermes/db";
import type { ShopifyClient, Json } from "./client.js";
import { shopifyClient } from "./client.js";
import { cartKey, identityToken, identityId } from "./security.js";
import {
  transaction,
  stableId,
  date,
  emailOf,
  gid,
  acceptEvent,
  connector,
  setCursor,
  type DB,
} from "./store.js";

export const INACTIVITY_MS = 60 * 60_000;
export const MAX_AGE_MS = 7 * 86400_000;
export const CUSTOMER_FIELDS = `id firstName lastName defaultEmailAddress { emailAddress marketingState marketingUpdatedAt } lastOrder { createdAt }`;
export const CHECKOUT_FIELDS = `id createdAt updatedAt completedAt abandonedCheckoutUrl
  customer { ${CUSTOMER_FIELDS} }
  totalPriceSet { shopMoney { amount currencyCode } }
  lineItems(first:100) { pageInfo { hasNextPage } nodes {
    title variantTitle quantity sku product { id onlineStoreUrl } variant { id } image { url altText }
    discountedTotalPriceSet { shopMoney { amount currencyCode } }
    originalUnitPriceSet { shopMoney { amount currencyCode } }
  } }`;
export const RECOVERY_TOPICS = new Set([
  "carts/create",
  "carts/update",
  "checkouts/create",
  "checkouts/update",
  "checkouts/delete",
  "orders/create",
  "orders/paid",
]);

async function candidate(
  db: DB,
  shop: string,
  kind: string,
  key: string,
  now: Date,
) {
  const id = stableId("recovery", shop, kind, key);
  await db.query(
    `INSERT INTO shopify_recovery(id,shop_domain,kind,source_key,cart_key,last_activity_at,next_attempt_at) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT DO NOTHING`,
    [id, shop, kind, key, kind === "cart" ? key : null, now],
  );
  return (
    await db.query("SELECT * FROM shopify_recovery WHERE id=$1 FOR UPDATE", [
      id,
    ])
  ).rows[0] as Json;
}
export async function bindCart(
  db: DB,
  shop: string,
  token: string,
  email: string,
  customerId?: string | null,
) {
  const key = cartKey(shop, token),
    normalized = emailOf(email);
  if (!key || !normalized) return null;
  const row = await candidate(db, shop, "cart", key, new Date());
  if (row.email && row.email !== normalized) return null;
  await db.query(
    "UPDATE shopify_recovery SET email=$2,customer_id=COALESCE($3,customer_id) WHERE id=$1",
    [row.id, normalized, customerId ?? null],
  );
  return identityToken(row.id);
}
export async function handleRecoveryWebhook(
  db: DB,
  shop: string,
  topic: string,
  p: Json,
  received = new Date(),
) {
  if (!RECOVERY_TOPICS.has(topic)) return;
  const key = cartKey(
    shop,
    topic.startsWith("carts/") ? p.token : p.cart_token,
  );
  if (topic.startsWith("carts/")) {
    if (!key) return;
    const row = await candidate(db, shop, "cart", key, received);
    const activity = date(p.updated_at ?? p.created_at, received)!;
    if (
      ["recovered", "checkout"].includes(row.state) ||
      (Object.keys(row.snapshot).length && activity <= row.last_activity_at)
    ) {
      if (
        !["recovered", "checkout"].includes(row.state) &&
        +activity === +row.last_activity_at &&
        !p.line_items?.length
      )
        await db.query(
          "UPDATE shopify_recovery SET state='empty' WHERE id=$1",
          [row.id],
        );
      return;
    }
    const items = Array.isArray(p.line_items) ? p.line_items : [];
    const snapshot = {
      line_items: items
        .slice(0, 100)
        .map((i: Json) =>
          Object.fromEntries(
            [
              "product_id",
              "variant_id",
              "title",
              "variant_title",
              "quantity",
              "price",
              "sku",
            ].map((k) => [k, i[k]]),
          ),
        ),
      currency: p.currency,
      cart_created_at: p.created_at,
      incomplete_items: items.length > 100,
      unsupported_items: items.some(
        (i: Json) =>
          (Array.isArray(i.properties)
            ? i.properties.length
            : Object.keys(i.properties ?? {}).length) ||
          i.selling_plan ||
          i.selling_plan_allocation,
      ),
    };
    await db.query(
      "UPDATE shopify_recovery SET snapshot=$2,last_activity_at=$3,state=$4 WHERE id=$1",
      [
        row.id,
        snapshot,
        new Date(Math.min(+activity, +received)),
        items.length ? "watching" : "empty",
      ],
    );
    return;
  }
  const email = emailOf(p.email || p.contact_email || p.customer?.email);
  const recovered = topic.startsWith("orders/") || Boolean(p.completed_at);
  const state = recovered ? "recovered" : "checkout";
  if (key) {
    const row = await candidate(db, shop, "cart", key, received);
    await db.query(
      "UPDATE shopify_recovery SET state=$2 WHERE id=$1 AND state!='recovered'",
      [row.id, state],
    );
  }
  if (email) {
    const activity = date(
      topic.startsWith("orders/")
        ? p.created_at
        : (p.updated_at ?? p.created_at),
      received,
    )!;
    await db.query(
      "UPDATE shopify_recovery SET state=$3 WHERE shop_domain=$1 AND email=$2 AND state IN ('watching','empty','checkout') AND ($4 OR kind='cart') AND last_activity_at <= $5",
      [shop, email, state, recovered, activity],
    );
  }
  // Checkout deletion must also cancel its precise candidate even when the payload has no email.
  if (topic === "checkouts/delete" && p.id)
    await db.query(
      "UPDATE shopify_recovery SET state='recovered' WHERE shop_domain=$1 AND kind='checkout' AND source_key=$2",
      [shop, gid("AbandonedCheckout", p.id)],
    );
}
export function checkoutSnapshot(node: Json) {
  if (
    !Array.isArray(node.lineItems?.nodes) ||
    !node.lineItems.pageInfo ||
    !node.totalPriceSet?.shopMoney
  )
    throw new Error("Incomplete Shopify checkout response");
  return {
    items: node.lineItems.nodes.map((i: Json) => ({
      title: i.title,
      variant_title: i.variantTitle,
      quantity: i.quantity,
      sku: i.sku,
      product_id: i.product?.id,
      product_url: i.product?.onlineStoreUrl,
      variant_id: i.variant?.id,
      thumbnail: i.image?.url,
      image_alt: i.image?.altText,
      line_price: i.discountedTotalPriceSet?.shopMoney?.amount,
      unit_price: i.originalUnitPriceSet?.shopMoney?.amount,
    })),
    currency: node.totalPriceSet.shopMoney.currencyCode,
    total: node.totalPriceSet.shopMoney.amount,
    checkout_url: node.abandonedCheckoutUrl,
    first_name: node.customer?.firstName,
    checkout_created_at: node.createdAt,
    incomplete_items: node.lineItems.pageInfo.hasNextPage,
  };
}
export async function reconcileCheckouts(
  client: ShopifyClient,
  now = new Date(),
) {
  const shop = client.credentials.shop,
    state = await connector(shop);
  if (!state?.enabled) return;
  const cursor = state.cursors.recovery ?? {};
  const until = date(cursor.until, now)!;
  const since = new Date(
    Math.max(
      +state.started_at,
      +date(cursor.watermark, state.started_at)! - 600_000,
      +until - MAX_AGE_MS,
    ),
  );
  const data = await client.graphql(
    `query ErmesRecoveryCheckouts($query:String!,$after:String) { abandonedCheckouts(first:50,query:$query,after:$after,sortKey:ID) { pageInfo { hasNextPage endCursor } nodes { ${CHECKOUT_FIELDS} } } }`,
    {
      query: `updated_at:>='${since.toISOString()}' updated_at:<='${until.toISOString()}'`,
      after: cursor.after ?? null,
    },
  );
  const result = data.abandonedCheckouts;
  if (
    !Array.isArray(result?.nodes) ||
    !result.pageInfo ||
    (result.pageInfo.hasNextPage &&
      (!result.pageInfo.endCursor ||
        result.pageInfo.endCursor === cursor.after))
  )
    throw new Error("Incomplete Shopify checkout page");
  await transaction(async (db) => {
    for (const node of result.nodes) {
      const activity = date(node.updatedAt);
      if (!activity || activity < state.started_at) continue;
      const row = await candidate(db, shop, "checkout", node.id, activity);
      if (Object.keys(row.snapshot).length && activity < row.last_activity_at)
        continue;
      const snapshot = checkoutSnapshot(node);
      await db.query(
        "UPDATE shopify_recovery SET customer_id=$2,email=$3,last_activity_at=$4,snapshot=$5,state=CASE WHEN state='recovered' OR $6 THEN 'recovered' WHEN $7 THEN 'watching' ELSE 'empty' END WHERE id=$1",
        [
          row.id,
          node.customer?.id ?? null,
          emailOf(node.customer?.defaultEmailAddress?.emailAddress),
          activity,
          snapshot,
          Boolean(node.completedAt),
          snapshot.items.length > 0,
        ],
      );
    }
    await setCursor(
      db,
      shop,
      "recovery",
      result.pageInfo.hasNextPage
        ? {
            ...cursor,
            until: until.toISOString(),
            after: result.pageInfo.endCursor,
          }
        : { watermark: until.toISOString() },
    );
    await db.query(
      "UPDATE shopify_connector SET last_recovery_at=$2 WHERE shop_domain=$1",
      [shop, now],
    );
  });
}
export async function getCustomer(
  client: ShopifyClient,
  customerId?: string | null,
  email?: string | null,
) {
  if (customerId)
    return (
      await client.graphql(
        `query ErmesRecoveryCustomer($id:ID!){customer(id:$id){${CUSTOMER_FIELDS}}}`,
        { id: customerId },
      )
    ).customer;
  if (!email || /["\\\r\n]/.test(email)) return null;
  const data = await client.graphql(
    `query ErmesRecoveryCustomerEmail($q:String!){customers(first:2,query:$q){nodes{${CUSTOMER_FIELDS}}}}`,
    { q: `email:"${email}"` },
  );
  if (!Array.isArray(data.customers?.nodes))
    throw new Error("Incomplete Shopify customer response");
  return (
    data.customers.nodes.find(
      (c: Json) => emailOf(c.defaultEmailAddress?.emailAddress) === email,
    ) ?? null
  );
}
export async function recoveryEligibility(
  client: ShopifyClient,
  row: Json | undefined,
  email: string,
  now = new Date(),
): Promise<Json> {
  const no = (reason: string) => ({ allowed: false, reason });
  if (
    !row ||
    row.shop_domain !== client.credentials.shop ||
    row.email !== email
  )
    return no("Recovery identity does not match");
  if (row.state !== "watching" || +row.last_activity_at < +now - MAX_AGE_MS)
    return no("Cart or checkout is no longer recoverable");
  if (+row.last_activity_at > +now - INACTIVITY_MS)
    return no("Shopper resumed activity");
  let customer: Json | null;
  if (row.kind === "checkout") {
    const data = await client.graphql(
      `query ErmesRecoveryEligibility($id:ID!){node(id:$id){...on AbandonedCheckout{${CHECKOUT_FIELDS}}} abandonmentByAbandonedCheckoutId(abandonedCheckoutId:$id){emailState customerHasNoOrderSinceAbandonment isMostSignificantAbandonment}}`,
      { id: row.source_key },
    );
    const node = data.node,
      abandonment = data.abandonmentByAbandonedCheckoutId;
    // Missing eligibility data fails closed, including partial/lagging API responses.
    if (
      !abandonment ||
      ![null, "NOT_SENT", "SENT", "SCHEDULED"].includes(abandonment.emailState)
    )
      return no("Checkout eligibility is unavailable");
    if (["SENT", "SCHEDULED"].includes(abandonment.emailState))
      return no("Shopify already sent or scheduled recovery");
    if (
      abandonment.customerHasNoOrderSinceAbandonment !== true ||
      abandonment.isMostSignificantAbandonment !== true
    )
      return no("Checkout was superseded or recovered");
    if (
      !node ||
      node.completedAt ||
      !date(node.updatedAt) ||
      +date(node.updatedAt)! !== +row.last_activity_at
    )
      return no("Checkout changed or was completed");
    if (
      node.lineItems?.pageInfo?.hasNextPage !== false ||
      !node.lineItems.nodes?.length
    )
      return no("Checkout contents unavailable");
    customer = node.customer;
  } else {
    if (
      row.snapshot.unsupported_items ||
      row.snapshot.incomplete_items ||
      !row.snapshot.line_items?.length
    )
      return no("Cart cannot be restored completely");
    const since = date(
      row.snapshot.cart_created_at,
      new Date(Math.min(+row.created_at, +row.last_activity_at)),
    )!;
    const progressed = await getPool().query(
      "SELECT id FROM shopify_recovery WHERE shop_domain=$1 AND email=$2 AND kind='checkout' AND last_activity_at >= $3 LIMIT 1",
      [row.shop_domain, email, since],
    );
    if (progressed.rowCount) return no("Shopper progressed to checkout");
    customer = await getCustomer(client, row.customer_id, email);
  }
  const address = customer?.defaultEmailAddress;
  if (
    emailOf(address?.emailAddress) !== email ||
    address?.marketingState !== "SUBSCRIBED"
  )
    return no("Shopify email marketing consent is not subscribed");
  const purchase = date(customer?.lastOrder?.createdAt);
  const started = date(
    row.snapshot.checkout_created_at || row.snapshot.cart_created_at,
    new Date(Math.min(+row.created_at, +row.last_activity_at)),
  )!;
  if (purchase && purchase >= started)
    return no("Customer purchased after starting this cart or checkout");
  const local = (
    await getMessagingService().listEmailSubscribers({ email })
  )[0];
  if (local && !local.subscribed)
    return no("Email marketing is unsubscribed locally");
  const suppressions = await getMessagingService().listMessageSuppressions({
    email,
    active: true,
  });
  if (suppressions.length) return no("Recipient is suppressed");
  return { allowed: true, first_name: customer?.firstName || "there" };
}
export async function checkRecoveryEligibility(
  recoveryId: string,
  email: string,
  activityAt: string,
) {
  const client = await shopifyClient();
  if (!(await connector(client.credentials.shop))?.enabled)
    return { allowed: false, reason: "Shopify syncing is paused" };
  const row = (
    await getPool().query("SELECT * FROM shopify_recovery WHERE id=$1", [
      recoveryId,
    ])
  ).rows[0];
  if (!row || !date(activityAt) || +row.last_activity_at !== +date(activityAt)!)
    return {
      allowed: false,
      reason: "Cart or checkout changed after this flow started",
    };
  const result = await recoveryEligibility(client, row, email.toLowerCase());
  // A webhook may cancel/refresh the cart while the Shopify API requests are in flight.
  const current = (
    await getPool().query(
      "SELECT state,last_activity_at,email FROM shopify_recovery WHERE id=$1",
      [recoveryId],
    )
  ).rows[0];
  if (
    !current ||
    current.state !== "watching" ||
    +current.last_activity_at !== +row.last_activity_at ||
    current.email !== row.email
  )
    return {
      allowed: false,
      reason: "Recovery changed during eligibility check",
    };
  return result;
}
export async function identifyCart(
  client: ShopifyClient,
  body: Json,
  loggedInCustomerId: string | null,
) {
  const shop = client.credentials.shop,
    id = identityId(body.identity_token);
  const previous = id
    ? (
        await getPool().query(
          "SELECT * FROM shopify_recovery WHERE id=$1 AND shop_domain=$2",
          [id, shop],
        )
      ).rows[0]
    : null;
  let email = previous?.email,
    customerId = previous?.customer_id;
  const loginId = /^\d+$/.test(loggedInCustomerId ?? "")
    ? gid("Customer", loggedInCustomerId)
    : null;
  if (body.marketing_allowed !== true) {
    await getPool().query(
      "UPDATE shopify_recovery SET email=NULL,customer_id=NULL WHERE shop_domain=$1 AND kind='cart' AND source_key=$2 AND ((email=$3 AND $3 IS NOT NULL) OR (customer_id=$4 AND $4 IS NOT NULL))",
      [shop, cartKey(shop, body.cart_token), email ?? null, loginId],
    );
    return { identified: false };
  }
  if (loginId) {
    const customer = await getCustomer(client, loginId);
    email =
      customer?.defaultEmailAddress?.marketingState === "SUBSCRIBED"
        ? emailOf(customer.defaultEmailAddress.emailAddress)
        : null;
    customerId = customer?.id;
  }
  const token = email
    ? await transaction((db) =>
        bindCart(db, shop, body.cart_token, email, customerId),
      )
    : null;
  return { identified: Boolean(token), identity_token: token };
}

export async function dispatchRecoveries(
  client: ShopifyClient,
  now = new Date(),
) {
  const { enrichItems, lineItems, money, moneyText } =
    await import("./catalog.js");
  const shop = client.credentials.shop;
  const rows = (
    await getPool().query(
      "SELECT * FROM shopify_recovery WHERE shop_domain=$1 AND state='watching' AND emitted_at IS NULL AND email IS NOT NULL AND last_activity_at BETWEEN $2 AND $3 AND next_attempt_at <= $4 ORDER BY last_activity_at LIMIT 25",
      [shop, new Date(+now - MAX_AGE_MS), new Date(+now - INACTIVITY_MS), now],
    )
  ).rows;
  for (const row of rows) {
    await getPool().query(
      "UPDATE shopify_recovery SET next_attempt_at=$2 WHERE id=$1",
      [row.id, new Date(+now + 15 * 60_000)],
    );
    const eligibility = await recoveryEligibility(client, row, row.email, now);
    if (!eligibility.allowed) continue;
    const payload = { ...row.snapshot, first_name: eligibility.first_name };
    if (row.kind === "cart") {
      const raw = payload.line_items;
      if (
        !raw?.length ||
        !raw.every(
          (i: Json) =>
            gid("ProductVariant", i.variant_id) &&
            Number.isSafeInteger(i.quantity) &&
            i.quantity > 0,
        )
      )
        continue;
      payload.items = lineItems(await enrichItems(client, payload));
      payload.total = moneyText(
        payload.items.reduce(
          (n: bigint, i: Json) => n + money(i.line_price),
          0n,
        ),
      );
      payload.checkout_url = `https://${shop}/cart/${raw.map((i: Json) => `${String(i.variant_id).split("/").at(-1)}:${i.quantity}`).join(",")}`;
      if (!payload.currency)
        payload.currency = (
          await client.graphql("query ErmesCartCurrency{shop{currencyCode}}")
        ).shop.currencyCode;
      delete payload.line_items;
    }
    if (
      payload.incomplete_items ||
      !payload.items?.length ||
      !/^https:\/\//.test(payload.checkout_url ?? "")
    )
      continue;
    const current = (
      await getPool().query("SELECT * FROM shopify_recovery WHERE id=$1", [
        row.id,
      ])
    ).rows[0];
    if (
      !current ||
      current.state !== "watching" ||
      +current.last_activity_at !== +row.last_activity_at ||
      current.email !== row.email
    )
      continue;
    const type = row.kind === "cart" ? "cart.abandoned" : "checkout.abandoned";
    await acceptEvent({
      source: "shopify",
      type,
      eventId: `${type}:shopify:${row.id}`,
      occurredAt: row.last_activity_at.toISOString(),
      context: { email: row.email },
      payload: { ...payload, email: row.email, shopify_recovery_id: row.id },
    });
    await getPool().query(
      "UPDATE shopify_recovery SET emitted_at=$2 WHERE id=$1",
      [row.id, now],
    );
  }
  await getPool().query(
    "UPDATE shopify_recovery SET state='expired',email=NULL,customer_id=NULL,snapshot='{}' WHERE last_activity_at < $1 AND state!='expired'",
    [new Date(+now - MAX_AGE_MS)],
  );
}
