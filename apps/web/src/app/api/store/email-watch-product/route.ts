import { NextResponse, type NextRequest } from "next/server";

import { verifyPreferenceToken } from "@ermes/core";
import {
  isDisposableEmail,
  isValidEmail,
  normalizeEmail,
} from "@ermes/core/validation";
import { getMessagingService } from "@ermes/db";

import { handleRouteError, parseBody } from "@/lib/http";
import { enforcePublicRateLimit } from "@/lib/public-security";

export const dynamic = "force-dynamic";

const alertTypes = new Set(["back-in-stock", "price-drop"]);

export async function GET(request: NextRequest) {
  const claims = readWatchToken(
    request.nextUrl.searchParams.get("token") ?? "",
  );
  if (!claims?.watchId) {
    return NextResponse.json({ watches: [] });
  }
  const watch = await getMessagingService()
    .retrieveEmailProductWatch(claims.watchId)
    .catch(() => null);
  const watches =
    watch && watch.email === claims.email && !watch.notified ? [watch] : [];

  return NextResponse.json({
    watches: watches
      .filter((watch) => !watch.notified)
      .map((watch) => ({
        alert_type: watch.alert_type,
        created_at: watch.created_at,
        id: watch.id,
        product_id: watch.product_id,
        variant_id: watch.variant_id,
      })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request);
    const email =
      typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const productId =
      typeof body.product_id === "string" ? body.product_id : "";
    const variantId =
      typeof body.variant_id === "string" && body.variant_id
        ? body.variant_id
        : null;
    const alertType =
      typeof body.alert_type === "string" ? body.alert_type : "";

    if (!email || !productId || !alertTypes.has(alertType)) {
      return NextResponse.json(
        { message: "email, product_id, and valid alert_type are required" },
        { status: 400 },
      );
    }

    if (!isValidEmail(email, true) || isDisposableEmail(email)) {
      return NextResponse.json(
        { message: "Please use a valid email address" },
        { status: 400 },
      );
    }

    const rateLimited = await enforcePublicRateLimit(request, "watch", email);
    if (rateLimited) return rateLimited;
    if (!process.env.PREFERENCE_TOKEN_SECRET) {
      return NextResponse.json(
        { message: "Service temporarily unavailable" },
        { status: 503 },
      );
    }

    const service = getMessagingService();
    const existing = await service.listEmailProductWatches({
      alert_type: alertType,
      email,
      product_id: productId,
      ...(variantId ? { variant_id: variantId } : {}),
    });
    const activeWatch = existing.find((watch) => !watch.notified);

    if (activeWatch) {
      return NextResponse.json({
        message: "Already watching this product",
        success: true,
        watch: { id: activeWatch.id },
      });
    }

    const [watch] = await service.createEmailProductWatches([
      {
        alert_type: alertType,
        currency_code:
          typeof body.currency_code === "string" ? body.currency_code : null,
        email,
        product_id: productId,
        reference_price:
          typeof body.reference_price === "number"
            ? body.reference_price
            : typeof body.reference_price === "string" && body.reference_price
              ? Number(body.reference_price)
              : null,
        variant_id: variantId,
      },
    ]);

    await service.subscribe(email, { source: `product-watch-${alertType}` });

    return NextResponse.json({
      success: true,
      watch: { id: watch.id },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const claims = readWatchToken(
      request.nextUrl.searchParams.get("token") ?? "",
    );
    if (!claims?.watchId) {
      return NextResponse.json({ success: true });
    }

    const rateLimited = await enforcePublicRateLimit(request, "token-mutation");
    if (rateLimited) return rateLimited;
    const service = getMessagingService();
    const watch = await service
      .retrieveEmailProductWatch(claims.watchId)
      .catch(() => null);
    if (watch && watch.email === claims.email) {
      await service.deleteEmailProductWatches(String(watch.id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

function readWatchToken(token: string) {
  return verifyPreferenceToken({
    previousSecret: process.env.PREFERENCE_TOKEN_PREVIOUS_SECRET,
    purpose: "watch",
    secret: process.env.PREFERENCE_TOKEN_SECRET ?? "",
    token,
  });
}
