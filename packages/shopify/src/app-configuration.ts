import { API_VERSION } from "./client.js";
import { CONNECTOR_SCOPES } from "./configuration.js";
import { WEBHOOK_TOPICS } from "./webhooks.js";

export function shopifySetupInfo(appUrl: string | undefined) {
  let origin = "https://ermes.example.com";
  let httpsConfigured = false;
  try {
    const url = new URL(appUrl ?? "");
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      origin = url.origin;
      httpsConfigured = true;
    }
  } catch {
    /* A local installation can still download a template. */
  }
  return {
    origin,
    httpsConfigured,
    appUrl: httpsConfigured
      ? `${origin}/onboarding`
      : "https://shopify.dev/apps/default-app-home",
    scopes: CONNECTOR_SCOPES.join(","),
    apiVersion: API_VERSION,
  };
}

/** Public app metadata only. Never include a client secret or an Admin API token. */
export function shopifyAppConfiguration(
  appUrl: string | undefined,
  clientId = "",
) {
  const { origin, httpsConfigured, scopes } = shopifySetupInfo(appUrl);
  const id = clientId.trim() || "YOUR_SHOPIFY_CLIENT_ID";
  if (!/^[a-zA-Z0-9_-]{8,256}$/.test(id))
    throw new Error("Enter a valid Shopify app client ID");
  return `# Save as shopify-app/shopify.app.toml in your Ermes checkout.
# Publish with Shopify CLI as described in docs/shopify.md.
${httpsConfigured ? "# URLs use this installation's APP_URL. Shopify must be able to reach it." : "# Replace EVERY https://ermes.example.com with your public HTTPS Ermes address."}
${clientId.trim() ? "" : "# Replace YOUR_SHOPIFY_CLIENT_ID with the app client ID from Shopify Settings.\n"}client_id = ${JSON.stringify(id)}
name = "Ermes"
application_url = ${JSON.stringify(`${origin}/onboarding`)}
embedded = false

[access_scopes]
scopes = ${JSON.stringify(scopes)}

[auth]
redirect_urls = [${JSON.stringify(`${origin}/onboarding`)}]

[webhooks]
api_version = ${JSON.stringify(API_VERSION)}

[[webhooks.subscriptions]]
topics = ${JSON.stringify([...WEBHOOK_TOPICS])}
uri = "/api/shopify/webhooks"

[app_proxy]
url = ${JSON.stringify(`${origin}/api/shopify/storefront`)}
subpath = "ermes"
prefix = "apps"
`;
}
