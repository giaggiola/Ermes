import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getMessagingService, installationRow } from "@ermes/db";
import { isDisposableEmail, isValidEmail } from "@ermes/core/validation";
import { opaqueKey } from "./security.js";
import { bindCart } from "./recovery.js";
import {
  transaction,
  stableId,
  persistEvent,
  requireConnector,
} from "./store.js";
import type { Json } from "./client.js";

export class StorefrontError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
function formToken(shop: string, id: string, version: string, expires: number) {
  return `${expires}.${opaqueKey("shopify-form", JSON.stringify([shop, id, version, expires]))}`;
}
export async function storefrontForm(shop: string) {
  await requireConnector(shop);
  const form = await getMessagingService().getActiveOverlaySignupForm();
  if (!form) return { form: null };
  return {
    form: {
      id: form.id,
      type: form.type,
      name: form.name,
      document: form.document,
      version_id: form.version_id,
      analytics_token: formToken(
        shop,
        String(form.id),
        String(form.version_id),
        Math.floor(Date.now() / 1000) + 86400,
      ),
    },
  };
}
async function validateForm(shop: string, input: Json) {
  const form = await getMessagingService().getActiveOverlaySignupForm();
  if (
    !form ||
    form.id !== input.form_id ||
    form.version_id !== input.form_version_id
  )
    throw new StorefrontError(
      "This form changed. Reload the page and try again.",
      409,
    );
  const token =
    typeof input.analytics_token === "string" ? input.analytics_token : "";
  const match = token.match(/^(\d+)\.([a-f0-9]{64})$/);
  const expected = match
    ? formToken(shop, input.form_id, input.form_version_id, Number(match[1]))
    : "";
  if (
    !match ||
    Number(match[1]) < Date.now() / 1000 ||
    token.length !== expected.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    throw new StorefrontError(
      "Form session expired. Reload the page and try again.",
      409,
    );
  return form;
}
const submissionSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  first_name: z.string().trim().max(100).optional(),
  consent: z.literal(true),
  form_id: z.string().max(100),
  form_version_id: z.string().max(100),
  analytics_token: z.string().max(150),
  analytics_event_id: z.string().min(8).max(100),
  recovery_allowed: z.boolean().optional(),
  recovery_cart_token: z.string().max(1024).optional(),
});
export async function storefrontSubscribe(shop: string, input: unknown) {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success)
    throw new StorefrontError(
      "Enter a valid email and agree to receive marketing emails.",
    );
  const p = parsed.data;
  if (!isValidEmail(p.email, true) || isDisposableEmail(p.email))
    throw new StorefrontError("Please use a valid email address.");
  await requireConnector(shop);
  await validateForm(shop, p);
  const settings = await installationRow();
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `shopify-subscriber:${p.email}`,
    ]);
    const event = await db.query(
      "INSERT INTO shopify_form_event(id,form_id,event_type) VALUES($1,$2,'submitted') ON CONFLICT DO NOTHING RETURNING id",
      [stableId(shop, p.form_id, p.analytics_event_id, "submitted"), p.form_id],
    );
    if (!event.rowCount) return { success: true, already_subscribed: true };
    const previous = (
      await db.query(
        "SELECT * FROM email_subscriber WHERE email=$1 AND deleted_at IS NULL FOR UPDATE",
        [p.email],
      )
    ).rows[0];
    const now = new Date(),
      id = previous?.id ?? `emsub_${randomUUID().replaceAll("-", "")}`;
    const welcome = !previous?.subscribed;
    if (!previous)
      await db.query(
        "INSERT INTO email_subscriber(id,email,first_name,subscribed,subscribed_at,subscription_source) VALUES($1,$2,$3,true,$4,'storefront-form')",
        [id, p.email, p.first_name ?? null, now],
      );
    else
      await db.query(
        "UPDATE email_subscriber SET subscribed=true,subscribed_at=CASE WHEN subscribed THEN subscribed_at ELSE $2 END,unsubscribed_at=NULL,first_name=COALESCE($3,first_name),updated_at=$2 WHERE id=$1",
        [id, now, p.first_name ?? null],
      );
    await db.query(
      "UPDATE message_suppression SET active=false WHERE email=$1 AND reason='unsubscribe' AND channel='email'",
      [p.email],
    );
    await db.query(
      "INSERT INTO email_consent_event(email,action,source,occurred_at,metadata) VALUES($1,'subscribed','storefront-form',$2,$3)",
      [
        p.email,
        now,
        { form_id: p.form_id, form_version_id: p.form_version_id },
      ],
    );
    if (welcome) {
      await persistEvent(db, {
        source: "shopify",
        type: "newsletter.subscribed",
        eventId: `newsletter.subscribed:${id}:${now.toISOString()}`,
        occurredAt: now.toISOString(),
        context: { email: p.email },
        payload: {
          subscription_recorded: true,
          email: p.email,
          first_name: p.first_name ?? "",
          subscribed_at: now.toISOString(),
          store_name: settings.merchant?.storeName ?? "",
          store_url: settings.merchant?.storefrontUrl ?? `https://${shop}`,
        },
      });
    }
    await db.query("UPDATE signup_form SET submitted=submitted+1 WHERE id=$1", [
      p.form_id,
    ]);
    const token =
      p.recovery_allowed && p.recovery_cart_token
        ? await bindCart(db, shop, p.recovery_cart_token, p.email)
        : null;
    return {
      success: true,
      already_subscribed: !welcome,
      ...(token ? { recovery_identity_token: token } : {}),
    };
  });
}
const eventSchema = z.object({
  form_id: z.string().max(100),
  form_version_id: z.string().max(100),
  analytics_token: z.string().max(150),
  event_id: z.string().min(8).max(100),
  event_type: z.enum([
    "viewed",
    "eligible",
    "clicked",
    "dismissed",
    "validation_failed",
    "submit_failed",
  ]),
  analytics_allowed: z.boolean(),
});
export async function storefrontEvent(shop: string, input: unknown) {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) throw new StorefrontError("Invalid form event");
  const p = parsed.data;
  if (!p.analytics_allowed || p.event_type !== "viewed")
    return { success: true };
  await requireConnector(shop);
  await validateForm(shop, p);
  await transaction(async (db) => {
    const inserted = await db.query(
      "INSERT INTO shopify_form_event(id,form_id,event_type) VALUES($1,$2,'viewed') ON CONFLICT DO NOTHING RETURNING id",
      [stableId(shop, p.form_id, p.event_id, "viewed"), p.form_id],
    );
    if (inserted.rowCount)
      await db.query(
        "UPDATE signup_form SET impressions=impressions+1 WHERE id=$1",
        [p.form_id],
      );
  });
  return { success: true };
}
