import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { normalizeEmail } from "./validation.js";

export interface OpsAdminSignatureInput {
  actorEmail: string;
  body: Buffer | string;
  method: string;
  pathAndQuery: string;
  secret: string;
  timestamp: string;
}

export function createOpsAdminSignature(input: OpsAdminSignatureInput): string {
  const digest = createHmac("sha256", input.secret)
    .update(canonicalOpsAdminRequest(input))
    .digest("hex");
  return `v1=${digest}`;
}

export function canonicalOpsAdminRequest(input: OpsAdminSignatureInput): string {
  const bodyHash = createHash("sha256").update(input.body).digest("hex");
  return [
    "v1",
    input.timestamp,
    input.method.toUpperCase(),
    input.pathAndQuery,
    normalizeEmail(input.actorEmail),
    bodyHash,
  ].join("\n");
}

export function verifyOpsAdminSignature(
  input: OpsAdminSignatureInput & { maxAgeSeconds?: number; signature: string },
): boolean {
  if (
    !input.secret ||
    !input.timestamp ||
    !input.signature ||
    !input.actorEmail ||
    !input.pathAndQuery.startsWith("/")
  ) {
    return false;
  }
  const timestampMs = Number(input.timestamp) * 1000;
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > (input.maxAgeSeconds ?? 300) * 1000
  ) {
    return false;
  }
  const expected = createOpsAdminSignature(input);
  const actualBytes = Buffer.from(input.signature);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}
