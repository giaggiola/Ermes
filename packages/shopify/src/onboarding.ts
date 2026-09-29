import {
  integrationInputSchema,
  merchantSettingsSchema,
} from "@ermes/core/installation";
import { seal, unseal } from "@ermes/core/secret-box";
import { installationRow } from "@ermes/db";
import { ShopifyClient, type Json } from "./client.js";
import { CONNECTOR_SCOPES } from "./configuration.js";
import { transaction } from "./store.js";

const connectionSchema = integrationInputSchema.pick({
  shopDomain: true,
  shopifyClientId: true,
  shopifyClientSecret: true,
});

export function shopifyStoreProfile(shop: Json) {
  return {
    ...merchantSettingsSchema
      .pick({ storeName: true, storefrontUrl: true, timezone: true })
      .parse({
        storeName: shop.name,
        storefrontUrl: shop.primaryDomain?.url,
        timezone: shop.ianaTimezone,
      }),
    senderName: String(shop.name),
    senderEmail: merchantSettingsSchema.shape.senderEmail.safeParse(
      shop.contactEmail,
    ).success
      ? String(shop.contactEmail)
      : "",
  };
}

/** Verify candidate credentials before replacing a working connection. No sync or delivery changes. */
export async function connectShopify(
  input: unknown,
  request: typeof fetch = fetch,
) {
  const parsed = connectionSchema.parse(input);
  const previous = await installationRow();
  const shop = parsed.shopDomain ?? previous.shop_domain;
  const sameShop = shop === previous.shop_domain;
  const read = (key: string) =>
    sameShop && previous.credentials[key]
      ? unseal(previous.credentials[key], key)
      : "";
  const credentials = {
    shop: shop ?? "",
    clientId: parsed.shopifyClientId ?? read("shopifyClientId"),
    clientSecret: parsed.shopifyClientSecret ?? read("shopifyClientSecret"),
  };
  const client = new ShopifyClient(credentials, request);
  // Avoid making requests to a different store once this installation has imported data.
  await transaction(async (db) => {
    if (
      !sameShop &&
      (await db.query("SELECT 1 FROM shopify_connector LIMIT 1")).rowCount
    )
      throw new Error(
        "This installation is linked to one store. Use a separate Ermes installation for another store.",
      );
  });
  const { shop: details, scopes } = await client.profile();
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
      `Add these Shopify app permissions, release the version and approve the updated access: ${missing.join(", ")}`,
    );
  const profile = shopifyStoreProfile(details);
  await transaction(async (db) => {
    const current = (
      await db.query("SELECT * FROM ermes_installation WHERE id=1 FOR UPDATE")
    ).rows[0];
    if (
      current.shop_domain !== previous.shop_domain ||
      current.credentials.shopifyClientId !==
        previous.credentials.shopifyClientId ||
      current.credentials.shopifyClientSecret !==
        previous.credentials.shopifyClientSecret
    )
      throw new Error("Shopify settings changed during connection. Try again.");
    if (
      !sameShop &&
      (await db.query("SELECT 1 FROM shopify_connector LIMIT 1")).rowCount
    )
      throw new Error(
        "This installation is linked to one store. Use a separate Ermes installation for another store.",
      );
    const updated: Record<string, string> = {};
    for (const [key, value] of [
      ["shopifyClientId", credentials.clientId],
      ["shopifyClientSecret", credentials.clientSecret],
    ]) {
      if (read(key) !== value) updated[key] = seal(value, key);
    }
    await db.query(
      "UPDATE ermes_installation SET credentials=credentials || $1::jsonb,shop_domain=$2,shopify_verified_at=now(),updated_at=now() WHERE id=1",
      [JSON.stringify(updated), shop],
    );
  });
  return { shopName: details.name, scopes, profile };
}
