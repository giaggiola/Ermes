import { getCredential, getPool, installationRow } from "@ermes/db";

/** Bring-your-own app: app and store must be in the same Shopify organisation. */
export async function verifyShopifyConnection() {
  const row = await installationRow();
  const clientId = await getCredential("shopifyClientId"),
    secret = await getCredential("shopifyClientSecret");
  if (
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(row.shop_domain ?? "") ||
    !clientId ||
    !secret
  )
    throw new Error("Save your shop domain, client ID and client secret first");
  const response = await fetch(
    `https://${row.shop_domain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: secret,
      }),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  );
  if (!response.ok)
    throw new Error(
      "Shopify authentication failed. Check that this app is installed and belongs to the same organisation as the store.",
    );
  const token = (await response.json()) as { access_token?: string };
  if (!token.access_token)
    throw new Error("Shopify did not return an access token");
  const result = await fetch(
    `https://${row.shop_domain}/admin/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Shopify-Access-Token": token.access_token,
      },
      body: JSON.stringify({
        query:
          "query { shop { name } currentAppInstallation { accessScopes { handle } } }",
      }),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  );
  const payload = (await result.json()) as {
    errors?: unknown;
    data?: {
      shop: { name: string };
      currentAppInstallation: { accessScopes: { handle: string }[] };
    };
  };
  if (!result.ok || payload.errors || !payload.data)
    throw new Error("Shopify could not verify the installation");
  const scopes = payload.data.currentAppInstallation.accessScopes.map(
    (scope) => scope.handle,
  );
  const missing = ["read_orders", "read_customers", "read_products"].filter(
    (scope) => !scopes.includes(scope),
  );
  if (missing.length)
    throw new Error(
      `The Shopify app needs these permissions: ${missing.join(", ")}`,
    );
  // Record only success metadata. Access tokens are short-lived and never returned.
  await getPool().query(
    "UPDATE ermes_installation SET shopify_verified_at=now() WHERE id=1 AND shop_domain=$1 AND credentials=$2::jsonb",
    [row.shop_domain, JSON.stringify(row.credentials)],
  );
  return { shopName: payload.data.shop.name, scopes, connectorActive: false };
}
