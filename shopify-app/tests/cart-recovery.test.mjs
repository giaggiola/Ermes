import assert from "node:assert/strict";
import test from "node:test";
import { createCartRecovery } from "../src/cart-recovery.mjs";

function harness({ consent = true, loggedIn = false } = {}) {
  const storage = new Map(),
    calls = [],
    listeners = {};
  let interval;
  const window = {
    Shopify: {
      routes: { root: "/it/" },
      customerPrivacy: { marketingAllowed: () => consent },
    },
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    setInterval: (fn) => {
      interval = fn;
    },
  };
  const document = {
    visibilityState: "visible",
    querySelector: () => loggedIn,
    addEventListener: (k, v) => {
      listeners[k] = v;
    },
  };
  const fetch = async (url, init) => {
    calls.push({ url, body: init?.body && JSON.parse(init.body) });
    return {
      ok: true,
      json: async () =>
        url.endsWith("cart.js")
          ? { token: "private-cart-token" }
          : { identified: true, identity_token: "opaque-id" },
    };
  };
  return {
    recovery: createCartRecovery({ window, document, fetch }),
    calls,
    storage,
    listeners,
    setConsent: (value) => {
      consent = value;
    },
    tick: () => interval(),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("anonymous shoppers are not identified and signup identity requires marketing consent", async () => {
  const h = harness({ consent: false });
  h.recovery.start();
  assert.deepEqual(await h.recovery.signupContext(), {});
  h.recovery.remember("opaque-id");
  assert.equal(h.storage.size, 0);
  assert.equal(h.calls.length, 0);
  h.setConsent(true);
  assert.deepEqual(await h.recovery.signupContext(), {
    recovery_allowed: true,
    recovery_cart_token: "private-cart-token",
  });
});

test("known shoppers bind through app proxy without sending email and withdraw tracking consent", async () => {
  const h = harness({ loggedIn: true });
  h.recovery.start();
  await settle();
  assert.equal(h.calls[0].url, "/it/cart.js");
  assert.equal(h.calls[1].url, "/apps/ermes/recovery/identify");
  assert.equal("email" in h.calls[1].body, false);
  assert.equal(h.storage.size, 1);
  h.setConsent(false);
  h.listeners.visitorConsentCollected();
  await settle();
  assert.equal(h.calls.at(-1).body.marketing_allowed, false);
  assert.equal(h.calls.at(-1).body.identity_token, "opaque-id");
  assert.equal(h.storage.size, 0);
});

test("identity returned after consent withdrawal is revoked without browser persistence", async () => {
  const h = harness({ consent: false });
  h.recovery.start();
  // A successful signup response can arrive after the consent-change listener.
  h.recovery.remember("late-identity");
  assert.equal(h.storage.size, 0);
  await settle();
  assert.equal(h.calls.at(-1).body.marketing_allowed, false);
  assert.equal(h.calls.at(-1).body.identity_token, "late-identity");
  const count = h.calls.length;
  h.tick();
  await settle();
  assert.equal(h.calls.length, count);
});
