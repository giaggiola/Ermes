import { getPool, installationRow } from "@ermes/db";
import { shopifyClient, READ_SCOPES } from "./client.js";
import { transaction } from "./store.js";

export const CONNECTOR_SCOPES = [
  ...READ_SCOPES,
  "write_customers",
  "read_inventory",
  "read_discounts",
  "write_discounts",
  "write_app_proxy",
];
export async function setConnectorEnabled(enabled: boolean) {
  const settings = await installationRow();
  if (!enabled) {
    await getPool().query(
      "UPDATE shopify_connector SET enabled=false,updated_at=now() WHERE shop_domain=$1",
      [settings.shop_domain],
    );
    return;
  }
  const client = await shopifyClient(),
    { scopes } = await client.profile();
  const missing = CONNECTOR_SCOPES.filter(
    (scope) =>
      !scopes.includes(scope) &&
      !(
        scope.startsWith("read_") &&
        scopes.includes(scope.replace("read_", "write_"))
      ),
  );
  if (missing.length)
    throw new Error(
      `Update your Shopify app permissions before starting sync: ${missing.join(", ")}`,
    );
  await transaction(async (db) => {
    const current = (
      await db.query("SELECT * FROM ermes_installation WHERE id=1 FOR UPDATE")
    ).rows[0];
    if (
      current.shop_domain !== settings.shop_domain ||
      JSON.stringify(current.credentials) !==
        JSON.stringify(settings.credentials)
    )
      throw new Error("Shopify settings changed. Try again.");
    await db.query(
      "INSERT INTO shopify_connector(shop_domain,enabled) VALUES($1,true) ON CONFLICT(shop_domain) DO UPDATE SET enabled=true,last_error=NULL,updated_at=now()",
      [client.credentials.shop],
    );
    await db.query(
      "UPDATE ermes_installation SET shopify_verified_at=now() WHERE id=1",
    );
  });
}

/** Erase short-lived recovery/inbox data even while sync is paused. */
export async function cleanupShopifyData() {
  await getPool().query(
    "DELETE FROM shopify_form_event WHERE created_at<now()-interval '8 days'",
  );
  await getPool().query(
    "UPDATE shopify_recovery SET state='expired',email=NULL,customer_id=NULL,snapshot='{}' WHERE last_activity_at<now()-interval '7 days' AND state!='expired'",
  );
  await getPool().query(
    "UPDATE shopify_webhook SET payload='{}',state='expired' WHERE state='pending' AND received_at<now()-interval '7 days'",
  );
  await getPool().query(
    "UPDATE shopify_command SET payload='{}',state='expired' WHERE kind='consent' AND state='pending' AND created_at<now()-interval '7 days'",
  );
}
