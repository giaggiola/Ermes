import { createHmac } from "node:crypto";

export function hashRateLimitKey(secret: string, kind: "email" | "ip", value: string): string {
  if (!secret) {
    throw new Error("Rate-limit hashing secret is required");
  }
  return createHmac("sha256", secret)
    .update(`public-rate-limit.v1.${kind}.`)
    .update(value.trim().toLowerCase())
    .digest("hex");
}
