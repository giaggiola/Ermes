import assert from "node:assert/strict";
import test from "node:test";
import { verifyEilishSignature } from "@ermes/core";
import { checkShopifyRecoveryEligibility } from "../apps/worker/src/commerce.ts";

test("recovery preflight authenticates identity and fails closed on unavailable or invalid responses", async () => {
  const original = globalThis.fetch;
  const url = process.env.COMMERCE_COMMAND_URL;
  const secret = process.env.COMMERCE_COMMAND_SHARED_SECRET;
  process.env.COMMERCE_COMMAND_URL = "https://fixture.invalid";
  process.env.COMMERCE_COMMAND_SHARED_SECRET = "fixture-signing-secret-000000000000";
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "https://fixture.invalid/internal/shopify/recovery/eligibility");
      const headers = new Headers(init?.headers);
      assert.equal(verifyEilishSignature({
        body: String(init?.body), secret: process.env.COMMERCE_COMMAND_SHARED_SECRET!,
        timestamp: headers.get("x-eilish-timestamp")!, signature: headers.get("x-eilish-signature")!,
      }), true);
      assert.deepEqual(JSON.parse(String(init?.body)), { recovery_id: "recovery-fixture", email: "shopper@example.test", activity_at: "2026-09-27T00:00:00Z" });
      return Response.json({ allowed: false, reason: "Customer purchased" });
    };
    assert.deepEqual(await checkShopifyRecoveryEligibility("recovery-fixture", "shopper@example.test", "2026-09-27T00:00:00Z"), {
      allowed: false, reason: "Customer purchased",
    });
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(checkShopifyRecoveryEligibility("id", "email", "2026-09-27T00:00:00Z"), /unavailable/);
    globalThis.fetch = async () => Response.json({ allowed: "true" });
    await assert.rejects(checkShopifyRecoveryEligibility("id", "email", "2026-09-27T00:00:00Z"), /Invalid/);
    delete process.env.COMMERCE_COMMAND_SHARED_SECRET;
    await assert.rejects(checkShopifyRecoveryEligibility("id", "email", "2026-09-27T00:00:00Z"), /required/);
  } finally {
    globalThis.fetch = original;
    if (url === undefined) delete process.env.COMMERCE_COMMAND_URL;
    else process.env.COMMERCE_COMMAND_URL = url;
    if (secret === undefined) delete process.env.COMMERCE_COMMAND_SHARED_SECRET;
    else process.env.COMMERCE_COMMAND_SHARED_SECRET = secret;
  }
});
