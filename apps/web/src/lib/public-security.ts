import { NextResponse, type NextRequest } from "next/server";

import { hashRateLimitKey, normalizeEmail } from "@ermes/core";
import { getMessagingService } from "@ermes/db";

type RateProfile =
  "impression" | "preference-link" | "subscribe" | "token-mutation" | "watch";

const profiles: Record<
  RateProfile,
  {
    email?: { limit: number; windowSeconds: number };
    ip: { limit: number; windowSeconds: number };
  }
> = {
  impression: { ip: { limit: 120, windowSeconds: 60 * 60 } },
  "preference-link": {
    email: { limit: 3, windowSeconds: 60 * 60 },
    ip: { limit: 10, windowSeconds: 15 * 60 },
  },
  subscribe: {
    email: { limit: 3, windowSeconds: 60 * 60 },
    ip: { limit: 10, windowSeconds: 15 * 60 },
  },
  "token-mutation": { ip: { limit: 20, windowSeconds: 60 * 60 } },
  watch: {
    email: { limit: 3, windowSeconds: 60 * 60 },
    ip: { limit: 10, windowSeconds: 15 * 60 },
  },
};

export async function enforcePublicRateLimit(
  request: NextRequest,
  profile: RateProfile,
  targetEmail?: string,
): Promise<NextResponse | null> {
  return enforcePublicRateLimitIdentity(profile, {
    clientIp: clientIp(request),
    targetEmail,
  });
}

export async function enforcePublicRateLimitIdentity(
  profile: RateProfile,
  identity: {
    clientIp: string;
    targetEmail?: string;
  },
): Promise<NextResponse | null> {
  const secret = process.env.PREFERENCE_TOKEN_SECRET;
  if (!secret) {
    return process.env.NODE_ENV === "production"
      ? NextResponse.json(
          { message: "Service temporarily unavailable" },
          { status: 503 },
        )
      : null;
  }
  const service = getMessagingService();
  const config = profiles[profile];
  const checks = [
    service.consumePublicRateLimit({
      action: `${profile}:ip`,
      keyHash: hashRateLimitKey(secret, "ip", identity.clientIp),
      ...config.ip,
    }),
  ];
  if (config.email && identity.targetEmail) {
    checks.push(
      service.consumePublicRateLimit({
        action: `${profile}:email`,
        keyHash: hashRateLimitKey(
          secret,
          "email",
          normalizeEmail(identity.targetEmail),
        ),
        ...config.email,
      }),
    );
  }
  const results = await Promise.all(checks);
  const rejected = results.find((result) => !result.allowed);
  if (!rejected) {
    return null;
  }
  return NextResponse.json(
    { message: "Too many requests. Please try again later." },
    {
      headers: { "retry-after": String(rejected.retryAfterSeconds) },
      status: 429,
    },
  );
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
