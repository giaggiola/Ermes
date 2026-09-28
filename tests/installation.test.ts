import assert from "node:assert/strict";
import test from "node:test";
import {
  seal,
  unseal,
  hashPassword,
  verifyPassword,
} from "../packages/core/dist/secret-box.js";
import {
  merchantSettingsSchema,
  integrationInputSchema,
} from "../packages/core/dist/installation.js";

test("credential encryption authenticates purpose, key and ciphertext", () => {
  process.env.ERMES_ENCRYPTION_KEY = "ab".repeat(32);
  const value = seal("synthetic-provider-secret", "resendApiKey");
  assert.equal(value.includes("synthetic-provider-secret"), false);
  assert.equal(unseal(value, "resendApiKey"), "synthetic-provider-secret");
  assert.throws(() => unseal(value, "shopifyClientSecret"));
  const parts = value.split(":");
  parts[3] = (parts[3].startsWith("a") ? "b" : "a") + parts[3].slice(1);
  assert.throws(() => unseal(parts.join(":"), "resendApiKey"));
  process.env.ERMES_ENCRYPTION_KEY = "cd".repeat(32);
  assert.throws(() => unseal(value, "resendApiKey"));
});
test("password verification uses salted scrypt hashes", async () => {
  const first = await hashPassword("synthetic-long-password"),
    second = await hashPassword("synthetic-long-password");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("synthetic-long-password", first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
});
test("merchant inputs reject insecure URLs, invalid zones and arbitrary Shopify hosts", () => {
  const input = {
    storeName: "Acme",
    storefrontUrl: "https://example.test",
    senderName: "Acme",
    senderEmail: "hello@example.test",
    timezone: "Europe/Rome",
    logoUrl: "",
  };
  assert.equal(merchantSettingsSchema.safeParse(input).success, true);
  assert.equal(
    merchantSettingsSchema.safeParse({
      ...input,
      storefrontUrl: "javascript:alert(1)",
    }).success,
    false,
  );
  assert.equal(
    merchantSettingsSchema.safeParse({ ...input, timezone: "invented" })
      .success,
    false,
  );
  assert.equal(
    integrationInputSchema.safeParse({ shopDomain: "127.0.0.1" }).success,
    false,
  );
  assert.equal(
    integrationInputSchema.safeParse({
      shopDomain: "shop.myshopify.com.evil.test",
    }).success,
    false,
  );
});
