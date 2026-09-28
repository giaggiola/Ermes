import { NextResponse, type NextRequest } from "next/server";

import { createDefaultSignupForm, type SignupFormType } from "@ermes/core/signup-form-schema";
import { getMessagingService } from "@ermes/db";

import { handleRouteError, parseBody } from "@/lib/http";
import { enforcePublicRateLimit } from "@/lib/public-security";

export const dynamic = "force-dynamic";

function resolveType(value: string | null): SignupFormType {
  return value === "flyout" ||
    value === "embedded" ||
    value === "full-page"
    ? value
    : "popup";
}

// Served to storefront adapters (server-to-server, no CORS). Returns the
// published form of the requested type. `overlay` selects the latest published
// popup or flyout. Callers can opt out of the built-in fallback when a draft
// form must never appear on a live storefront.
export async function GET(request: NextRequest) {
  try {
    const requestedType = request.nextUrl.searchParams.get("type");
    const type = resolveType(requestedType);
    const allowFallback =
      request.nextUrl.searchParams.get("fallback") !== "false";
    const service = getMessagingService();
    const form =
      requestedType === "overlay"
        ? await service.getActiveOverlaySignupForm()
        : await service.getActiveSignupForm(type);

    if (!form) {
      if (!allowFallback) {
        return NextResponse.json({ form: null });
      }
      return NextResponse.json({
        form: { id: null, type, name: "Default", document: createDefaultSignupForm() },
      });
    }

    return NextResponse.json({
      form: {
        id: form.id,
        type: form.type,
        name: form.name,
        document: form.document,
        version_id: form.version_id,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

// Impression beacon: the storefront calls this (via its own BFF) when the form is
// actually shown, so submit-rate can be computed. No-op for the default form (no id).
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await enforcePublicRateLimit(request, "impression");
    if (rateLimited) return rateLimited;
    const body = await parseBody(request);
    const formId = typeof body.form_id === "string" ? body.form_id : "";
    if (formId) {
      await getMessagingService().incrementSignupFormCounter(formId, "impressions");
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
