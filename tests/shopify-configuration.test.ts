import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  shopifyAppConfiguration,
  shopifySetupInfo,
  CONNECTOR_SCOPES,
  WEBHOOK_TOPICS,
} from "../packages/shopify/dist/index.js";

test("downloaded Shopify config uses the installation origin and matches the shipped subscriptions", () => {
  const config = shopifyAppConfiguration(
    "https://messages.example.test/",
    "synthetic-client-id",
  );
  assert.match(
    config,
    /application_url = "https:\/\/messages.example.test\/onboarding"/,
  );
  assert.match(
    config,
    /url = "https:\/\/messages.example.test\/api\/shopify\/storefront"/,
  );
  assert.doesNotMatch(
    config,
    /client_secret|access_token|YOUR_SHOPIFY_CLIENT_ID|ermes.example.com/,
  );
  const example = readFileSync(
    new URL("../shopify-app/shopify.app.toml.example", import.meta.url),
    "utf8",
  );
  assert.deepEqual(
    new Set(JSON.parse(config.match(/^topics = (.*)$/m)[1])),
    WEBHOOK_TOPICS,
  );
  assert.deepEqual(
    JSON.parse(config.match(/^topics = (.*)$/m)[1]),
    JSON.parse(example.match(/^topics = (.*)$/m)[1]),
  );
  assert.equal(
    JSON.parse(config.match(/^scopes = (.*)$/m)[1]),
    CONNECTOR_SCOPES.join(","),
  );
});

test("local installs get explicit placeholders and config cannot be injected via a client ID", () => {
  for (const url of [
    undefined,
    "http://localhost:3025",
    "https://localhost",
    "https://user:secret@example.test",
    "bad url",
  ]) {
    assert.equal(shopifySetupInfo(url).httpsConfigured, false);
    assert.match(
      shopifyAppConfiguration(url),
      /Replace EVERY https:\/\/ermes.example.com/,
    );
  }
  assert.throws(
    () =>
      shopifyAppConfiguration(
        "https://example.test",
        'x"\nclient_secret = "oops',
      ),
    /valid Shopify app client ID/,
  );
});
