import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, request } from "@playwright/test";

// Point only at a disposable installation started with cloudinary-fetch.mjs.
// The real application, database, authentication and upload route are exercised;
// only Cloudinary is replaced by the synthetic provider fixture.
const baseURL = process.env.ERMES_IMAGE_TEST_URL;
if (!baseURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL))
  throw new Error(
    "Set ERMES_IMAGE_TEST_URL to the isolated localhost test server",
  );
const artifacts = process.env.ERMES_ARTIFACT_DIR ?? "/tmp/ermes-image-picker";
await mkdir(artifacts, { recursive: true });
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=",
  "base64",
);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1440, height: 1000 },
});
await context.route("https://res.cloudinary.com/synthetic-cloud/**", (route) =>
  route.fulfill({ contentType: "image/png", body: png }),
);
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
const anonymous = await request.newContext({
  baseURL,
  extraHTTPHeaders: { origin: baseURL },
});

try {
  assert.equal((await anonymous.get("/api/assets")).status(), 401);
  assert.equal((await anonymous.post("/api/assets/upload")).status(), 401);
  await page.goto("/setup");
  await page.getByLabel("Email address").fill("images@example.test");
  await page.getByLabel(/^Password/).fill("synthetic-image-owner-password");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto("/messaging/forms");
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign-up form editor" }),
  ).toBeVisible();
  const formURL = page.url().split("?")[0];
  const formId = new URL(formURL).pathname.split("/").pop();
  await page.getByRole("button", { name: "Form layout & theme" }).click();
  await page.getByRole("button", { name: "Choose", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Connect Cloudinary to upload images.", { exact: false }),
  ).toBeVisible();
  await dialog.getByRole("link", { name: "Set up image storage" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect image storage." }),
  ).toBeVisible();
  await page.locator('[name="cloudinaryCloudName"]').fill("synthetic-cloud");
  await page.locator('[name="cloudinaryApiKey"]').fill("123456789012345");
  await page
    .locator('[name="cloudinaryApiSecret"]')
    .fill("synthetic-cloudinary-secret");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready to explore." }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "ermes_session",
  );
  const owner = await request.newContext({
    baseURL,
    extraHTTPHeaders: {
      origin: baseURL,
      cookie: `ermes_session=${cookie.value}`,
    },
  });
  const status = await (await owner.get("/api/onboarding")).json();
  assert.equal(status.credentials.cloudinaryApiSecret, true);
  assert.doesNotMatch(
    JSON.stringify(status),
    /synthetic-cloudinary-secret|123456789012345/,
  );
  assert.equal(
    (
      await owner.post("/api/assets/upload", {
        headers: { origin: "https://untrusted.example" },
      })
    ).status(),
    403,
  );
  assert.equal(
    (
      await owner.post("/api/assets/upload", {
        multipart: {
          file: {
            name: "fake.png",
            mimeType: "image/png",
            buffer: Buffer.from("<svg></svg>"),
          },
        },
      })
    ).status(),
    400,
  );

  await page.goto(formURL);
  await page.getByRole("button", { name: "Form layout & theme" }).click();
  await page.getByRole("button", { name: "Choose", exact: true }).click();
  await expect(
    dialog.getByText("Your image library is empty.", { exact: false }),
  ).toBeVisible();
  await dialog.getByRole("tab", { name: "Upload image" }).click();
  await dialog
    .getByLabel("Image file")
    .setInputFiles({ name: "welcome.png", mimeType: "image/png", buffer: png });
  await expect(dialog.getByAltText("Selected image preview")).toBeVisible();
  await page.screenshot({
    path: `${artifacts}/upload-desktop.png`,
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Upload and use" }).click();
  await expect(dialog).toHaveCount(0);
  const library = await (await owner.get("/api/assets")).json();
  assert.equal(library.assets.length, 1);
  const url = library.assets[0].url;
  await expect
    .poll(
      async () =>
        (await (await owner.get(`/api/admin/signup-forms/${formId}`)).json())
          .signup_form.document.styles.image_url,
    )
    .toBe(url);
  await page.reload();
  await page.getByRole("button", { name: "Form layout & theme" }).click();
  await expect(page.locator(`input[value="${url}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Choose", exact: true }).click();
  await dialog.getByLabel("Search images").fill("missing");
  await expect(dialog.getByText("No images match your search.")).toBeVisible();
  await dialog.getByLabel("Search images").fill("welcome");
  await dialog.getByRole("button", { name: "Select welcome.png" }).click();
  await page.screenshot({
    path: `${artifacts}/library-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${artifacts}/library-mobile.png`,
    fullPage: true,
  });
  const bounds = await dialog.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  await dialog.getByRole("button", { name: "Use image" }).click();
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Add block" }).click();
  await page.getByRole("menuitem", { name: "Image", exact: true }).click();
  await page.getByRole("button", { name: "Choose", exact: true }).click();
  await dialog.getByRole("button", { name: "Select welcome.png" }).click();
  await dialog.getByRole("button", { name: "Use image" }).click();
  await expect
    .poll(async () => {
      const form = (
        await (await owner.get(`/api/admin/signup-forms/${formId}`)).json()
      ).signup_form;
      return form.document.steps
        .flatMap((step) => step.blocks)
        .find((block) => block.type === "image")?.src;
    })
    .toBe(url);
  await page.goto("/messaging/runtime");
  await page.getByRole("button", { name: "Choose asset" }).click();
  await dialog.getByRole("button", { name: "Select welcome.png" }).click();
  await dialog.getByRole("button", { name: "Use image" }).click();
  await expect(page.locator(`input[value="${url}"]`)).toBeVisible();
  assert.deepEqual(pageErrors, []);
  console.log(
    "Image picker smoke passed: setup, authorization, upload, persistence, reuse, search, mobile layout and sender logo.",
  );
  await owner.dispose();
} finally {
  await anonymous.dispose();
  await browser.close();
}
