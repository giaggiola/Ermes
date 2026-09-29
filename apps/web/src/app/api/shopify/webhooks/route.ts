import { NextResponse, type NextRequest } from "next/server";
import { receiveWebhook } from "@ermes/shopify";
import { boundedBody } from "@/lib/bounded-body";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      await receiveWebhook(
        await boundedBody(request, 2 * 1024 * 1024),
        request.headers,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("signature")
      ? 401
      : message.includes("too large")
        ? 413
        : message.includes("payload") || message.includes("event ID")
          ? 400
          : 503;
    return NextResponse.json(
      {
        message:
          status === 401
            ? "Invalid Shopify signature"
            : "Could not accept Shopify event",
      },
      { status },
    );
  }
}
