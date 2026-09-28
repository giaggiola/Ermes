import { NextResponse, type NextRequest } from "next/server";

import { getMessagingService } from "@ermes/db";

import { handleRouteError, parseBody, redirectOrJson } from "@/lib/http";
import { enforcePublicRateLimit } from "@/lib/public-security";
import { resolveUnsubscribeEmail } from "@/lib/unsubscribe-token";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token") ?? "";
    return NextResponse.json({
      valid: Boolean(await resolveUnsubscribeEmail(token)),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request);
    const queryToken = request.nextUrl.searchParams.get("token");
    const token =
      queryToken ?? (typeof body.token === "string" ? body.token : "");
    const email = await resolveUnsubscribeEmail(token);

    if (!email) {
      const payload = { status: "link-invalid", success: true };
      return queryToken
        ? NextResponse.json(payload)
        : redirectOrJson(request, payload, "/unsubscribe");
    }

    const rateLimited = await enforcePublicRateLimit(request, "token-mutation");
    if (rateLimited) return rateLimited;
    await getMessagingService().unsubscribe(email);

    const payload = {
      status: "unsubscribed",
      success: true,
    };
    return queryToken
      ? NextResponse.json(payload)
      : redirectOrJson(request, payload, "/unsubscribe");
  } catch (error) {
    return handleRouteError(error);
  }
}
