import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  getPool,
  runMigrations,
  createFirstAdmin,
  sessionAdmin,
  revokeSession,
  saveMerchant,
  saveIntegrations,
  installationStatus,
  getCredential,
  deliveryCredentials,
  getMessagingService,
} from "../packages/db/dist/index.js";
const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
after(async () => {
  if (databaseUrl) await getPool().end();
});

test(
  "first-owner setup is atomic, sessions are revocable and settings never return credentials",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    assert.equal(
      new URL(databaseUrl!).pathname,
      "/ermes_test",
      "This test needs the isolated ermes_test database",
    );
    process.env.ERMES_ENCRYPTION_KEY = "ab".repeat(32);
    await runMigrations();
    await getPool().query(
      "TRUNCATE ermes_session,ermes_admin,ermes_login_attempt",
    );
    await getPool().query(
      "UPDATE ermes_installation SET merchant=NULL,credentials='{}',shop_domain=NULL,delivery_enabled=false WHERE id=1",
    );
    const results = await Promise.allSettled([
      createFirstAdmin("owner@example.test", "a-long-synthetic-password"),
      createFirstAdmin("attacker@example.test", "a-long-synthetic-password"),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const token = (
      results.find(
        (result) => result.status === "fulfilled",
      ) as PromiseFulfilledResult<string>
    ).value;
    assert.ok(await sessionAdmin(token));
    assert.equal(await sessionAdmin("invented"), null);
    const stored = (
      await getPool().query("SELECT token_hash FROM ermes_session")
    ).rows[0];
    assert.notEqual(stored.token_hash, token);
    await revokeSession(token);
    assert.equal(await sessionAdmin(token), undefined);
    await saveMerchant({
      storeName: "Synthetic",
      storefrontUrl: "https://example.test",
      senderName: "Synthetic team",
      senderEmail: "hello@example.test",
      timezone: "UTC",
      logoUrl: "",
    });
    const brand = await getMessagingService().getEmailTemplateBrandContext();
    assert.equal(brand.store_name, "Synthetic");
    assert.equal(brand.store_url, "https://example.test");
    await saveIntegrations({
      resendApiKey: "re_synthetic_private_credential",
      shopDomain: "fixture.myshopify.com",
      shopifyClientId: "synthetic-client",
      shopifyClientSecret: "synthetic-shopify-secret",
    });
    assert.equal(
      await getCredential("resendApiKey"),
      "re_synthetic_private_credential",
    );
    const status = await installationStatus();
    assert.equal(status.credentials.resendApiKey, true);
    assert.doesNotMatch(
      JSON.stringify(status),
      /re_synthetic|synthetic-shopify-secret/,
    );
    const row = (
      await getPool().query(
        "SELECT credentials FROM ermes_installation WHERE id=1",
      )
    ).rows[0];
    assert.doesNotMatch(
      JSON.stringify(row),
      /re_synthetic|synthetic-shopify-secret/,
    );
    await saveIntegrations({});
    assert.equal(
      await getCredential("resendApiKey"),
      "re_synthetic_private_credential",
    );
    await assert.rejects(deliveryCredentials(), /disabled/);
    assert.equal(status.shopifyConnectorActive, false);
  },
);
