import { NextResponse, type NextRequest } from "next/server";

import {
  auditMutation,
  dispatchAdminDELETE,
  dispatchAdminGET,
  dispatchAdminPOST,
  dispatchAdminUpdate,
} from "@/lib/admin-handlers";
import { authenticateInternalOpsRequest } from "@/lib/internal-ops-auth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function handle(request: NextRequest, context: RouteContext) {
  const auth = await authenticateInternalOpsRequest(request);
  if (!auth.ok) return auth.response;

  let response: Response;
  switch (request.method) {
    case "GET":
      response = await dispatchAdminGET(request, context);
      break;
    case "POST":
      response = await dispatchAdminPOST(request, context);
      break;
    case "PATCH":
    case "PUT":
      response = await dispatchAdminUpdate(request, context);
      break;
    case "DELETE":
      response = await dispatchAdminDELETE(request, context);
      break;
    default:
      return NextResponse.json({ message: "Method not allowed" }, { status: 405 });
  }

  if (request.method !== "GET") {
    await auditMutation(request, context, auth.actorEmail, response);
  }
  return response;
}

export function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export function PATCH(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export function PUT(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}
