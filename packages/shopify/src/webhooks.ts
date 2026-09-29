import { getPool, getMessagingService } from "@ermes/db";
import {
  type ShopifyClient,
  type Json,
  loadShopifyCredentials,
} from "./client.js";
import { verifyWebhook } from "./security.js";
import {
  transaction,
  stableId,
  connector,
  gid,
  date,
  emailOf,
  acceptEvent,
} from "./store.js";
import { RECOVERY_TOPICS, handleRecoveryWebhook } from "./recovery.js";
import {
  CUSTOMER_SYNC_FIELDS,
  ORDER_FIELDS,
  fetchProduct,
  saveObject,
  syncCustomer,
  syncProduct,
  enrichItems,
  lineItems,
} from "./catalog.js";

export const WEBHOOK_TOPICS = new Set([
  ...RECOVERY_TOPICS,
  "orders/updated",
  "orders/cancelled",
  "refunds/create",
  "fulfillments/create",
  "fulfillments/update",
  "customers/create",
  "customers/update",
  "customers/delete",
  "customers_email_marketing_consent/update",
  "products/create",
  "products/update",
  "products/delete",
  "inventory_levels/update",
  "inventory_levels/connect",
  "inventory_levels/disconnect",
  "app/uninstalled",
]);
export async function receiveWebhook(body: Buffer, headers: Headers) {
  if (body.length > 2 * 1024 * 1024)
    throw new Error("Shopify webhook is too large");
  const credentials = await loadShopifyCredentials();
  if (
    headers.get("x-shopify-shop-domain") !== credentials.shop ||
    !verifyWebhook(
      body,
      headers.get("x-shopify-hmac-sha256") ?? "",
      credentials.clientSecret,
    )
  )
    throw new Error("Invalid Shopify signature");
  const topic = headers.get("x-shopify-topic") ?? "",
    eventId =
      headers.get("x-shopify-event-id") || headers.get("x-shopify-webhook-id");
  if (!eventId || eventId.length > 200)
    throw new Error("Shopify event ID is required");
  if (!WEBHOOK_TOPICS.has(topic)) return { accepted: true, ignored: true };
  const payload = JSON.parse(
    body.toString("utf8"),
    (_key, value, context?: { source?: string }) => {
      // Shopify IDs are 64-bit integers. Node 22 exposes the original token so
      // IDs above Number.MAX_SAFE_INTEGER retain every digit after signature verification.
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        !Number.isSafeInteger(value)
      ) {
        if (!context?.source || !/^-?\d+$/.test(context.source))
          throw new Error("Invalid Shopify numeric payload");
        return context.source;
      }
      return value;
    },
  );
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Invalid Shopify payload");
  const received = new Date(),
    shop = credentials.shop;
  return transaction(async (db) => {
    const id = stableId(shop, eventId, topic);
    // A raw cart token is never retained in the webhook inbox.
    const stored = { ...payload };
    delete stored.token;
    delete stored.cart_token;
    const inserted = await db.query(
      "INSERT INTO shopify_webhook(id,shop_domain,topic,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
      [id, shop, topic, stored],
    );
    if (!inserted.rowCount) return { accepted: true, duplicate: true };
    await db.query(
      "UPDATE shopify_connector SET last_webhook_at=$2 WHERE shop_domain=$1",
      [shop, received],
    );
    // Commit cancellations before acknowledging Shopify; the background worker may be delayed.
    const state = await connector(shop, db);
    const activity = date(payload.updated_at ?? payload.created_at, received)!;
    if (
      (state?.enabled && activity >= state.started_at) ||
      !topic.startsWith("carts/")
    )
      await handleRecoveryWebhook(db, shop, topic, payload, received);
    if (topic === "app/uninstalled") {
      await db.query(
        "UPDATE shopify_connector SET enabled=false WHERE shop_domain=$1",
        [shop],
      );
      await db.query(
        "UPDATE ermes_installation SET shopify_verified_at=NULL WHERE shop_domain=$1",
        [shop],
      );
    }
    return { accepted: true, duplicate: false };
  });
}
export async function processWebhook(client: ShopifyClient, row: Json) {
  const { topic, payload: p } = row,
    shop = client.credentials.shop;
  const id = p.admin_graphql_api_id || p.id || p.customer_id;
  if (
    topic.startsWith("customers/") ||
    topic === "customers_email_marketing_consent/update"
  ) {
    const customerId = gid("Customer", id);
    if (!customerId)
      throw new Error("Shopify customer webhook has no identifier");
    if (topic === "customers/delete") {
      const cached = (
        await getPool().query(
          "SELECT payload FROM shopify_object WHERE shop_domain=$1 AND kind='customer' AND external_id=$2",
          [shop, customerId],
        )
      ).rows[0]?.payload;
      const email = emailOf(
        p.email || cached?.defaultEmailAddress?.emailAddress,
      );
      if (email) await getMessagingService().unsubscribe(email);
      await getPool().query(
        "DELETE FROM shopify_object WHERE shop_domain=$1 AND kind='customer' AND external_id=$2",
        [shop, customerId],
      );
    } else {
      const data = await client.graphql(
        `query ErmesSyncCustomer($id:ID!){customer(id:$id){${CUSTOMER_SYNC_FIELDS}}}`,
        { id: customerId },
      );
      if (data.customer) await syncCustomer(shop, data.customer);
    }
    return;
  }
  let productId = topic.startsWith("products/") ? gid("Product", id) : null;
  if (topic.startsWith("inventory_levels/")) {
    const inventoryId = gid("InventoryItem", p.inventory_item_id);
    if (!inventoryId) return;
    const data = await client.graphql(
      "query ErmesInventoryProduct($id:ID!){inventoryItem(id:$id){variant{product{id}}}}",
      { id: inventoryId },
    );
    productId = data.inventoryItem?.variant?.product?.id;
  }
  if (productId) {
    if (topic === "products/delete")
      await getPool().query(
        "DELETE FROM shopify_object WHERE shop_domain=$1 AND kind='product' AND external_id=$2",
        [shop, productId],
      );
    else {
      const product = await fetchProduct(client, productId);
      if (product) await syncProduct(client, product, true);
    }
    return;
  }
  if (topic.startsWith("orders/")) {
    const orderId = gid("Order", id);
    if (orderId) {
      const data = await client.graphql(
        `query ErmesSyncOrder($id:ID!){order(id:$id){${ORDER_FIELDS}}}`,
        { id: orderId },
      );
      if (data.order) await saveObject(shop, "order", data.order);
    }
  }
  if (topic.startsWith("fulfillments/") && p.order_id) {
    const orderId = gid("Order", p.order_id);
    const order = (
      await client.graphql(
        `query ErmesFulfillmentOrder($id:ID!){order(id:$id){${ORDER_FIELDS} statusPageUrl customer { firstName lastName }}}`,
        { id: orderId },
      )
    ).order;
    if (order) {
      p.email ||= order.email;
      p.currency ||= order.currencyCode;
      p.order_number ||= order.name;
      p.order_status_url ||= order.statusPageUrl;
      p.cancelled_at ||= order.cancelledAt;
      p.customer ||= {
        first_name: order.customer?.firstName,
        last_name: order.customer?.lastName,
      };
    }
  }
  const shipping: Record<string, string> = {
    delivered: "order.delivered",
    out_for_delivery: "order.out_for_delivery",
    failure: "order.delivery_failed",
    returned_to_sender: "order.returned",
  };
  const type =
    topic === "orders/create"
      ? "order.placed"
      : topic.startsWith("fulfillments/")
        ? shipping[String(p.shipment_status)] ||
          (topic === "fulfillments/create" ? "order.shipped" : null)
        : null;
  const email = emailOf(
    p.email || p.contact_email || p.customer?.email || p.destination?.email,
  );
  const occurred = date(p.updated_at || p.created_at, row.received_at)!;
  const state = await connector(shop);
  // Backfills/replayed pre-install webhooks update cached data but never start flows.
  if (
    !type ||
    !email ||
    !state?.enabled ||
    occurred < state.started_at ||
    p.test ||
    p.cancelled_at
  )
    return;
  const enriched = await enrichItems(client, p);
  await acceptEvent({
    source: "shopify",
    type: type as "order.placed",
    eventId: `${type}:shopify:${stableId(shop, String(p.id), type)}`,
    occurredAt: occurred.toISOString(),
    context: {
      email,
      first_name: p.customer?.first_name ?? p.destination?.first_name ?? "",
    },
    payload: {
      email,
      customer_email: email,
      order_id: gid(
        "Order",
        topic.startsWith("fulfillments/") ? p.order_id : id,
      ),
      order_number: p.order_number ?? p.name,
      order_name: p.name,
      currency: p.presentment_currency ?? p.currency,
      total: p.current_total_price ?? p.total_price,
      subtotal: p.subtotal_price,
      discount_total: p.total_discounts,
      items: lineItems(enriched),
      order_status_url: p.order_status_url,
      tracking_number: p.tracking_number ?? p.tracking_numbers?.[0],
      tracking_url: p.tracking_url ?? p.tracking_urls?.[0],
      tracking_company: p.tracking_company,
    },
  });
}
export async function drainWebhooks(client: ShopifyClient) {
  const shop = client.credentials.shop;
  // The tick owns a per-shop advisory lock. No second worker can process these rows.
  const rows = (
    await getPool().query(
      "SELECT * FROM shopify_webhook WHERE shop_domain=$1 AND state='pending' AND next_attempt_at <= now() ORDER BY received_at LIMIT 50",
      [shop],
    )
  ).rows;
  for (const row of rows) {
    try {
      await processWebhook(client, row);
      await getPool().query(
        "UPDATE shopify_webhook SET state='processed',processed_at=now(),payload='{}',last_error=NULL WHERE id=$1",
        [row.id],
      );
    } catch {
      await getPool().query(
        "UPDATE shopify_webhook SET attempts=attempts+1,next_attempt_at=now()+least(3600,power(2,least(attempts,10))*30)*interval '1 second',last_error='Shopify event processing failed; check connection permissions' WHERE id=$1",
        [row.id],
      );
    }
  }
  // Keep opaque processed IDs for deduplication; remove customer payloads after seven days.
  await getPool().query(
    "UPDATE shopify_webhook SET payload='{}',state='expired' WHERE shop_domain=$1 AND state='pending' AND received_at < now()-interval '7 days'",
    [shop],
  );
}
