import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createOpsAdminSignature } from "@ermes/core";
import { authenticateBrowser } from "@/lib/session";
import * as v1 from "@/app/internal/ops/admin/v1/[...path]/route";
import * as v2 from "@/app/internal/ops/admin/v2/[...path]/route";
export const dynamic = "force-dynamic";
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const admin = await authenticateBrowser(request);
    const parts = (await context.params).path;
    const isV2 = parts[0] === "v2",
      path = isV2 ? parts.slice(1) : parts;
    const target = `/internal/ops/admin/${isV2 ? "v2" : "v1"}/${path.join("/")}${request.nextUrl.search}`;
    const body = request.method === "GET" ? "" : await request.text();
    if (Buffer.byteLength(body) > 2 * 1024 * 1024)
      return NextResponse.json(
        { message: "Request too large" },
        { status: 413 },
      );
    const timestamp = String(Math.floor(Date.now() / 1000)),
      secret = process.env.OPS_MESSAGING_SHARED_SECRET;
    if (!secret) throw new Error("Internal API signing is not configured");
    const signature = createOpsAdminSignature({
      actorEmail: admin.email,
      body,
      method: request.method,
      pathAndQuery: target,
      secret,
      timestamp,
    });
    const forwarded = new NextRequest(new URL(target, request.url), {
      method: request.method,
      body: body || undefined,
      headers: {
        "content-type": "application/json",
        "x-ops-actor-email": admin.email,
        "x-ops-timestamp": timestamp,
        "x-ops-signature": signature,
        "x-request-id": randomUUID(),
      },
    });
    const methods: Record<
      string,
      (
        req: NextRequest,
        context: { params: Promise<{ path?: string[] }> },
      ) => Promise<Response>
    > = isV2
      ? { GET: v2.GET, POST: v2.POST, DELETE: v2.DELETE }
      : {
          GET: v1.GET,
          POST: v1.POST,
          PATCH: v1.PATCH,
          PUT: v1.PUT,
          DELETE: v1.DELETE,
        };
    const handler = methods[request.method];
    return handler
      ? handler(forwarded, { params: Promise.resolve({ path }) })
      : NextResponse.json({ message: "Method not allowed" }, { status: 405 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json(
      { message },
      { status: message === "Authentication required" ? 401 : 403 },
    );
  }
}
export const GET = handle,
  POST = handle,
  PATCH = handle,
  PUT = handle,
  DELETE = handle;
