import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getPool } from "@ermes/db";
import {
  commerceEventEnvelopeSchema,
  type CommerceEventEnvelope,
} from "@ermes/core/events";
import { queueNames, sendJob } from "@ermes/core/queue";
import type { Json } from "./client.js";
export type DB = Pick<Pool | PoolClient, "query">;
export const stableId = (...values: string[]) =>
  createHash("sha256").update(JSON.stringify(values)).digest("hex");
export async function transaction<T>(
  run: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    const result = await run(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function connector(shop: string, db: DB = getPool()) {
  return (
    await db.query("SELECT * FROM shopify_connector WHERE shop_domain=$1", [
      shop,
    ])
  ).rows[0] as Json | undefined;
}
export async function requireConnector(shop: string) {
  const row = await connector(shop);
  if (!row?.enabled)
    throw new Error("Enable Shopify syncing in installation settings first");
  return row;
}
export async function setCursor(
  db: DB,
  shop: string,
  key: string,
  cursor: Json,
) {
  await db.query(
    "UPDATE shopify_connector SET cursors=jsonb_set(cursors,ARRAY[$2]::text[],$3::jsonb),updated_at=now() WHERE shop_domain=$1",
    [shop, key, JSON.stringify(cursor)],
  );
}
export async function persistEvent(db: DB, event: CommerceEventEnvelope) {
  const envelope = commerceEventEnvelopeSchema.parse(event);
  await db.query(
    "INSERT INTO commerce_event(event_id,event_type,payload,source) VALUES($1,$2,$3,'shopify') ON CONFLICT(event_id) DO NOTHING",
    [envelope.eventId, envelope.type, envelope],
  );
}
export async function flushCommerceOutbox() {
  const rows = (
    await getPool().query(
      "SELECT id FROM commerce_event WHERE source='shopify' AND processed_at IS NULL ORDER BY received_at LIMIT 200",
    )
  ).rows;
  for (const row of rows)
    await sendJob(
      queueNames.processCommerceEvent,
      { commerceEventId: row.id },
      {
        singletonKey: String(row.id),
        singletonSeconds: 60,
        retryLimit: 10,
        retryDelay: 30,
        retryBackoff: true,
      },
    );
}
export async function acceptEvent(event: CommerceEventEnvelope) {
  await persistEvent(getPool(), event);
  // The worker also drains this durable outbox after a process crash or queue outage.
  await flushCommerceOutbox();
}
export function date(value: unknown, fallback?: Date): Date | undefined {
  if (typeof value !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(value))
    return fallback;
  const result = new Date(value);
  return Number.isFinite(result.getTime()) ? result : fallback;
}
export const emailOf = (value: unknown) =>
  typeof value === "string" &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) &&
  value.length <= 320
    ? value.trim().toLowerCase()
    : null;
export const gid = (kind: string, value: unknown): string | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
  const text = String(value);
  return /^\d+$/.test(text)
    ? `gid://shopify/${kind}/${text}`
    : new RegExp(`^gid://shopify/${kind}/\\d+$`).test(text)
      ? text
      : null;
};
