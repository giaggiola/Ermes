import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createFirstAdmin, hasAdmin, login, revokeSession } from "@ermes/db";
import { requireSameOrigin, sessionCookie, setSession } from "@/lib/session";
export const dynamic = "force-dynamic";
const input = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(12).max(128),
    setupToken: z.string().max(128).optional(),
  })
  .strict();
const hash = (value: string) => createHash("sha256").update(value).digest();
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  try {
    requireSameOrigin(request);
    const { action } = await context.params;
    if (action === "logout") {
      const token = (await cookies()).get(sessionCookie)?.value;
      if (token) await revokeSession(token);
      const response = NextResponse.json({ ok: true });
      response.cookies.delete(sessionCookie);
      return response;
    }
    if (!["setup", "login"].includes(action))
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    const raw = await request.text();
    if (raw.length > 4096)
      return NextResponse.json(
        { message: "Request too large" },
        { status: 413 },
      );
    const body = input.parse(JSON.parse(raw));
    if (action === "setup") {
      const expected = process.env.ERMES_SETUP_TOKEN;
      if (
        expected &&
        !timingSafeEqual(hash(expected), hash(body.setupToken ?? ""))
      )
        return NextResponse.json(
          { message: "Invalid setup key" },
          { status: 401 },
        );
      if (await hasAdmin())
        return NextResponse.json(
          { message: "Setup is already complete" },
          { status: 409 },
        );
    }
    const token =
      action === "setup"
        ? await createFirstAdmin(body.email, body.password)
        : await login(body.email, body.password);
    return setSession(NextResponse.json({ ok: true }), token);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Enter a valid email and a password of 12–128 characters"
        : error instanceof Error
          ? error.message
          : "Authentication failed";
    return NextResponse.json(
      { message },
      { status: message.includes("Too many") ? 429 : 400 },
    );
  }
}
