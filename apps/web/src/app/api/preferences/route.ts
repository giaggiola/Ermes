import { NextResponse, type NextRequest } from "next/server";

import { verifyPreferenceToken } from "@ermes/core";
import { getMessagingService } from "@ermes/db";

import { handleRouteError, parseBody, redirectOrJson } from "@/lib/http";
import { enforcePublicRateLimit } from "@/lib/public-security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const claims = readToken(request.nextUrl.searchParams.get("token") ?? "");
  if (!claims) {
    return NextResponse.json({ valid: false });
  }

  const subscribers = await getMessagingService().listEmailSubscribers({
    email: claims.email,
  });
  const subscriber = subscribers[0] ?? null;

  return NextResponse.json({
    marketing_email: subscriber ? subscriber.subscribed !== false : false,
    valid: true,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request);
    const token = typeof body.token === "string" ? body.token : "";
    const claims = readToken(token);
    const marketingEmail =
      body.marketing_email === "true" ||
      body.marketing_email === true ||
      body.marketing_email === "on";

    if (!claims) {
      return redirectOrJson(
        request,
        { status: "link-invalid", success: true },
        "/preferences",
      );
    }

    const rateLimited = await enforcePublicRateLimit(request, "token-mutation");
    if (rateLimited) return rateLimited;
    const service = getMessagingService();
    if (marketingEmail) {
      await service.subscribe(claims.email, { source: "preferences" });
    } else {
      await service.unsubscribe(claims.email);
    }

    return redirectOrJson(
      request,
      {
        status: "saved",
        success: true,
      },
      "/preferences",
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

function readToken(token: string) {
  return verifyPreferenceToken({
    previousSecret: process.env.PREFERENCE_TOKEN_PREVIOUS_SECRET,
    purpose: "preferences",
    secret: process.env.PREFERENCE_TOKEN_SECRET ?? "",
    token,
  });
}
