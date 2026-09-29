import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { chromium, expect, request } from "@playwright/test";
import { checkShopifyBrowser } from "./shopify-browser.mjs";
import { createPreferenceToken } from "../packages/core/dist/index.js";

// Run only against a fresh, disposable installation. Never enables sending.
const baseURL = process.env.ERMES_TEST_URL;
if (!baseURL)
  throw new Error("Set ERMES_TEST_URL to a disposable installation");
const setupToken = process.env.ERMES_SETUP_TOKEN;
const artifacts = process.env.ERMES_ARTIFACT_DIR ?? "/tmp/ermes-browser-smoke";
await mkdir(artifacts, { recursive: true });
const api = await request.newContext({ baseURL });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const pageErrors = [];
const failedAPI = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("response", (response) => {
  if (response.url().includes("/api/") && response.status() >= 400) {
    failedAPI.push(`${response.status()} ${new URL(response.url()).pathname}`);
  }
});
const email = "owner@example.test";
const password = randomBytes(24).toString("base64url");
const post = (path, data, origin = baseURL) =>
  api.post(path, { data, headers: { origin } });

try {
  assert.equal((await api.get("/api/health")).status(), 200);
  assert.equal((await api.get("/api/admin/dashboard")).status(), 401);
  assert.equal((await api.get("/api/onboarding")).status(), 401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  if (setupToken)
    assert.equal(
      (
        await post("/api/auth/setup", {
          email,
          password,
          setupToken: "incorrect",
        })
      ).status(),
      401,
    );
  assert.equal(
    (
      await post(
        "/api/auth/setup",
        { email, password, setupToken },
        "https://untrusted.example",
      )
    ).status(),
    400,
  );

  if (setupToken) {
    await page.getByLabel("Setup key").fill(setupToken);
  } else {
    await expect(page.getByLabel("Setup key")).toHaveCount(0);
  }
  await page.screenshot({
    path: `${artifacts}/signup-desktop.png`,
    fullPage: true,
  });
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  assert.equal(
    (await post("/api/auth/setup", { email, password, setupToken })).status(),
    409,
  );
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "ermes_session",
  );
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "Lax");
  const owner = await request.newContext({
    baseURL,
    extraHTTPHeaders: {
      cookie: `ermes_session=${cookie.value}`,
      origin: baseURL,
    },
  });
  assert.equal(
    (
      await owner.post("/api/onboarding", {
        data: {
          action: "delivery",
          value: { enabled: true, confirmedSender: true },
        },
      })
    ).status(),
    400,
  );
  assert.equal(
    (
      await owner.post("/api/onboarding", {
        data: { action: "integrations", value: {} },
        headers: { origin: "https://untrusted.example" },
      })
    ).status(),
    400,
  );

  await expect(
    page.getByRole("heading", { name: "Connect your Shopify store." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Shopify Dev Dashboard" }),
  ).toHaveAttribute("href", "https://dev.shopify.com/");
  await page.screenshot({
    path: `${artifacts}/shopify-connect-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Shopify setup must fit mobile viewport",
  );
  await page.screenshot({
    path: `${artifacts}/shopify-connect-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Set up manually for now" }).click();
  await page.locator('[name="storeName"]').fill("Acme Studio");
  await page.locator('[name="storefrontUrl"]').fill("https://example.test");
  await page.locator('[name="senderName"]').fill("The Acme team");
  await page.locator('[name="senderEmail"]').fill("hello@example.test");
  await page.locator('[name="timezone"]').fill("Europe/Rome");
  await page.screenshot({
    path: `${artifacts}/onboarding-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Onboarding must fit mobile viewport",
  );
  await page.screenshot({
    path: `${artifacts}/onboarding-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your email provider." }),
  ).toBeVisible();
  await page
    .locator('[name="resendApiKey"]')
    .fill("re_synthetic_browser_key_never_send");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByRole("button", { name: "1 Shopify", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your Shopify store." }),
  ).toBeVisible();
  await page
    .locator('[name="shopDomain"]')
    .fill("synthetic-ermes.myshopify.com");
  await page.locator('[name="shopifyClientId"]').fill("synthetic-client-id");
  await page
    .locator('[name="shopifyClientSecret"]')
    .fill("synthetic-shopify-secret-never-connect");
  await page
    .getByText("App settings and configuration", { exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download app configuration" })
    .click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "shopify.app.toml");
  const stream = await download.createReadStream();
  let configuration = "";
  for await (const chunk of stream) configuration += chunk.toString();
  assert.match(configuration, /client_id = "synthetic-client-id"/);
  assert.match(configuration, /Replace EVERY https:\/\/ermes.example.com/);
  assert.doesNotMatch(configuration, /synthetic-shopify-secret|client_secret/);
  if (process.env.ERMES_SHOPIFY_FIXTURE === "true") {
    await page.getByRole("button", { name: "Connect store" }).click();
    await expect(
      page.getByRole("heading", { name: "Review your store details." }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Store connected");
    await expect(page.locator('[name="senderEmail"]')).toHaveValue(
      "hello@example.test",
    );
    await expect(page.locator('[name="storeName"]')).toHaveValue(
      "Shopify fixture store",
    );
  } else {
    // Without the synthetic Shopify server, exercise credential storage without real API requests.
    assert.equal(
      (
        await owner.post("/api/onboarding", {
          data: {
            action: "integrations",
            value: {
              shopDomain: "synthetic-ermes.myshopify.com",
              shopifyClientId: "synthetic-client-id",
              shopifyClientSecret: "synthetic-shopify-secret-never-connect",
            },
          },
        })
      ).status(),
      200,
    );
  }
  const status = await (await owner.get("/api/onboarding")).json();
  assert.equal(status.merchant.storeName, "Acme Studio");
  assert.equal(status.credentials.resendApiKey, true);
  assert.equal(status.credentials.shopifyClientSecret, true);
  assert.equal(status.deliveryEnabled, false);
  assert.equal(status.shopifyConnectorActive, false);
  assert.doesNotMatch(
    JSON.stringify(status),
    /re_synthetic|synthetic-shopify-secret/,
  );
  await page
    .getByRole("button", { name: "4 Image storage", exact: true })
    .click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByRole("link", { name: "Open your workspace" }).click();
  await expect(page).toHaveURL(/\/messaging$/);

  for (const route of [
    "",
    "templates",
    "campaigns",
    "profiles",
    "segments",
    "events",
    "suppressions",
    "runtime",
    "forms",
    "flows",
  ]) {
    await page.goto(`/messaging${route ? `/${route}` : ""}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".workspace-content")).toBeVisible();
    assert.equal(await page.getByText("404", { exact: true }).count(), 0);
  }
  await page.getByRole("button", { name: "New flow", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Select a trigger" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Subscribed to newsletter/i }).click();
  await page
    .getByRole("button", { name: "Flow settings", exact: true })
    .click();
  await page
    .getByPlaceholder("Welcome series", { exact: true })
    .fill("Welcome series");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create flow", exact: true }).click();
  await expect(page).toHaveURL(/\/messaging\/flows\/(?!new$)[^/]+$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome series" }),
  ).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `${artifacts}/flow-editor.png`,
    fullPage: true,
  });
  const flows = await (await owner.get("/api/admin/email-flows")).json();
  assert.ok(
    flows.email_flows.some(
      (flow) => flow.name === "Welcome series" && flow.status === "draft",
    ),
  );

  const templateResponse = await owner.post("/api/admin/email-templates", {
    data: {
      name: "Synthetic test template",
      subject: "Hello from {{store_name}}",
      html_content: "<p>{{store_name}}</p>",
      is_active: false,
    },
  });
  assert.equal(templateResponse.status(), 201);
  const template = (await templateResponse.json()).email_template;
  const preview = await (
    await owner.post(`/api/admin/email-templates/${template.id}/preview`, {
      data: {},
    })
  ).json();
  assert.equal(preview.preview.subject, "Hello from Acme Studio");
  const blockedSend = await owner.post(
    `/api/admin/email-templates/${template.id}/send-test`,
    {
      data: { email, request_id: "synthetic-paused-send" },
    },
  );
  assert.equal(blockedSend.status(), 409);
  assert.match((await blockedSend.json()).message, /delivery is disabled/);

  const subscriberResponse = await owner.post("/api/admin/email-subscribers", {
    data: { email: "subscriber@example.test", subscribed: true },
  });
  assert.equal(subscriberResponse.status(), 201);
  const subscriber = (await subscriberResponse.json()).email_subscriber;
  const token = createPreferenceToken({
    email: subscriber.email,
    purpose: "unsubscribe",
    secret: process.env.PREFERENCE_TOKEN_SECRET,
  });
  await page.goto(`/unsubscribe?token=${encodeURIComponent(token)}`);
  await expect(
    page.getByRole("heading", { name: "Unsubscribe from marketing emails" }),
  ).toBeVisible();
  const stillSubscribed = await (
    await owner.get(`/api/admin/email-subscribers/${subscriber.id}`)
  ).json();
  assert.equal(
    stillSubscribed.email_subscriber.subscribed,
    true,
    "Opening the link must not unsubscribe",
  );
  await page.getByRole("button", { name: "Unsubscribe", exact: true }).click();
  await expect(page.getByText("You have been unsubscribed.")).toBeVisible();
  const unsubscribed = await (
    await owner.get(`/api/admin/email-subscribers/${subscriber.id}`)
  ).json();
  assert.equal(unsubscribed.email_subscriber.subscribed, false);
  await page.goto("/messaging");

  if (process.env.ERMES_SHOPIFY_FIXTURE === "true")
    await checkShopifyBrowser({
      page,
      context,
      owner,
      api,
      artifacts,
      baseURL,
    });
  await page.goto("/messaging");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  assert.equal(
    (await owner.get("/api/admin/dashboard")).status(),
    401,
    "Logout must revoke the old session",
  );
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: false }).click();
  await expect(page).toHaveURL(/\/messaging$/);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedAPI, []);
  console.log(
    "Browser smoke passed: setup, auth, CSRF, encrypted settings, 10 screens, draft flow persistence, logout and login. Delivery stayed disabled.",
  );
  await owner.dispose();
} catch (error) {
  await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true });
  console.error("Browser diagnostics", {
    pageErrors,
    failedAPI,
    pagePath: new URL(page.url()).pathname,
  });
  throw error;
} finally {
  await browser.close();
  await api.dispose();
}
