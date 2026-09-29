import { createHash } from "node:crypto";
import { unseal } from "@ermes/core/secret-box";
import { installationRow } from "@ermes/db";

export type Json = Record<string, any>;
export interface ShopifyCredentials {
  shop: string;
  clientId: string;
  clientSecret: string;
}
export const API_VERSION = "2026-07";
export const READ_SCOPES = ["read_orders", "read_customers", "read_products"];
const tokenCache = new Map<string, { value: string; expiresAt: number }>();

export async function loadShopifyCredentials(): Promise<ShopifyCredentials> {
  const row = await installationRow();
  const read = (key: string) =>
    row.credentials[key] ? unseal(row.credentials[key], key) : "";
  return {
    shop: row.shop_domain ?? "",
    clientId: read("shopifyClientId"),
    clientSecret: read("shopifyClientSecret"),
  };
}
export class ShopifyClient {
  constructor(
    readonly credentials: ShopifyCredentials,
    private readonly request: typeof fetch = fetch,
  ) {
    if (
      !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(credentials.shop) ||
      !credentials.clientId ||
      !credentials.clientSecret
    )
      throw new Error(
        "Save your Shopify domain, app client ID and client secret first",
      );
  }
  private get cacheKey() {
    return createHash("sha256")
      .update(JSON.stringify(this.credentials))
      .digest("hex");
  }
  async accessToken() {
    const cached = tokenCache.get(this.cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
    const response = await this.request(
      `https://${this.credentials.shop}/admin/oauth/access_token`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `Shopify authentication failed (${response.status}). Check the app installation and credentials.`,
      );
    const data = (await response.json()) as Json;
    if (typeof data.access_token !== "string" || !data.access_token)
      throw new Error("Shopify returned no access token");
    // Never persist or return this token to the browser; a rotated secret changes the cache key.
    if (tokenCache.size > 20) tokenCache.clear();
    tokenCache.set(this.cacheKey, {
      value: data.access_token,
      expiresAt:
        Date.now() + Math.min(Number(data.expires_in) || 86400, 86400) * 1000,
    });
    return data.access_token;
  }
  async graphql<T extends Json = Json>(
    query: string,
    variables: Json = {},
  ): Promise<T> {
    const response = await this.request(
      `https://${this.credentials.shop}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/json",
          "x-shopify-access-token": await this.accessToken(),
        },
        body: JSON.stringify({ query, variables }),
      },
    );
    if (response.status === 401) tokenCache.delete(this.cacheKey);
    if (!response.ok)
      throw new Error(
        `Shopify API request failed (${response.status}); the worker will retry.`,
      );
    const payload = (await response.json()) as Json;
    if (payload.errors?.length || !payload.data) {
      // Upstream messages can contain query arguments/customer data. Keep diagnostics bounded and generic.
      const codes = [
        ...new Set(
          (payload.errors ?? [])
            .map((e: Json) => e.extensions?.code)
            .filter(
              (v: unknown) => typeof v === "string" && /^[A-Z_]+$/.test(v),
            ),
        ),
      ];
      throw new Error(
        `Shopify could not complete the request${codes.length ? ` (${codes.join(", ")})` : ""}. Check app scopes and protected customer data access.`,
      );
    }
    return payload.data as T;
  }
  async profile() {
    const data = await this.graphql(`query ErmesStoreProfile {
      shop { id name myshopifyDomain primaryDomain { url } ianaTimezone contactEmail }
      currentAppInstallation { accessScopes { handle } }
    }`);
    if (!data.shop || data.shop.myshopifyDomain !== this.credentials.shop)
      throw new Error("Shopify returned an unexpected store");
    const scopes = (data.currentAppInstallation?.accessScopes ?? []).map(
      (s: Json) => String(s.handle),
    );
    return { shop: data.shop, scopes: scopes as string[] };
  }
}
export async function shopifyClient() {
  return new ShopifyClient(await loadShopifyCredentials());
}
