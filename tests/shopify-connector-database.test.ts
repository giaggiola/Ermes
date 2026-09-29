import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import {
  getPool,
  runMigrations,
  getMessagingService,
  saveIntegrations,
} from "../packages/db/dist/index.js";
import { createDefaultSignupForm } from "../packages/core/dist/signup-form-schema.js";
import {
  ShopifyClient,
  transaction,
  stableId,
  cartKey,
  bindCart,
  handleRecoveryWebhook,
  recoveryEligibility,
  reconcileCheckouts,
  syncCustomer,
  syncProduct,
  syncResourcePage,
  receiveWebhook,
  processWebhook,
  syncConsent,
  collectConsentChanges,
  storefrontForm,
  storefrontSubscribe,
  storefrontEvent,
  createShopifyPromotion,
  cleanupShopifyData,
} from "../packages/shopify/dist/index.js";

const url = process.env.TEST_DATABASE_URL,
  shop = "connector-fixture.myshopify.com",
  secret = "synthetic-shopify-connector-secret";
if (url) process.env.DATABASE_URL = url;
const enabled = { skip: url ? false : "TEST_DATABASE_URL is not configured" };
const iso = (ago = 0) => new Date(Date.now() - ago).toISOString();
const query = async (sql, values = []) => getPool().query(sql, values);
function client(respond) {
  const instance = new ShopifyClient({
    shop,
    clientId: "connector-test",
    clientSecret: secret,
  });
  instance.graphql = async (q, v = {}) => respond(q, v);
  return instance;
}
const customer = (email, overrides = {}) => ({
  id: "gid://shopify/Customer/123",
  firstName: "Fixture",
  lastName: "Shopper",
  updatedAt: iso(),
  defaultEmailAddress: {
    emailAddress: email,
    marketingState: "SUBSCRIBED",
    marketingUpdatedAt: iso(7200000),
  },
  lastOrder: null,
  ...overrides,
});
before(async () => {
  if (!url) return;
  assert.equal(new URL(url).pathname, "/ermes_test");
  process.env.ERMES_ENCRYPTION_KEY = "cd".repeat(32);
  process.env.PREFERENCE_TOKEN_SECRET = "synthetic-connector-preference-secret";
  await runMigrations();
  await query(
    "TRUNCATE shopify_connector,shopify_webhook,shopify_object,shopify_recovery,shopify_command,shopify_form_event",
  );
  await query(
    "INSERT INTO shopify_connector(shop_domain,enabled,started_at) VALUES($1,true,now()-interval '3 days')",
    [shop],
  );
  await query(
    "UPDATE ermes_installation SET shop_domain=NULL,credentials='{}' WHERE id=1",
  );
  await saveIntegrations({
    shopDomain: shop,
    shopifyClientId: "connector-test",
    shopifyClientSecret: secret,
  });
});
after(async () => {
  if (url) await getPool().end();
});

test(
  "customer imports create profiles without welcome events or reversing local opt-outs",
  enabled,
  async () => {
    const service = getMessagingService(),
      email = "import-fixture@example.com";
    const before = (
      await query("SELECT count(*)::int AS n FROM commerce_event")
    ).rows[0].n;
    await syncCustomer(shop, customer(email));
    assert.equal(
      (await service.listEmailSubscribers({ email }))[0].subscribed,
      true,
    );
    await service.unsubscribe(email);
    await syncCustomer(shop, customer(email, { updatedAt: iso() }));
    assert.equal(
      (await service.listEmailSubscribers({ email }))[0].subscribed,
      false,
    );
    assert.equal(
      (await query("SELECT count(*)::int AS n FROM commerce_event")).rows[0].n,
      before,
    );
    const cached = (
      await query(
        "SELECT payload FROM shopify_object WHERE shop_domain=$1 AND kind='customer'",
        [shop],
      )
    ).rows[0].payload;
    await syncCustomer(
      shop,
      customer(email, { firstName: "STALE", updatedAt: iso(86400000) }),
    );
    assert.equal(
      (await service.listEmailSubscribers({ email }))[0].first_name,
      cached.firstName,
    );
  },
);

test(
  "sync pagination retries failed pages without moving its watermark",
  enabled,
  async () => {
    let calls = 0;
    const fake = client((q, v) => {
      calls++;
      if (calls === 1) {
        assert.equal(v.after, null);
        return {
          orders: {
            nodes: [{ id: "gid://shopify/Order/10", updatedAt: iso(60000) }],
            pageInfo: { hasNextPage: true, endCursor: "page-1" },
          },
        };
      }
      assert.equal(v.after, "page-1");
      if (calls === 2) throw new Error("Synthetic timeout");
      return {
        orders: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    });
    await syncResourcePage(fake, "orders");
    const first = (
      await query(
        "SELECT cursors FROM shopify_connector WHERE shop_domain=$1",
        [shop],
      )
    ).rows[0].cursors.orders;
    assert.equal(first.after, "page-1");
    assert.equal(first.watermark, undefined);
    await assert.rejects(syncResourcePage(fake, "orders"), /timeout/);
    assert.deepEqual(
      (
        await query(
          "SELECT cursors FROM shopify_connector WHERE shop_domain=$1",
          [shop],
        )
      ).rows[0].cursors.orders,
      first,
    );
    await syncResourcePage(fake, "orders");
    assert.equal(
      (
        await query(
          "SELECT cursors FROM shopify_connector WHERE shop_domain=$1",
          [shop],
        )
      ).rows[0].cursors.orders.watermark,
      first.until,
    );
  },
);

test(
  "product baselines stay silent; real price and availability changes have an atomic deduplicated outbox",
  enabled,
  async () => {
    const fake = client(() => ({ shop: { currencyCode: "EUR" } }));
    const product = {
      id: "gid://shopify/Product/21",
      title: "Fixture",
      handle: "fixture",
      status: "ACTIVE",
      updatedAt: iso(60000),
      onlineStoreUrl: "https://example.com/products/fixture",
      variants: [
        {
          id: "gid://shopify/ProductVariant/22",
          price: "20.00",
          availableForSale: false,
        },
      ],
    };
    const count = async () =>
      Number(
        (
          await query(
            "SELECT count(*) FROM commerce_event WHERE event_id LIKE 'product.%:shopify:%'",
          )
        ).rows[0].count,
      );
    const before = await count();
    await syncProduct(fake, product);
    assert.equal(await count(), before);
    const changed = {
      ...product,
      updatedAt: iso(),
      variants: [
        { ...product.variants[0], price: "15.00", availableForSale: true },
      ],
    };
    await syncProduct(fake, changed, true);
    assert.equal(await count(), before + 2);
    await syncProduct(fake, changed, true);
    assert.equal(await count(), before + 2);
    await syncProduct(fake, product, true);
    assert.equal(await count(), before + 2);
  },
);

test(
  "authenticated webhook replay deduplicates and purchase tombstones defeat late cart updates",
  enabled,
  async () => {
    const payload = {
      id: 456,
      token: "cart-webhook?key=private-key",
      updated_at: iso(7200000),
      created_at: iso(8000000),
      line_items: [
        { variant_id: 22, product_id: 21, quantity: 1, price: "15.00" },
      ],
    };
    const send = async (topic, p, id) => {
      const body = Buffer.from(JSON.stringify(p));
      return receiveWebhook(
        body,
        new Headers({
          "x-shopify-shop-domain": shop,
          "x-shopify-topic": topic,
          "x-shopify-event-id": id,
          "x-shopify-hmac-sha256": createHmac("sha256", secret)
            .update(body)
            .digest("base64"),
        }),
      );
    };
    assert.equal(
      (await send("carts/update", payload, "cart-first")).duplicate,
      false,
    );
    assert.equal(
      (await send("carts/update", payload, "cart-first")).duplicate,
      true,
    );
    assert.doesNotMatch(
      JSON.stringify(
        (
          await query(
            "SELECT payload FROM shopify_webhook WHERE topic='carts/update'",
          )
        ).rows,
      ),
      /private-key|cart-webhook/,
    );
    await send(
      "orders/create",
      {
        id: 77,
        cart_token: payload.token,
        email: "purchased@example.com",
        created_at: iso(),
      },
      "purchase-first",
    );
    await send("carts/update", { ...payload, updated_at: iso() }, "cart-late");
    const row = (
      await query("SELECT * FROM shopify_recovery WHERE source_key=$1", [
        cartKey(shop, payload.token),
      ])
    ).rows[0];
    assert.equal(row.state, "recovered");
    await assert.rejects(
      receiveWebhook(
        Buffer.from("{}"),
        new Headers({
          "x-shopify-shop-domain": shop,
          "x-shopify-hmac-sha256": "invalid",
        }),
      ),
      /signature/,
    );
  },
);

test(
  "cart recovery needs identity, authoritative complete contents, inactivity and current consent",
  enabled,
  async () => {
    const email = "recover-cart@example.com",
      token = "eligible-cart?key=private",
      activity = iso(7200000);
    await transaction(async (db) => {
      await handleRecoveryWebhook(db, shop, "carts/update", {
        token,
        created_at: iso(9000000),
        updated_at: activity,
        line_items: [{ variant_id: 22, quantity: 1, price: "15.00" }],
      });
      await bindCart(db, shop, token, email);
    });
    await transaction((db) =>
      handleRecoveryWebhook(db, shop, "orders/create", {
        email,
        created_at: iso(86400000),
        updated_at: iso(),
      }),
    );
    const row = (
      await query("SELECT * FROM shopify_recovery WHERE source_key=$1", [
        cartKey(shop, token),
      ])
    ).rows[0];
    assert.equal(
      row.state,
      "watching",
      "An old order replay must not cancel a newer cart",
    );
    const c = customer(email),
      fake = client(() => ({ customers: { nodes: [c] } }));
    assert.equal((await recoveryEligibility(fake, row, email)).allowed, true);
    assert.equal(
      (await recoveryEligibility(fake, { ...row, email: null }, email)).allowed,
      false,
    );
    assert.equal(
      (
        await recoveryEligibility(
          fake,
          { ...row, last_activity_at: new Date() },
          email,
        )
      ).allowed,
      false,
    );
    assert.equal(
      (
        await recoveryEligibility(
          fake,
          { ...row, snapshot: { ...row.snapshot, unsupported_items: true } },
          email,
        )
      ).allowed,
      false,
    );
    assert.equal(
      (
        await recoveryEligibility(
          fake,
          { ...row, snapshot: { ...row.snapshot, incomplete_items: true } },
          email,
        )
      ).allowed,
      false,
    );
    c.defaultEmailAddress.marketingState = "UNSUBSCRIBED";
    assert.equal((await recoveryEligibility(fake, row, email)).allowed, false);
    c.defaultEmailAddress.marketingState = "SUBSCRIBED";
    c.lastOrder = { createdAt: iso(60000) };
    assert.equal((await recoveryEligibility(fake, row, email)).allowed, false);
    c.lastOrder = null;
    await getMessagingService().recordSuppression(email, "unsubscribe", "test");
    assert.equal((await recoveryEligibility(fake, row, email)).allowed, false);
  },
);

test(
  "checkout reconciliation and final checks reject purchases, changed activity and Shopify recovery emails",
  enabled,
  async () => {
    const email = "checkout-fixture@example.com",
      activity = iso(7200000);
    const node = {
      id: "gid://shopify/AbandonedCheckout/51",
      createdAt: iso(9000000),
      updatedAt: activity,
      completedAt: null,
      abandonedCheckoutUrl: "https://example.com/checkouts/recovery",
      customer: customer(email),
      totalPriceSet: { shopMoney: { amount: "15.00", currencyCode: "EUR" } },
      lineItems: {
        pageInfo: { hasNextPage: false },
        nodes: [
          {
            title: "Fixture",
            quantity: 1,
            variant: { id: "gid://shopify/ProductVariant/22" },
            originalUnitPriceSet: { shopMoney: { amount: "15.00" } },
            discountedTotalPriceSet: { shopMoney: { amount: "15.00" } },
          },
        ],
      },
    };
    const abandonment = {
      emailState: null,
      customerHasNoOrderSinceAbandonment: true,
      isMostSignificantAbandonment: true,
    };
    const fake = client((q, v) =>
      q.includes("ErmesRecoveryCheckouts")
        ? {
            abandonedCheckouts: {
              nodes: [node],
              pageInfo: { hasNextPage: false },
            },
          }
        : { node, abandonmentByAbandonedCheckoutId: abandonment },
    );
    await reconcileCheckouts(fake);
    const row = (
      await query("SELECT * FROM shopify_recovery WHERE source_key=$1", [
        node.id,
      ])
    ).rows[0];
    assert.equal((await recoveryEligibility(fake, row, email)).allowed, true);
    for (const state of ["SENT", "SCHEDULED"]) {
      abandonment.emailState = state;
      assert.equal(
        (await recoveryEligibility(fake, row, email)).allowed,
        false,
      );
    }
    abandonment.emailState = "NOT_SENT";
    node.updatedAt = iso();
    assert.equal((await recoveryEligibility(fake, row, email)).allowed, false);
    node.updatedAt = activity;
    node.completedAt = iso();
    assert.equal((await recoveryEligibility(fake, row, email)).allowed, false);
    node.completedAt = null;
    abandonment.isMostSignificantAbandonment = false;
    assert.equal((await recoveryEligibility(fake, row, email)).allowed, false);
    const broken = client(() => {
      throw new Error("Synthetic API outage");
    });
    await assert.rejects(recoveryEligibility(broken, row, email), /outage/);
  },
);

test(
  "published form versions, submission idempotency and welcome events survive retries without reviving opt-outs",
  enabled,
  async () => {
    const service = getMessagingService(),
      id = "form_connector_fixture",
      email = "signup-fixture@example.com";
    await query("UPDATE signup_form SET status='draft'");
    const document = createDefaultSignupForm();
    await service.createSignupForms([
      { id, name: "Fixture form", type: "popup", status: "draft", document },
    ]);
    assert.equal((await storefrontForm(shop)).form, null);
    await service.publishSignupFormVersion(id);
    const { form } = await storefrontForm(shop);
    assert.ok(form?.version_id);
    const changed = {
      ...document,
      styles: { ...document.styles, background_color: "#123456" },
    };
    await service.updateSignupForms({ id, document: changed });
    assert.deepEqual((await storefrontForm(shop)).form.document, document);
    const input = {
      email,
      consent: true,
      form_id: id,
      form_version_id: form.version_id,
      analytics_token: form.analytics_token,
      analytics_event_id: "submission-fixture-1",
      recovery_allowed: true,
      recovery_cart_token: "signup-cart?key=private",
    };
    await assert.rejects(
      storefrontSubscribe(shop, { ...input, consent: false }),
      /agree/,
    );
    const results = await Promise.all([
      storefrontSubscribe(shop, input),
      storefrontSubscribe(shop, input),
    ]);
    assert.equal(
      results.filter((r) => r.already_subscribed === false).length,
      1,
    );
    assert.ok(results.find((r) => r.recovery_identity_token));
    const events = (
      await query(
        "SELECT payload FROM commerce_event WHERE event_type='newsletter.subscribed' AND payload->'payload'->>'email'=$1",
        [email],
      )
    ).rows;
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.payload.subscription_recorded, true);
    await service.unsubscribe(email);
    await storefrontSubscribe(shop, input);
    assert.equal(
      (await service.listEmailSubscribers({ email }))[0].subscribed,
      false,
    );
    const viewed = {
      ...input,
      event_id: "view-fixture-1",
      event_type: "viewed",
      analytics_allowed: true,
    };
    await storefrontEvent(shop, viewed);
    await storefrontEvent(shop, viewed);
    const counter = await service.retrieveSignupForm(id);
    assert.equal(counter.impressions, 1);
    assert.equal(counter.submitted, 1);
    await service.publishSignupFormVersion(id);
    await assert.rejects(
      storefrontSubscribe(shop, {
        ...input,
        analytics_event_id: "submission-fixture-2",
      }),
      /form changed/,
    );
  },
);

test(
  "newer remote and local consent choices outrank queued subscribe commands",
  enabled,
  async () => {
    const email = "consent-fixture@example.com",
      service = getMessagingService();
    await service.subscribeWithStatus(email, { source: "test" });
    let mutations = 0;
    const c = customer(email, {
      defaultEmailAddress: {
        emailAddress: email,
        marketingState: "UNSUBSCRIBED",
        marketingUpdatedAt: iso(-10000),
      },
    });
    const fake = client((q) => {
      if (q.startsWith("mutation")) {
        mutations++;
        return {
          customerEmailMarketingConsentUpdate: {
            customer: { id: c.id },
            userErrors: [],
          },
        };
      }
      return { customers: { nodes: [c] } };
    });
    await syncConsent(fake, {
      email,
      action: "subscribed",
      occurredAt: iso(-5000),
    });
    assert.equal(mutations, 0);
    await service.unsubscribe(email);
    await syncConsent(fake, {
      email,
      action: "subscribed",
      occurredAt: iso(60000),
    });
    assert.equal(mutations, 0);
    await collectConsentChanges(fake);
    assert.ok(
      (
        await query(
          "SELECT 1 FROM shopify_command WHERE kind='consent' AND payload->>'email'=$1",
          [email],
        )
      ).rowCount,
    );
  },
);

test(
  "Shopify discounts are idempotent and reject conflicting keys",
  enabled,
  async () => {
    let mutations = 0;
    const fake = client((q) => {
      if (q.includes("Currency")) return { shop: { currencyCode: "EUR" } };
      if (q.includes("FindDiscount"))
        return { codeDiscountNodes: { nodes: [] } };
      mutations++;
      return {
        discountCodeBasicCreate: {
          codeDiscountNode: { id: "gid://shopify/DiscountCodeNode/91" },
          userErrors: [],
        },
      };
    });
    const input = {
      code: "FIXTURE10",
      currencyCode: "EUR",
      discountType: "percentage",
      discountValue: 10,
      idempotencyKey: "discount-fixture",
      usageLimit: 1,
    };
    const first = await createShopifyPromotion(input, fake);
    assert.deepEqual(await createShopifyPromotion(input, fake), first);
    assert.equal(mutations, 1);
    await assert.rejects(
      createShopifyPromotion({ ...input, discountValue: 20 }, fake),
      /different settings/,
    );
  },
);

test(
  "retention erases expired recovery identities and payloads while syncing is paused",
  enabled,
  async () => {
    await query(
      "UPDATE shopify_connector SET enabled=false WHERE shop_domain=$1",
      [shop],
    );
    await query(
      "UPDATE shopify_recovery SET last_activity_at=now()-interval '8 days' WHERE shop_domain=$1",
      [shop],
    );
    await cleanupShopifyData();
    assert.equal(
      (
        await query(
          "SELECT 1 FROM shopify_recovery WHERE shop_domain=$1 AND (email IS NOT NULL OR customer_id IS NOT NULL OR snapshot!='{}')",
          [shop],
        )
      ).rowCount,
      0,
    );
    await assert.rejects(storefrontForm(shop), /Enable Shopify syncing/);
  },
);

test(
  "Shopify consent webhook preserves 64-bit IDs and immediately applies opt-outs",
  enabled,
  async () => {
    // Topic and payload follow Shopify's 2026-07 webhook reference.
    const email = "large-id-consent@example.com",
      customerId = "706405506930370084";
    const body = Buffer.from(
      '{"customer_id":706405506930370084,"email_address":"large-id-consent@example.com","email_marketing_consent":{"state":"unsubscribed"}}',
    );
    const topic = "customers_email_marketing_consent/update";
    const response = await receiveWebhook(
      body,
      new Headers({
        "x-shopify-shop-domain": shop,
        "x-shopify-topic": topic,
        "x-shopify-event-id": "consent-large-id",
        "x-shopify-hmac-sha256": createHmac("sha256", secret)
          .update(body)
          .digest("base64"),
      }),
    );
    assert.equal(response.ignored, undefined);
    const row = (
      await query("SELECT * FROM shopify_webhook WHERE topic=$1", [topic])
    ).rows[0];
    assert.equal(row.payload.customer_id, customerId);
    await getMessagingService().subscribeWithStatus(email, { source: "test" });
    const fake = client((q, v) => {
      assert.equal(v.id, `gid://shopify/Customer/${customerId}`);
      return {
        customer: customer(email, {
          id: v.id,
          defaultEmailAddress: {
            emailAddress: email,
            marketingState: "UNSUBSCRIBED",
            marketingUpdatedAt: iso(),
          },
        }),
      };
    });
    await processWebhook(fake, row);
    assert.equal(
      (await getMessagingService().listEmailSubscribers({ email }))[0]
        .subscribed,
      false,
    );
  },
);
