import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  getPool,
  runMigrations,
  installationRow,
  saveIntegrations,
} from "../packages/db/dist/index.js";
import {
  connectShopify,
  CONNECTOR_SCOPES,
} from "../packages/shopify/dist/index.js";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
const enabled = { skip: url ? false : "TEST_DATABASE_URL is not configured" };
const shop = "onboarding-fixture.myshopify.com";
const input = {
  shopDomain: shop,
  shopifyClientId: "synthetic-client-id",
  shopifyClientSecret: "synthetic-onboarding-secret",
};
const profile = {
  id: "gid://shopify/Shop/1",
  name: "Imported store",
  myshopifyDomain: shop,
  primaryDomain: { url: "https://store.example.test" },
  ianaTimezone: "Europe/Rome",
  contactEmail: "contact@example.test",
};
const fixture =
  (scopes = CONNECTOR_SCOPES, change = async () => {}) =>
  async (url, options) => {
    assert.ok(String(url).startsWith(`https://${shop}/`));
    if (String(url).endsWith("access_token"))
      return Response.json({
        access_token: "synthetic-onboarding-token",
        expires_in: 86400,
      });
    await change();
    return Response.json({
      data: {
        shop: profile,
        currentAppInstallation: {
          accessScopes: scopes.map((handle) => ({ handle })),
        },
      },
    });
  };
before(async () => {
  if (!url) return;
  assert.equal(new URL(url).pathname, "/ermes_test");
  process.env.ERMES_ENCRYPTION_KEY = "cd".repeat(32);
  await runMigrations();
  await getPool().query(
    "TRUNCATE shopify_connector,shopify_webhook,shopify_object,shopify_recovery,shopify_command,shopify_form_event",
  );
  await getPool().query(
    "UPDATE ermes_installation SET shop_domain=NULL,credentials='{}',shopify_verified_at=NULL,merchant=NULL,delivery_enabled=false WHERE id=1",
  );
});
after(async () => {
  if (url) await getPool().end();
});

test(
  "connect verifies all scopes, encrypts credentials and proposes details without starting sync or saving the sender",
  enabled,
  async () => {
    // Shopify may return write_customers instead of the implied read_customers.
    const result = await connectShopify(
      input,
      fixture(CONNECTOR_SCOPES.filter((s) => s !== "read_customers")),
    );
    assert.equal(result.profile.storeName, "Imported store");
    assert.equal(result.profile.senderEmail, "contact@example.test");
    assert.doesNotMatch(
      JSON.stringify(result),
      /synthetic-onboarding-secret|synthetic-onboarding-token|synthetic-client-id/,
    );
    const saved = await installationRow();
    assert.equal(saved.shop_domain, shop);
    assert.ok(saved.shopify_verified_at);
    assert.equal(saved.merchant, null);
    assert.equal(saved.delivery_enabled, false);
    assert.equal(
      (await getPool().query("SELECT 1 FROM shopify_connector")).rowCount,
      0,
    );
    assert.notEqual(
      saved.credentials.shopifyClientSecret,
      input.shopifyClientSecret,
    );
    const again = await connectShopify({}, fixture());
    assert.equal(again.profile.storeName, "Imported store");
    assert.deepEqual(
      (await installationRow()).credentials,
      saved.credentials,
      "blank values preserve stored ciphertext",
    );
  },
);

test(
  "failed credentials and missing permissions preserve the working connection and verification",
  enabled,
  async () => {
    const before = await installationRow();
    await assert.rejects(
      connectShopify(
        { ...input, shopifyClientSecret: "synthetic-invalid-secret" },
        async () =>
          new Response("upstream secret must not appear", { status: 401 }),
      ),
      /authentication failed \(401\)/,
    );
    assert.deepEqual(await installationRow(), before);
    await assert.rejects(
      connectShopify(input, fixture(["read_products"])),
      /Add these Shopify app permissions/,
    );
    assert.deepEqual(await installationRow(), before);
  },
);

test(
  "a concurrent credential edit wins over an in-flight connection attempt",
  enabled,
  async () => {
    await assert.rejects(
      connectShopify(
        input,
        fixture(CONNECTOR_SCOPES, async () => {
          await saveIntegrations({
            shopifyClientSecret: "synthetic-concurrent-secret",
          });
        }),
      ),
      /settings changed during connection/,
    );
    const changed = await installationRow();
    assert.equal(changed.shopify_verified_at, null);
    await connectShopify(input, fixture());
  },
);

test(
  "connecting again preserves unrelated credentials, merchant settings, active sync and delivery",
  enabled,
  async () => {
    await saveIntegrations({ resendApiKey: "synthetic-resend-preserved" });
    await getPool().query(
      "UPDATE ermes_installation SET merchant=$1,delivery_enabled=true WHERE id=1",
      [{ storeName: "Keep my brand" }],
    );
    await getPool().query(
      "INSERT INTO shopify_connector(shop_domain,enabled) VALUES($1,true)",
      [shop],
    );
    const before = await installationRow();
    await connectShopify({}, fixture());
    const after = await installationRow();
    assert.deepEqual(after.credentials, before.credentials);
    assert.deepEqual(after.merchant, before.merchant);
    assert.equal(after.delivery_enabled, true);
    assert.equal(
      (
        await getPool().query(
          "SELECT enabled FROM shopify_connector WHERE shop_domain=$1",
          [shop],
        )
      ).rows[0].enabled,
      true,
    );
    let requests = 0;
    await assert.rejects(
      connectShopify(
        { ...input, shopDomain: "different-store.myshopify.com" },
        async () => {
          requests++;
          throw new Error("must not request");
        },
      ),
      /linked to one store/,
    );
    assert.equal(requests, 0);
    assert.deepEqual(await installationRow(), after);
  },
);
