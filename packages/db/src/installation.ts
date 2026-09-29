import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  seal,
  unseal,
  hashPassword,
  verifyPassword,
} from "@ermes/core/secret-box";
import {
  merchantSettingsSchema,
  EmailDeliveryDisabledError,
  integrationInputSchema,
  type InstallationStatus,
} from "@ermes/core/installation";
import { getPool } from "./client.js";
import { getMessagingService } from "./service.js";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const credentialKeys = [
  "resendApiKey",
  "resendWebhookSecret",
  "cloudinaryCloudName",
  "cloudinaryApiKey",
  "cloudinaryApiSecret",
  "shopifyClientId",
  "shopifyClientSecret",
] as const;

export async function installationRow() {
  const { rows } = await getPool().query(
    "SELECT * FROM ermes_installation WHERE id=1",
  );
  if (!rows[0]) throw new Error("Installation migration has not completed");
  return rows[0];
}
export async function installationStatus(): Promise<InstallationStatus> {
  const row = await installationRow();
  const state = (
    await getPool().query(
      "SELECT * FROM shopify_connector WHERE shop_domain=$1",
      [row.shop_domain],
    )
  ).rows[0];
  const counts = state
    ? (
        await getPool().query(
          "SELECT kind,count(*)::int AS count FROM shopify_object WHERE shop_domain=$1 GROUP BY kind",
          [row.shop_domain],
        )
      ).rows
    : [];
  const jobs = state
    ? (
        await getPool().query(
          "SELECT count(*) FILTER(WHERE state='pending')::int AS pending,count(*) FILTER(WHERE state='pending' AND attempts>0)::int AS failed FROM shopify_webhook WHERE shop_domain=$1",
          [row.shop_domain],
        )
      ).rows[0]
    : null;
  const commands = state
    ? (
        await getPool().query(
          "SELECT count(*)::int AS failed FROM shopify_command WHERE shop_domain=$1 AND state='pending' AND attempts>0",
          [row.shop_domain],
        )
      ).rows[0]
    : null;
  return {
    merchant: row.merchant,
    credentials: Object.fromEntries(
      credentialKeys.map((key) => [key, Boolean(row.credentials[key])]),
    ),
    shopDomain: row.shop_domain,
    deliveryEnabled: row.delivery_enabled,
    shopifyVerifiedAt: row.shopify_verified_at?.toISOString() ?? null,
    shopifyConnectorActive: Boolean(state?.enabled),
    shopifySync: state
      ? {
          counts: Object.fromEntries(counts.map((r) => [r.kind, r.count])),
          completed: ["customers", "products", "orders"].filter(
            (k) => state.cursors[k]?.completedAt,
          ),
          pendingWebhooks: jobs.pending,
          failedJobs: jobs.failed + commands.failed,
          lastWebhookAt: state.last_webhook_at?.toISOString() ?? null,
          lastSyncAt: state.last_sync_at?.toISOString() ?? null,
          lastRecoveryAt: state.last_recovery_at?.toISOString() ?? null,
          error: state.last_error,
        }
      : null,
  };
}
export async function saveMerchant(input: unknown) {
  const merchant = merchantSettingsSchema.parse(input);
  await getPool().query(
    "UPDATE ermes_installation SET merchant=$1, updated_at=now() WHERE id=1",
    [merchant],
  );
  await getMessagingService().updateRuntimeSettings({
    emailFrom: merchant.senderEmail,
    emailSenderName: merchant.senderName,
    emailLogoUrl: merchant.logoUrl,
  });
  return installationStatus();
}
export async function saveIntegrations(input: unknown) {
  const parsed = integrationInputSchema.parse(input);
  if (parsed.shopDomain) {
    const previous = await installationRow();
    if (
      previous.shop_domain &&
      parsed.shopDomain !== previous.shop_domain &&
      (await getPool().query("SELECT 1 FROM shopify_connector LIMIT 1"))
        .rowCount
    )
      throw new Error(
        "This installation is linked to one store. Use a separate Ermes installation for another store.",
      );
  }
  const credentials: Record<string, string> = {};
  for (const key of credentialKeys)
    if (parsed[key]) credentials[key] = seal(parsed[key], key);
  await getPool().query(
    "UPDATE ermes_installation SET credentials=credentials || $1::jsonb, shop_domain=COALESCE($2,shop_domain), shopify_verified_at=CASE WHEN $3 THEN NULL ELSE shopify_verified_at END, updated_at=now() WHERE id=1",
    [
      JSON.stringify(credentials),
      parsed.shopDomain ?? null,
      Object.keys(parsed).some((key) => key.startsWith("shop")),
    ],
  );
  return installationStatus();
}
export async function getCredential(key: (typeof credentialKeys)[number]) {
  const row = await installationRow();
  return row.credentials[key] ? unseal(row.credentials[key], key) : undefined;
}
export async function deliveryCredentials() {
  const row = await installationRow();
  if (!row.delivery_enabled) throw new EmailDeliveryDisabledError();
  const apiKey = row.credentials.resendApiKey
    ? unseal(row.credentials.resendApiKey, "resendApiKey")
    : process.env.RESEND_API_KEY;
  if (!apiKey || !row.merchant?.senderEmail)
    throw new Error(
      "Configure the email provider and sender before enabling delivery",
    );
  return { apiKey };
}
export async function hasAdmin() {
  return Boolean(
    (await getPool().query("SELECT 1 FROM ermes_admin LIMIT 1")).rowCount,
  );
}
export async function createFirstAdmin(email: string, password: string) {
  const encoded = await hashPassword(password),
    client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(98124704)");
    if ((await client.query("SELECT 1 FROM ermes_admin LIMIT 1")).rowCount)
      throw new Error("Setup is already complete");
    const id = randomUUID();
    await client.query(
      "INSERT INTO ermes_admin(id,email,password_hash) VALUES($1,$2,$3)",
      [id, email.toLowerCase(), encoded],
    );
    await client.query("COMMIT");
    return createSession(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function login(email: string, password: string) {
  const key = digest(email.toLowerCase());
  const attempts = await getPool().query(
    `INSERT INTO ermes_login_attempt(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ermes_login_attempt.window_start < now()-interval '15 minutes' THEN 1 ELSE ermes_login_attempt.count+1 END, window_start=CASE WHEN ermes_login_attempt.window_start < now()-interval '15 minutes' THEN now() ELSE ermes_login_attempt.window_start END RETURNING count`,
    [key],
  );
  if (attempts.rows[0].count > 10)
    throw new Error("Too many attempts. Try again in 15 minutes.");
  const row = (
    await getPool().query(
      "SELECT id,password_hash FROM ermes_admin WHERE email=$1",
      [email.toLowerCase()],
    )
  ).rows[0];
  const valid = await verifyPassword(
    password,
    row?.password_hash ?? `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`,
  );
  if (!row || !valid) throw new Error("Email or password is incorrect");
  await getPool().query("DELETE FROM ermes_login_attempt WHERE key=$1", [key]);
  return createSession(row.id);
}
async function createSession(adminId: string) {
  const token = randomBytes(32).toString("base64url");
  await getPool().query("DELETE FROM ermes_session WHERE expires_at < now()");
  await getPool().query(
    "INSERT INTO ermes_session(token_hash,admin_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [digest(token), adminId],
  );
  return token;
}
export async function sessionAdmin(token: string | undefined) {
  if (!token || !/^[\w-]{43}$/.test(token)) return null;
  const { rows } = await getPool().query(
    "SELECT a.id,a.email FROM ermes_session s JOIN ermes_admin a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [digest(token)],
  );
  return rows[0] as { id: string; email: string } | undefined;
}
export async function revokeSession(token: string) {
  await getPool().query("DELETE FROM ermes_session WHERE token_hash=$1", [
    digest(token),
  ]);
}
