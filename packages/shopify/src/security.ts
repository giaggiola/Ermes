import { createHmac, timingSafeEqual } from "node:crypto";
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function verifyWebhook(body: Buffer, signature: string, secret: string) {
  if (!secret || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  return same(
    createHmac("sha256", secret).update(body).digest("base64"),
    signature,
  );
}
export function verifyAppProxy(
  params: URLSearchParams,
  secret: string,
  shop: string,
  now = Date.now(),
) {
  if (
    !secret ||
    params.getAll("signature").length !== 1 ||
    params.getAll("timestamp").length !== 1 ||
    params.getAll("shop").length !== 1 ||
    params.getAll("logged_in_customer_id").length > 1 ||
    params.get("shop") !== shop
  )
    return false;
  const timestamp = params.get("timestamp") ?? "";
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  const keys = [...new Set(params.keys())]
    .filter((k) => k !== "signature")
    .sort();
  const canonical = keys
    .map((k) => `${k}=${params.getAll(k).join(",")}`)
    .join("");
  const signature = params.get("signature") ?? "";
  return (
    /^[a-f0-9]{64}$/.test(signature) &&
    same(
      createHmac("sha256", secret).update(canonical).digest("hex"),
      signature,
    )
  );
}
export function opaqueKey(purpose: string, value: string) {
  const secret = process.env.PREFERENCE_TOKEN_SECRET;
  if (!secret) throw new Error("PREFERENCE_TOKEN_SECRET is required");
  return createHmac("sha256", secret)
    .update(`${purpose}:${value}`)
    .digest("hex");
}
export function identityToken(id: string, now = Date.now()) {
  const value = `${id}.${Math.floor(now / 1000) + 7 * 86400}`;
  return `${value}.${opaqueKey("shopify-recovery", value)}`;
}
export function identityId(token: string | undefined, now = Date.now()) {
  const match = token?.match(/^([a-f0-9]{64})\.(\d+)\.([a-f0-9]{64})$/);
  if (!match || Number(match[2]) < now / 1000) return null;
  return same(
    opaqueKey("shopify-recovery", `${match[1]}.${match[2]}`),
    match[3],
  )
    ? match[1]
    : null;
}
export function cartKey(shop: string, token: unknown) {
  if (typeof token !== "string") return null;
  const publicPart = token.split("?", 1)[0].trim();
  return publicPart && publicPart.length <= 512
    ? opaqueKey("shopify-cart", `${shop}:${publicPart}`)
    : null;
}
