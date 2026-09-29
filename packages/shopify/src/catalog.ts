import { getPool, getMessagingService } from "@ermes/db";
import type { ShopifyClient, Json } from "./client.js";
import {
  transaction,
  stableId,
  date,
  emailOf,
  gid,
  acceptEvent,
  persistEvent,
  connector,
  setCursor,
  type DB,
} from "./store.js";

export const PRODUCT_FIELDS = `id title handle status updatedAt onlineStoreUrl featuredMedia { preview { image { url altText } } }`;
export const VARIANT_FIELDS = `id title sku price availableForSale inventoryQuantity inventoryItem { id } media(first:1) { nodes { preview { image { url altText } } } }`;
export const CUSTOMER_SYNC_FIELDS = `id firstName lastName updatedAt defaultEmailAddress { emailAddress marketingState marketingUpdatedAt }`;
export const ORDER_FIELDS = `id name email createdAt updatedAt cancelledAt currencyCode customer { id } currentTotalPriceSet { shopMoney { amount currencyCode } }`;

export function money(value: unknown): bigint {
  const match = String(value ?? "0").match(/^(\d{1,18})(?:\.(\d{1,6}))?$/);
  if (!match) throw new Error("Invalid Shopify money value");
  return (
    BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"))
  );
}
export function moneyText(value: bigint) {
  return `${value / 1_000_000n}.${String(value % 1_000_000n).padStart(6, "0")}`
    .replace(/0+$/, " ")
    .trim()
    .replace(/\.$/, "");
}
export function lineItems(payload: Json) {
  return (Array.isArray(payload.line_items) ? payload.line_items : []).map(
    (i: Json) => {
      const quantity = Number(i.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1)
        throw new Error("Invalid Shopify item quantity");
      const unit = i.price_set?.presentment_money?.amount ?? i.price ?? "0";
      const total =
        money(unit) * BigInt(quantity) - money(i.total_discount ?? "0");
      return {
        title: i.product_title ?? i.title,
        variant_title: i.variant_title,
        quantity,
        sku: i.sku,
        product_id: gid("Product", i.product_id),
        variant_id: gid("ProductVariant", i.variant_id),
        product_url: i.product_url,
        thumbnail: i.thumbnail,
        image_alt: i.image_alt,
        unit_price: String(unit),
        line_price: moneyText(total < 0n ? 0n : total),
      };
    },
  );
}
export async function enrichItems(client: ShopifyClient, payload: Json) {
  const ids = [
    ...new Set<string>(
      (payload.line_items ?? [])
        .map((i: Json) => gid("ProductVariant", i.variant_id))
        .filter(Boolean),
    ),
  ];
  const nodes = new Map<string, Json>();
  for (let start = 0; start < ids.length; start += 100) {
    const data = await client.graphql(
      `query ErmesLineItems($ids:[ID!]!){nodes(ids:$ids){...on ProductVariant{${VARIANT_FIELDS} product { ${PRODUCT_FIELDS} }}}}`,
      { ids: ids.slice(start, start + 100) },
    );
    if (!Array.isArray(data.nodes))
      throw new Error("Shopify returned incomplete product metadata");
    for (const node of data.nodes) if (node) nodes.set(node.id, node);
  }
  return {
    ...payload,
    line_items: (payload.line_items ?? []).map((i: Json) => {
      const variant = nodes.get(gid("ProductVariant", i.variant_id) ?? "");
      const image =
        variant?.media?.nodes?.[0]?.preview?.image ??
        variant?.product.featuredMedia?.preview?.image;
      return {
        ...i,
        product_title: variant?.product.title ?? i.title,
        product_url: variant?.product.onlineStoreUrl,
        thumbnail: image?.url,
        image_alt: image?.altText,
      };
    }),
  };
}
export async function fetchProduct(client: ShopifyClient, id: string) {
  const product = (
    await client.graphql(
      `query ErmesProduct($id:ID!){product(id:$id){${PRODUCT_FIELDS}}}`,
      { id },
    )
  ).product;
  if (!product) return null;
  const variants: Json[] = [];
  let after: string | null = null;
  do {
    const data: Json = await client.graphql(
      `query ErmesProductVariants($id:ID!,$after:String){product(id:$id){variants(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{${VARIANT_FIELDS}}}}}`,
      { id, after },
    );
    const page = data.product?.variants;
    if (
      !Array.isArray(page?.nodes) ||
      !page.pageInfo ||
      (page.pageInfo.hasNextPage &&
        (!page.pageInfo.endCursor || page.pageInfo.endCursor === after))
    )
      throw new Error("Incomplete Shopify variant page");
    variants.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return { ...product, variants };
}
export async function saveObject(
  shop: string,
  kind: string,
  object: Json,
  changed?: (db: DB, previous: Json | undefined) => Promise<void>,
) {
  const updated = date(object.updatedAt);
  if (!object.id || !updated)
    throw new Error("Shopify object lacks its ID or update timestamp");
  return transaction(async (db) => {
    const id = stableId(shop, kind, String(object.id));
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      id,
    ]);
    const before = (
      await db.query(
        "SELECT payload,source_updated_at FROM shopify_object WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (before && before.source_updated_at > updated)
      return { changed: false, previous: before.payload };
    if (changed && JSON.stringify(before?.payload) !== JSON.stringify(object))
      await changed(db, before?.payload);
    await db.query(
      `INSERT INTO shopify_object(id,shop_domain,kind,external_id,payload,source_updated_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,source_updated_at=EXCLUDED.source_updated_at,updated_at=now()`,
      [id, shop, kind, String(object.id), object, updated],
    );
    return {
      changed: JSON.stringify(before?.payload) !== JSON.stringify(object),
      previous: before?.payload as Json | undefined,
    };
  });
}
export async function syncCustomer(shop: string, customer: Json) {
  const saved = await saveObject(shop, "customer", customer);
  if (!saved.changed && saved.previous) customer = saved.previous;
  const email = emailOf(customer.defaultEmailAddress?.emailAddress);
  if (!email) return;
  const optedIn = customer.defaultEmailAddress?.marketingState === "SUBSCRIBED";
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `shopify-subscriber:${email}`,
    ]);
    // Respect deleted records and all existing local opt-outs. Imports never call
    // subscribeWithStatus, clear suppressions, or trigger newsletter flows.
    const existing = (
      await db.query(
        "SELECT * FROM email_subscriber WHERE email=$1 ORDER BY deleted_at NULLS FIRST LIMIT 1",
        [email],
      )
    ).rows[0];
    if (existing?.deleted_at) return;
    const properties = { shopify_customer_id: customer.id, shopify_shop: shop };
    if (!existing) {
      const inserted = await db.query(
        `INSERT INTO email_subscriber(id,email,first_name,last_name,properties,subscribed,subscribed_at,subscription_source) VALUES($1,$2,$3,$4,$5,$6,$7,'shopify-import') ON CONFLICT DO NOTHING RETURNING id`,
        [
          `emsub_${stableId(shop, email).slice(0, 32)}`,
          email,
          customer.firstName ?? null,
          customer.lastName ?? null,
          properties,
          optedIn,
          optedIn ? new Date(customer.updatedAt) : null,
        ],
      );
      if (inserted.rowCount)
        await db.query(
          "INSERT INTO email_consent_event(email,action,source,occurred_at,metadata) VALUES($1,$2,'shopify-import',$3,$4)",
          [
            email,
            optedIn ? "subscribed" : "unsubscribed",
            new Date(customer.updatedAt),
            { customer_id: customer.id },
          ],
        );
    } else {
      await db.query(
        "UPDATE email_subscriber SET first_name=COALESCE($2,first_name),last_name=COALESCE($3,last_name),properties=COALESCE(properties,'{}') || $4::jsonb,subscribed=subscribed AND $5,unsubscribed_at=CASE WHEN subscribed AND NOT $5 THEN now() ELSE unsubscribed_at END,updated_at=now() WHERE id=$1",
        [
          existing.id,
          customer.firstName ?? null,
          customer.lastName ?? null,
          properties,
          optedIn,
        ],
      );
      if (existing.subscribed && !optedIn)
        await db.query(
          "INSERT INTO email_consent_event(email,action,source,metadata) VALUES($1,'unsubscribed','shopify-sync',$2)",
          [email, { customer_id: customer.id }],
        );
    }
  });
  if (!optedIn)
    await getMessagingService().recordSuppression(
      email,
      "unsubscribe",
      "shopify-sync",
    );
}
export async function syncProduct(
  client: ShopifyClient,
  product: Json,
  live = false,
) {
  const shop = client.credentials.shop;
  const currency = live
    ? (await client.graphql("query ErmesCurrency {shop{currencyCode}}")).shop
        .currencyCode
    : null;
  await saveObject(shop, "product", product, async (db, previous) => {
    if (!live || !previous || product.status !== "ACTIVE") return;
    for (const variant of product.variants) {
      const old = previous.variants?.find((v: Json) => v.id === variant.id);
      if (!old) continue;
      const events: ("product.back_in_stock" | "product.price_drop")[] = [];
      if (!old.availableForSale && variant.availableForSale)
        events.push("product.back_in_stock" as const);
      if (money(variant.price) < money(old.price))
        events.push("product.price_drop" as const);
      for (const type of events)
        await persistEvent(db, {
          source: "shopify",
          type,
          eventId: `${type}:shopify:${stableId(shop, variant.id, product.updatedAt, type, JSON.stringify(old), JSON.stringify(variant))}`,
          occurredAt: product.updatedAt,
          context: {},
          payload: {
            product_id: product.id,
            variant_id: variant.id,
            product_handle: product.handle,
            product_title: product.title,
            product_url: product.onlineStoreUrl,
            variant_sku: variant.sku,
            variant_title: variant.title,
            old_price: old.price,
            current_price: variant.price,
            currency,
            product_image_url:
              variant.media?.nodes?.[0]?.preview?.image?.url ??
              product.featuredMedia?.preview?.image?.url,
          },
        });
    }
  });
}
export async function syncResourcePage(
  client: ShopifyClient,
  kind: "customers" | "products" | "orders",
  now = new Date(),
) {
  const shop = client.credentials.shop,
    state = await connector(shop);
  if (!state?.enabled) return;
  const cursor = state.cursors[kind] ?? {};
  if (cursor.completedAt && +now - +new Date(cursor.completedAt) < 15 * 60_000)
    return;
  const until = date(cursor.until, now)!;
  const since = date(cursor.watermark);
  const parts = [`updated_at:<='${until.toISOString()}'`];
  if (since)
    parts.push(`updated_at:>='${new Date(+since - 600_000).toISOString()}'`);
  if (kind === "orders")
    parts.push(
      `created_at:>='${new Date(+now - 60 * 86400_000).toISOString()}'`,
    );
  const fields =
    kind === "customers"
      ? CUSTOMER_SYNC_FIELDS
      : kind === "products"
        ? PRODUCT_FIELDS
        : ORDER_FIELDS;
  const result = (
    await client.graphql(
      `query ErmesSync${kind}($query:String!,$after:String){${kind}(first:${kind === "products" ? 10 : 100},query:$query,after:$after,sortKey:UPDATED_AT){pageInfo{hasNextPage endCursor}nodes{${fields}}}}`,
      { query: parts.join(" "), after: cursor.after ?? null },
    )
  )[kind];
  if (
    !Array.isArray(result?.nodes) ||
    !result.pageInfo ||
    (result.pageInfo.hasNextPage &&
      (!result.pageInfo.endCursor ||
        result.pageInfo.endCursor === cursor.after))
  )
    throw new Error("Incomplete Shopify sync page");
  for (const node of result.nodes) {
    if (kind === "customers") await syncCustomer(shop, node);
    else if (kind === "products") {
      const product = await fetchProduct(client, node.id);
      if (product) await syncProduct(client, product);
    } else await saveObject(shop, "order", node);
  }
  await setCursor(
    getPool(),
    shop,
    kind,
    result.pageInfo.hasNextPage
      ? {
          ...cursor,
          until: until.toISOString(),
          after: result.pageInfo.endCursor,
        }
      : { completedAt: now.toISOString(), watermark: until.toISOString() },
  );
  await getPool().query(
    "UPDATE shopify_connector SET last_sync_at=now() WHERE shop_domain=$1",
    [shop],
  );
}
