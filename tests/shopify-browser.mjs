import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";

export async function checkShopifyBrowser({
  page,
  context,
  owner,
  api,
  artifacts,
  baseURL,
}) {
  await page.goto("/onboarding");
  await page
    .getByRole("button", { name: "Shopify connection" })
    .click();
  await page
    .getByRole("button", { name: "Review store details", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Store connected");
  await expect(page.locator('[name="storeName"]')).toHaveValue(
    "Shopify fixture store",
  );
  await expect(page.locator('[name="storefrontUrl"]')).toHaveValue(
    "https://storefront.example.test",
  );
  await expect(page.locator('[name="senderEmail"]')).toHaveValue(
    "hello@example.test",
  );
  assert.equal(
    (await (await owner.get("/api/onboarding")).json()).merchant.storeName,
    "Acme Studio",
    "Import must wait for review before saving",
  );
  await page.screenshot({
    path: `${artifacts}/shopify-import.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save and start syncing" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your email provider." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "1 Shopify", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause Shopify sync" }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await owner.get("/api/onboarding")).json()).shopifySync
          .completed.length,
      { timeout: 60000 },
    )
    .toBe(3);
  const status = await (await owner.get("/api/onboarding")).json();
  assert.equal(status.deliveryEnabled, false);
  assert.equal(status.shopifySync.error, null);
  await expect(
    page.getByRole("link", { name: "Open Shopify theme editor" }),
  ).toHaveAttribute(
    "href",
    "https://synthetic-ermes.myshopify.com/admin/themes/current/editor?context=apps",
  );
  await page.screenshot({
    path: `${artifacts}/shopify-status.png`,
    fullPage: true,
  });
  const rejected = await owner.post("/api/onboarding", {
    data: {
      action: "connect-shopify",
      value: { shopifyClientSecret: "synthetic-invalid-shopify-secret" },
    },
  });
  assert.equal(rejected.status(), 400);
  assert.match((await rejected.json()).message, /authentication failed/);
  const afterFailure = await (await owner.get("/api/onboarding")).json();
  for (const key of [
    "merchant",
    "credentials",
    "shopDomain",
    "deliveryEnabled",
    "shopifyVerifiedAt",
    "shopifyConnectorActive",
  ])
    assert.deepEqual(
      afterFailure[key],
      status[key],
      `failed reconnect must preserve ${key}`,
    );
  await page
    .getByRole("button", { name: "Pause Shopify sync", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start Shopify sync", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review store details", exact: true })
    .click();
  assert.equal(
    (await (await owner.get("/api/onboarding")).json()).shopifyConnectorActive,
    false,
    "reviewing details must not resume paused sync",
  );
  await page.getByRole("button", { name: "Save and start syncing" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your email provider." }),
  ).toBeVisible();

  await page.goto("/messaging/forms");
  await page.getByRole("button", { name: "Create form", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign-up form editor" }),
  ).toBeVisible();
  const formId = new URL(page.url()).pathname.split("/").pop();
  await page
    .getByRole("textbox", { name: "Form name", exact: true })
    .fill("Storefront fixture form");
  await expect
    .poll(
      async () =>
        (await (await owner.get(`/api/admin/signup-forms/${formId}`)).json())
          .signup_form.name,
    )
    .toBe("Storefront fixture form");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Form name", exact: true }),
  ).toHaveValue("Storefront fixture form");
  const saved = (
    await (await owner.get(`/api/admin/signup-forms/${formId}`)).json()
  ).signup_form;
  // Configure a deterministic storefront fixture through the real authenticated editor API.
  const document = {
    ...saved.document,
    mode: "html",
    html: '<h2>Get store news</h2><label>Email<input type="email" name="email" required></label><label><input type="checkbox" name="consent" required> I agree to receive marketing emails.</label><button type="submit">Subscribe</button>',
    targeting: {
      ...saved.document.targeting,
      delay_ms: 0,
      hide_when_logged_in: false,
      cooldown_days: 0,
    },
  };
  assert.equal(
    (
      await owner.patch(`/api/admin/signup-forms/${formId}`, {
        data: { document },
      })
    ).status(),
    200,
  );
  await page.goto(`/messaging/forms/${formId}?tab=html`);
  await page.getByRole("button", { name: "Targeting", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await owner.get(`/api/admin/signup-forms/${formId}`)).json())
          .signup_form.document.mode,
    )
    .toBe("html");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `${artifacts}/form-editor.png`,
    fullPage: true,
  });
  assert.equal(
    (await (await owner.get(`/api/admin/signup-forms/${formId}`)).json())
      .signup_form.status,
    "published",
  );

  const proxy = async (path, body) => {
    const params = new URLSearchParams({
      shop: "synthetic-ermes.myshopify.com",
      timestamp: String(Math.floor(Date.now() / 1000)),
      logged_in_customer_id: "",
      path_prefix: "/apps/ermes",
    });
    const canonical = [...params.keys()]
      .sort()
      .map((k) => `${k}=${params.getAll(k).join(",")}`)
      .join("");
    params.set(
      "signature",
      createHmac("sha256", "synthetic-shopify-secret-never-connect")
        .update(canonical)
        .digest("hex"),
    );
    return api.post(`/api/shopify/storefront/${path}?${params}`, {
      data: body,
    });
  };
  assert.equal(
    (
      await api.post("/api/shopify/storefront/signup-form", { data: {} })
    ).status(),
    401,
  );
  assert.equal(
    (await api.post("/api/shopify/webhooks", { data: {} })).status(),
    401,
  );
  const published = (await (await proxy("signup-form", {})).json()).form;
  assert.equal(published.document.html, document.html);
  await owner.patch(`/api/admin/signup-forms/${formId}`, {
    data: { document: { ...document, html: "<h2>Unpublished draft</h2>" } },
  });
  assert.equal(
    (await (await proxy("signup-form", {})).json()).form.document.html,
    document.html,
  );

  const theme = await context.newPage(),
    failures = [];
  theme.on("pageerror", (e) => failures.push(e.message));
  let markup = await readFile(
    new URL(
      "../shopify-app/extensions/welcome-popup/blocks/welcome-popup.liquid",
      import.meta.url,
    ),
    "utf8",
  );
  markup = markup
    .split("{% schema %}")[0]
    .replace(/^.*assign popup_id.*\n/, "")
    .replaceAll("{{ popup_id }}", "fixture-popup")
    .replace("{% if customer %}true{% else %}false{% endif %}", "false");
  await theme.route("https://storefront.example.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/apps/ermes/")) {
      const result = await proxy(
        path.slice("/apps/ermes/".length),
        route.request().postDataJSON(),
      );
      if (!result.ok()) failures.push(`${result.status()} ${path}`);
      return route.fulfill({
        status: result.status(),
        contentType: "application/json",
        body: await result.text(),
      });
    }
    if (path === "/cart.js")
      return route.fulfill({
        json: { token: "browser-cart?key=private-fixture-key", items: [] },
      });
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><title>Synthetic storefront</title></head><body>${markup}</body></html>`,
    });
  });
  await theme.goto("https://storefront.example.test/");
  await theme.evaluate(() => {
    window.Shopify = {
      routes: { root: "/" },
      customerPrivacy: {
        marketingAllowed: () => true,
        analyticsProcessingAllowed: () => true,
      },
    };
  });
  await theme.addStyleTag({
    path: new URL(
      "../shopify-app/extensions/welcome-popup/assets/welcome-popup.css",
      import.meta.url,
    ).pathname,
  });
  await theme.addScriptTag({
    path: new URL(
      "../shopify-app/extensions/welcome-popup/assets/welcome-popup.js",
      import.meta.url,
    ).pathname,
  });
  await expect(
    theme.getByRole("heading", { name: "Get store news" }),
  ).toBeVisible();
  await theme
    .getByLabel("Email", { exact: true })
    .fill("storefront-fixture@example.com");
  await theme.getByRole("checkbox").check();
  await theme.screenshot({
    path: `${artifacts}/storefront-popup.png`,
    fullPage: true,
  });
  await theme.getByRole("button", { name: "Subscribe", exact: true }).click();
  await expect
    .poll(async () => {
      const list = (
        await (await owner.get("/api/admin/email-subscribers")).json()
      ).email_subscribers;
      return list.some(
        (s) => s.email === "storefront-fixture@example.com" && s.subscribed,
      );
    })
    .toBe(true);
  await expect
    .poll(
      async () =>
        (await (await owner.get(`/api/admin/signup-forms/${formId}`)).json())
          .signup_form.submitted,
    )
    .toBe(1);
  assert.ok(
    await theme.evaluate(() =>
      window.localStorage.getItem("ermes-messaging:recovery-identity"),
    ),
  );
  assert.deepEqual(failures, []);
  await theme.close();
  assert.equal(
    (await (await owner.get("/api/onboarding")).json()).deliveryEnabled,
    false,
  );
  console.log(
    "Shopify browser checks passed: profile import/review, sync status, form editor, pinned publication, signed proxy, theme popup and consented signup. No email delivery enabled.",
  );
}
