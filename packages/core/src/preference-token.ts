import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizeEmail } from "./validation.js";

export type PreferenceTokenPurpose = "preferences" | "unsubscribe" | "watch";

export interface PreferenceTokenClaims {
  email: string;
  exp: number;
  iat: number;
  purpose: PreferenceTokenPurpose;
  v: 1;
  watchId?: string;
}

export function buildUnsubscribeUrls(input: {
  appUrl: string;
  token: string;
}): {
  confirmationUrl: string;
  oneClickUrl: string;
} {
  const confirmationUrl = new URL("/unsubscribe", input.appUrl);
  confirmationUrl.searchParams.set("token", input.token);
  const oneClickUrl = new URL("/api/store/email-unsubscribe", input.appUrl);
  oneClickUrl.searchParams.set("token", input.token);
  return {
    confirmationUrl: confirmationUrl.toString(),
    oneClickUrl: oneClickUrl.toString(),
  };
}

export function buildStorefrontUnsubscribeUrls(input: {
  storefrontUrl: string;
  token: string;
}): {
  confirmationUrl: string;
  oneClickUrl: string;
} {
  const url = new URL(
    `/apps/eilish/unsubscribe/${encodeURIComponent(input.token)}`,
    input.storefrontUrl,
  ).toString();
  return { confirmationUrl: url, oneClickUrl: url };
}

export function createPreferenceToken(input: {
  email: string;
  expiresInSeconds?: number;
  issuedAt?: number;
  purpose: PreferenceTokenPurpose;
  secret: string;
  watchId?: string;
}): string {
  if (!input.secret) {
    throw new Error("Preference token secret is required");
  }
  const iat = input.issuedAt ?? Math.floor(Date.now() / 1000);
  const claims: PreferenceTokenClaims = {
    email: normalizeEmail(input.email),
    exp: iat + (input.expiresInSeconds ?? 365 * 24 * 60 * 60),
    iat,
    purpose: input.purpose,
    v: 1,
    ...(input.watchId ? { watchId: input.watchId } : {}),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload, input.secret)}`;
}

export function verifyPreferenceToken(input: {
  now?: number;
  previousSecret?: string;
  purpose: PreferenceTokenPurpose;
  secret: string;
  token: string;
}): PreferenceTokenClaims | null {
  if (!input.secret || !input.token) {
    return null;
  }
  const [payload, signature, extra] = input.token.split(".");
  if (!payload || !signature || extra) {
    return null;
  }

  const secrets = [input.secret, input.previousSecret].filter(
    (value): value is string => Boolean(value),
  );
  if (!secrets.some((secret) => safeEqual(signature, sign(payload, secret)))) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<PreferenceTokenClaims>;
    const now = input.now ?? Math.floor(Date.now() / 1000);
    if (
      parsed.v !== 1 ||
      parsed.purpose !== input.purpose ||
      typeof parsed.email !== "string" ||
      normalizeEmail(parsed.email) !== parsed.email ||
      typeof parsed.iat !== "number" ||
      typeof parsed.exp !== "number" ||
      parsed.iat > now + 300 ||
      parsed.exp < now ||
      parsed.exp <= parsed.iat
    ) {
      return null;
    }
    return parsed as PreferenceTokenClaims;
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`preference-token.v1.${payload}`)
    .digest("base64url");
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}
