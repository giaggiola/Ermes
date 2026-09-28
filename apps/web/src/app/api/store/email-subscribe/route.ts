import { NextResponse, type NextRequest } from "next/server";

import { normalizeEmail } from "@ermes/core/validation";

import { handleRouteError, parseBody } from "@/lib/http";
import { subscribeToNewsletter } from "@/lib/newsletter-subscribe";
import { enforcePublicRateLimit } from "@/lib/public-security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request);
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";

    const rateLimited = await enforcePublicRateLimit(request, "subscribe", email);
    if (rateLimited) return rateLimited;

    return NextResponse.json(
      await subscribeToNewsletter({
        email,
        first_name:
          typeof body.first_name === "string" ? body.first_name : undefined,
        form_id: typeof body.form_id === "string" ? body.form_id : undefined,
        source: typeof body.source === "string" ? body.source : "popup",
      }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
