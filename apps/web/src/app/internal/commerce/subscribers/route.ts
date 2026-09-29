import { NextResponse, type NextRequest } from "next/server";

import { verifyEilishSignature } from "@ermes/core/http-signing";

import { handleRouteError } from "@/lib/http";
import {
  newsletterSubscribeSchema,
  subscribeToNewsletter,
} from "@/lib/newsletter-subscribe";
import { enforcePublicRateLimitIdentity } from "@/lib/public-security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const secret =
      process.env.COMMERCE_EVENT_WEBHOOK_SECRET ??
      process.env.MEDUSA_EVENT_WEBHOOK_SECRET;
    if (!secret) {
      return NextResponse.json(
        { message: "COMMERCE_EVENT_WEBHOOK_SECRET is not configured" },
        { status: 503 },
      );
    }
    const rawBody = await request.text();
    if (rawBody.length > 32 * 1024) {
      return NextResponse.json(
        { message: "Subscription request is too large" },
        { status: 413 },
      );
    }
    if (
      !verifyEilishSignature({
        body: rawBody,
        maxAgeSeconds: 300,
        secret,
        signature: request.headers.get("x-eilish-signature") ?? "",
        timestamp: request.headers.get("x-eilish-timestamp") ?? "",
      })
    ) {
      return NextResponse.json(
        { message: "Invalid signature" },
        { status: 401 },
      );
    }
    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { message: "Invalid JSON body" },
        { status: 400 },
      );
    }
    const parsed = newsletterSubscribeSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid subscription details" },
        { status: 400 },
      );
    }
    const payload = parsed.data;
    const rateLimited = await enforcePublicRateLimitIdentity("subscribe", {
      clientIp: payload.client_ip ?? "unknown",
      targetEmail: payload.email,
    });
    if (rateLimited) return rateLimited;
    return NextResponse.json(await subscribeToNewsletter(payload));
  } catch (error) {
    return handleRouteError(error);
  }
}
