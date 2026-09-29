import { NextResponse, type NextRequest } from "next/server";
import { EmailDeliveryDisabledError } from "@ermes/core/installation";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function parseBody(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return (await request.json()) as Record<string, unknown>;
    } catch {
      throw new HttpError("Invalid JSON body", 400);
    }
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }

  const text = await request.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
}

export function handleRouteError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Internal server error";
  const status =
    error instanceof EmailDeliveryDisabledError
      ? 409
      : error instanceof HttpError
        ? error.status
        : message.includes("not found") || message.includes("Record not found")
          ? 404
          : 500;
  return NextResponse.json({ message }, { status });
}

export function redirectOrJson(
  request: NextRequest,
  payload: Record<string, unknown>,
  path: string,
) {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // A Docker/reverse-proxy request URL may contain the internal container host.
    const url = new URL(path, process.env.APP_URL ?? request.url);
    for (const [key, value] of Object.entries(payload)) {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        url.searchParams.set(key, String(value));
      }
    }
    return NextResponse.redirect(url, { status: 303 });
  }

  return NextResponse.json(payload);
}
