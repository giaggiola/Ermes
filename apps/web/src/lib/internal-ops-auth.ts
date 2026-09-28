import { NextResponse, type NextRequest } from "next/server";

import {
  isValidEmail,
  normalizeEmail,
  verifyOpsAdminSignature,
} from "@ermes/core";

export type InternalOpsAuthResult =
  | { actorEmail: string; ok: true; requestId: string }
  | { ok: false; response: NextResponse };

export async function authenticateInternalOpsRequest(
  request: NextRequest,
): Promise<InternalOpsAuthResult> {
  const secret = process.env.OPS_MESSAGING_SHARED_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Internal admin API unavailable" },
        { status: 503 },
      ),
    };
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 2 * 1024 * 1024) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Request body too large" },
        { status: 413 },
      ),
    };
  }

  const actorEmail = normalizeEmail(
    request.headers.get("x-ops-actor-email") ?? "",
  );
  const requestId = request.headers.get("x-request-id") ?? "";
  const timestamp = request.headers.get("x-ops-timestamp") ?? "";
  const signature = request.headers.get("x-ops-signature") ?? "";
  const rawBody = await request.clone().text();
  if (Buffer.byteLength(rawBody) > 2 * 1024 * 1024) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Request body too large" },
        { status: 413 },
      ),
    };
  }

  if (
    !isValidEmail(actorEmail) ||
    !requestId ||
    requestId.length > 128 ||
    !verifyOpsAdminSignature({
      actorEmail,
      body: rawBody,
      maxAgeSeconds: 300,
      method: request.method,
      pathAndQuery: `${request.nextUrl.pathname}${request.nextUrl.search}`,
      secret,
      signature,
      timestamp,
    })
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Invalid internal authentication" },
        { status: 401 },
      ),
    };
  }

  return { actorEmail, ok: true, requestId };
}
