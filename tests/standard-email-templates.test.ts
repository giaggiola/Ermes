import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import { MEDUSA_EMAIL_TEMPLATES } from "../packages/core/dist/index.js";
import { ensureStandardEmailTemplates } from "../packages/db/dist/index.js";

const marker =
  "This is placeholder content. Replace it before enabling and publishing the flow.";

test("standard email templates are built in and legacy placeholders upgrade safely", async () => {
  const templates = new Map<string, Record<string, unknown>>([
    [
      "tpl_placeholder_win_back_30_days_v1",
      {
        html_content: `<p>${marker}</p>`,
        id: "tpl_placeholder_win_back_30_days_v1",
        is_active: false,
        name: "Placeholder — Win-back 30 days",
        subject: "[Placeholder] We miss you",
        text_content: marker,
      },
    ],
    [
      "tpl_placeholder_abandoned_cart_v1",
      {
        html_content: "<p>My edited cart reminder</p>",
        id: "tpl_placeholder_abandoned_cart_v1",
        is_active: false,
        name: "Edited cart reminder",
        subject: "Your cart is waiting",
      },
    ],
  ]);

  const store = {
    async createEmailTemplates(rows: Record<string, unknown>[]) {
      for (const row of rows) {
        templates.set(String(row.id), row);
      }
    },
    async listEmailTemplates() {
      return Array.from(templates.values()).map((row) => ({
        ...row,
        id: String(row.id),
      }));
    },
    async updateEmailTemplates(row: Record<string, unknown>) {
      templates.set(String(row.id), {
        ...templates.get(String(row.id)),
        ...row,
      });
    },
  };

  const first = await ensureStandardEmailTemplates(store);
  assert.equal(first.created_template_ids.length, 18);
  assert.deepEqual(first.updated_standard_template_ids, []);
  assert.deepEqual(first.upgraded_legacy_template_ids, [
    "tpl_placeholder_win_back_30_days_v1",
  ]);
  assert.match(
    String(
      templates.get("tpl_placeholder_win_back_30_days_v1")?.html_content,
    ),
    /\{\{store_name\}\}/,
  );
  assert.doesNotMatch(
    String(
      templates.get("tpl_placeholder_win_back_30_days_v1")?.html_content,
    ),
    /placeholder content/i,
  );
  assert.equal(
    templates.get("tpl_placeholder_abandoned_cart_v1")?.html_content,
    "<p>My edited cart reminder</p>",
  );

  const second = await ensureStandardEmailTemplates(store);
  assert.deepEqual(second.created_template_ids, []);
  assert.deepEqual(second.updated_standard_template_ids, []);
  assert.deepEqual(second.upgraded_legacy_template_ids, []);
});

test("untouched pre-branding templates receive the logo without replacing edits", async () => {
  const branded = MEDUSA_EMAIL_TEMPLATES.welcome;
  const brandedHeader = branded.htmlContent.match(
    /<tr><td align="center" bgcolor="#ffffff"[^\n]+<\/td><\/tr>/,
  )?.[0];
  assert.ok(brandedHeader);
  const preBrandingHtml = readFileSync(new URL("./fixtures/legacy-welcome.html", import.meta.url), "utf8");
  const edited = MEDUSA_EMAIL_TEMPLATES.orderConfirmation;
  const templates = new Map<string, Record<string, unknown>>([
    [
      branded.id,
      {
        html_content: preBrandingHtml,
        id: branded.id,
        is_active: true,
        name: branded.name,
      },
    ],
    [
      edited.id,
      {
        html_content: "<p>Studio-authored order email</p>",
        id: edited.id,
        is_active: true,
        name: edited.name,
      },
    ],
  ]);
  const store = {
    async createEmailTemplates(rows: Record<string, unknown>[]) {
      for (const row of rows) templates.set(String(row.id), row);
    },
    async listEmailTemplates() {
      return Array.from(templates.values());
    },
    async updateEmailTemplates(row: Record<string, unknown>) {
      templates.set(String(row.id), {
        ...templates.get(String(row.id)),
        ...row,
      });
    },
  };

  const result = await ensureStandardEmailTemplates(store);
  assert.deepEqual(result.updated_standard_template_ids, [branded.id]);
  assert.equal(templates.get(branded.id)?._publish, true);
  assert.match(
    String(templates.get(branded.id)?.html_content),
    /\{\{#if email_logo_url\}\}/,
  );
  assert.equal(
    templates.get(edited.id)?.html_content,
    "<p>Studio-authored order email</p>",
  );
});
