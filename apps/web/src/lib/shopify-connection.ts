import { getPool, installationRow } from "@ermes/db";
import { merchantSettingsSchema } from "@ermes/core/installation";
import { shopifyClient, READ_SCOPES } from "@ermes/shopify";

/** Returns a reviewable profile; importing never saves sender settings or enables delivery. */
export async function verifyShopifyConnection(importProfile = false) {
  const row = await installationRow();
  const client = await shopifyClient();
  const { shop, scopes } = await client.profile();
  const missing = READ_SCOPES.filter(
    (scope) =>
      !scopes.includes(scope) &&
      !scopes.includes(scope.replace("read_", "write_")),
  );
  if (missing.length)
    throw new Error(
      `The Shopify app needs these permissions: ${missing.join(", ")}`,
    );
  const saved = await getPool().query(
    "UPDATE ermes_installation SET shopify_verified_at=now() WHERE id=1 AND shop_domain=$1 AND credentials=$2::jsonb",
    [client.credentials.shop, JSON.stringify(row.credentials)],
  );
  if (!saved.rowCount)
    throw new Error(
      "Shopify settings changed during the request. Please try again.",
    );
  const profile = importProfile
    ? {
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
      }
    : undefined;
  return { shopName: shop.name, scopes, ...(profile ? { profile } : {}) };
}
