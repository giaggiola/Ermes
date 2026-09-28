import { createHmac, timingSafeEqual } from "node:crypto";

const signatureVersion = "v1";

type Body = Buffer | string;

export interface CreateSignatureInput {
  body: Body;
  secret: string;
  timestamp: string;
}

export interface VerifySignatureInput extends CreateSignatureInput {
  maxAgeSeconds?: number;
  signature: string;
}

export function createEilishSignature(input: CreateSignatureInput): string {
  const digest = createHmac("sha256", input.secret)
    .update(`${input.timestamp}.`)
    .update(input.body)
    .digest("hex");

  return `${signatureVersion}=${digest}`;
}

export function verifyEilishSignature(input: VerifySignatureInput): boolean {
  if (!input.secret || !input.signature || !input.timestamp) {
    return false;
  }

  if (input.maxAgeSeconds !== undefined && isStaleTimestamp(input.timestamp, input.maxAgeSeconds)) {
    return false;
  }

  const expected = createEilishSignature(input);
  const actualDigest = parseSignature(input.signature);
  const expectedDigest = parseSignature(expected);

  if (!actualDigest || !expectedDigest || actualDigest.byteLength !== expectedDigest.byteLength) {
    return false;
  }

  return timingSafeEqual(actualDigest, expectedDigest);
}

function parseSignature(signature: string): Buffer | null {
  const digest = signature.startsWith(`${signatureVersion}=`)
    ? signature.slice(signatureVersion.length + 1)
    : signature;

  if (!/^[a-f0-9]{64}$/i.test(digest)) {
    return null;
  }

  return Buffer.from(digest, "hex");
}

function isStaleTimestamp(timestamp: string, maxAgeSeconds: number): boolean {
  const timestampMs = Number(timestamp) * 1000;

  if (!Number.isFinite(timestampMs)) {
    return true;
  }

  return Math.abs(Date.now() - timestampMs) > maxAgeSeconds * 1000;
}
