import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  ShopifyClient,
  verifyWebhook,
  verifyAppProxy,
  cartKey,
  identityToken,
  identityId,
  money,
  moneyText,
  lineItems,
} from "../packages/shopify/dist/index.js";

test("Shopify client restricts hosts, caches tokens and refreshes after credential rotation", async () => {
  const credentials = {
    shop: "fixture.myshopify.com",
    clientId: "client-unit",
    clientSecret: "secret-unit",
  };
  for (const shop of [
    "localhost",
    "fixture.myshopify.com.evil.test",
    "https://fixture.myshopify.com",
    "fixture.myshopify.com/path",
  ])
    assert.throws(() => new ShopifyClient({ ...credentials, shop }));
  let tokens = 0;
  const request = async (input, init) => {
    assert.equal(init.redirect, "error");
    if (String(input).endsWith("access_token")) {
      tokens++;
      return Response.json({
        access_token: "synthetic-token",
        expires_in: 86400,
      });
    }
    const body = JSON.parse(init.body);
    assert.doesNotMatch(body.query, /\bemail\b/); // Import the public contact address, not the owner's email.
    return Response.json({
      data: {
        shop: {
          myshopifyDomain: credentials.shop,
          name: "Fixture",
          contactEmail: "hello@example.com",
          ianaTimezone: "UTC",
          primaryDomain: { url: "https://example.com" },
        },
        currentAppInstallation: { accessScopes: [{ handle: "read_orders" }] },
      },
    });
  };
  const client = new ShopifyClient(credentials, request);
  assert.equal((await client.profile()).shop.contactEmail, "hello@example.com");
  await client.profile();
  assert.equal(tokens, 1);
  await new ShopifyClient(
    { ...credentials, clientSecret: "rotated-unit" },
    request,
  ).profile();
  assert.equal(tokens, 2);
});

test("Shopify API failures redact upstream customer details and fail closed", async () => {
  const client = new ShopifyClient(
    {
      shop: "failure.myshopify.com",
      clientId: "client",
      clientSecret: "secret",
    },
    async (input) =>
      String(input).endsWith("access_token")
        ? Response.json({ access_token: "synthetic" })
        : Response.json({
            errors: [
              {
                message: "private-person@example.com secret-token",
                extensions: { code: "ACCESS_DENIED" },
              },
            ],
          }),
  );
  await assert.rejects(
    client.graphql("query { shop { name } }"),
    (error) =>
      /ACCESS_DENIED/.test(error.message) &&
      !/private-person|secret-token/.test(error.message),
  );
});

test("raw webhook and app-proxy signatures reject tampering, replay and a different store", () => {
  const body = Buffer.from('{"id":123}'),
    secret = "synthetic-hmac-secret";
  const signature = createHmac("sha256", secret).update(body).digest("base64");
  assert.equal(verifyWebhook(body, signature, secret), true);
  assert.equal(
    verifyWebhook(Buffer.from('{"id":124}'), signature, secret),
    false,
  );
  const now = Date.now(),
    params = new URLSearchParams({
      shop: "fixture.myshopify.com",
      timestamp: String(Math.floor(now / 1000)),
      logged_in_customer_id: "123",
    });
  params.append("extra", "a");
  params.append("extra", "b");
  const canonical = [...new Set(params.keys())]
    .sort()
    .map((k) => `${k}=${params.getAll(k).join(",")}`)
    .join("");
  params.set(
    "signature",
    createHmac("sha256", secret).update(canonical).digest("hex"),
  );
  assert.equal(
    verifyAppProxy(params, secret, "fixture.myshopify.com", now),
    true,
  );
  assert.equal(
    verifyAppProxy(params, secret, "other.myshopify.com", now),
    false,
  );
  assert.equal(
    verifyAppProxy(params, secret, "fixture.myshopify.com", now + 301000),
    false,
  );
  params.append("logged_in_customer_id", "456");
  assert.equal(
    verifyAppProxy(params, secret, "fixture.myshopify.com", now),
    false,
  );
});

test("cart identities hide private tokens, separate stores and expire", () => {
  process.env.PREFERENCE_TOKEN_SECRET = "synthetic-preference-secret";
  const id = cartKey(
    "fixture.myshopify.com",
    "public-token?key=private-secret",
  );
  assert.equal(id, cartKey("fixture.myshopify.com", "public-token"));
  assert.notEqual(id, cartKey("other.myshopify.com", "public-token"));
  assert.doesNotMatch(id, /public|private/);
  const now = Date.now(),
    token = identityToken(id, now);
  assert.equal(identityId(token, now), id);
  assert.equal(identityId(token, now + 8 * 86400000), null);
  assert.equal(identityId(token.slice(0, -1) + "x", now), null);
});

test("historical line-item totals retain decimal accuracy and discounts", () => {
  assert.equal(moneyText(money("0.1") + money("0.2")), "0.3");
  const [item] = lineItems({
    line_items: [
      {
        variant_id: 123,
        product_id: 456,
        title: "Fixture",
        quantity: 3,
        price: "19.99",
        total_discount: "0.02",
      },
    ],
  });
  assert.equal(item.line_price, "59.95");
  assert.equal(item.unit_price, "19.99");
  assert.throws(() => money("NaN"));
  assert.throws(() => lineItems({ line_items: [{ quantity: 0 }] }));
});
