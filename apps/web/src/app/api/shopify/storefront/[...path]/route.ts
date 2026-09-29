import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  loadShopifyCredentials,
  ShopifyClient,
  verifyAppProxy,
  requireConnector,
  storefrontForm,
  storefrontEvent,
  storefrontSubscribe,
  identifyCart,
  StorefrontError,
} from "@ermes/shopify";
import { boundedBody } from "@/lib/bounded-body";
import { enforcePublicRateLimit } from "@/lib/public-security";
export const dynamic = "force-dynamic";
const identity = z.object({
  cart_token: z.string().min(1).max(1024),
  identity_token: z.string().max(150).nullable().optional(),
  marketing_allowed: z.boolean(),
});
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const credentials = await loadShopifyCredentials();
    if (
      !verifyAppProxy(
        request.nextUrl.searchParams,
        credentials.clientSecret,
        credentials.shop,
      )
    )
      return NextResponse.json(
        { detail: "Invalid Shopify signature" },
        { status: 401 },
      );
    const path = (await context.params).path.join("/");
    const input = JSON.parse(
      (await boundedBody(request, 16384)).toString("utf8"),
    );
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new StorefrontError("Invalid request");
    if (input.preview_token)
      throw new StorefrontError(
        "Use the preview in the Ermes form editor.",
        409,
      );
    const rate = await enforcePublicRateLimit(
      request,
      path === "newsletter/subscribe" ? "subscribe" : "impression",
      typeof input.email === "string" ? input.email : undefined,
    );
    if (rate) return rate;
    await requireConnector(credentials.shop);
    let result: unknown;
    if (path === "signup-form") result = await storefrontForm(credentials.shop);
    else if (path === "newsletter/subscribe")
      result = await storefrontSubscribe(credentials.shop, input);
    else if (path === "newsletter/event")
      result = await storefrontEvent(credentials.shop, input);
    else if (path === "recovery/identify") {
      const parsed = identity.safeParse(input);
      if (!parsed.success)
        throw new StorefrontError("Invalid cart identification request");
      result = await identifyCart(
        new ShopifyClient(credentials),
        {
          ...parsed.data,
          identity_token: parsed.data.identity_token ?? undefined,
        },
        request.nextUrl.searchParams.get("logged_in_customer_id"),
      );
    } else
      return NextResponse.json(
        { detail: "Unknown storefront endpoint" },
        { status: 404 },
      );
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const status =
      error instanceof StorefrontError
        ? error.status
        : error instanceof SyntaxError
          ? 400
          : error instanceof Error && error.message === "Request too large"
            ? 413
            : 503;
    return NextResponse.json(
      {
        detail:
          error instanceof StorefrontError
            ? error.message
            : "Storefront service is temporarily unavailable.",
      },
      { status },
    );
  }
}
