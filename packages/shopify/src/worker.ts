import { getPool } from "@ermes/db";
import { shopifyClient, type ShopifyClient } from "./client.js";
import { connector, flushCommerceOutbox } from "./store.js";
import { reconcileCheckouts, dispatchRecoveries } from "./recovery.js";
import { syncResourcePage } from "./catalog.js";
import { drainWebhooks } from "./webhooks.js";
import { collectConsentChanges, drainConsentCommands } from "./commands.js";

import { cleanupShopifyData } from "./configuration.js";

export async function runShopifyTick(client?: ShopifyClient) {
  await cleanupShopifyData();
  const active = client ?? (await shopifyClient());
  const shop = active.credentials.shop;
  if (!(await connector(shop))?.enabled) return;
  const db = await getPool().connect(),
    lock = `ermes-shopify:${shop}`;
  let locked = false;
  try {
    locked = Boolean(
      (
        await db.query(
          "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",
          [lock],
        )
      ).rows[0].locked,
    );
    if (!locked) return;
    // Each task commits its own bounded work. One failed API must not prevent
    // authenticated webhooks or other streams from making progress.
    const errors: string[] = [];
    const tasks: [string, () => Promise<unknown>][] = [
      ["Webhooks", () => drainWebhooks(active)],
      [
        "Customer consent",
        async () => {
          await collectConsentChanges(active);
          await drainConsentCommands(active);
        },
      ],
      ["Customers", () => syncResourcePage(active, "customers")],
      ["Products", () => syncResourcePage(active, "products")],
      ["Orders", () => syncResourcePage(active, "orders")],
      ["Checkout reconciliation", () => reconcileCheckouts(active)],
      ["Recovery", () => dispatchRecoveries(active)],
      ["Messaging events", () => flushCommerceOutbox()],
    ];
    for (const [name, run] of tasks) {
      if (!(await connector(shop))?.enabled) break;
      try {
        await run();
      } catch {
        errors.push(
          `${name} needs attention; check Shopify permissions and connection.`,
        );
      }
    }
    await db.query(
      "UPDATE shopify_connector SET last_error=$2,updated_at=now() WHERE shop_domain=$1",
      [shop, errors.join(" ") || null],
    );
  } finally {
    if (locked)
      await db.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
        lock,
      ]);
    db.release();
  }
}
