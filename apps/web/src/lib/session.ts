import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { sessionAdmin } from "@ermes/db";
export const sessionCookie = "ermes_session";
export async function currentAdmin() {
  return sessionAdmin((await cookies()).get(sessionCookie)?.value);
}
export function requireSameOrigin(request: NextRequest) {
  const origin = process.env.APP_URL;
  if (!origin || request.headers.get("origin") !== new URL(origin).origin) {
    throw new Error("Request origin is not allowed");
  }
}
export function setSession(response: NextResponse, token: string) {
  response.cookies.set(sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_URL?.startsWith("https://") ?? false,
    path: "/",
    maxAge: 7 * 86400,
  });
  return response;
}
export async function authenticateBrowser(request: NextRequest) {
  if (request.method !== "GET") requireSameOrigin(request);
  const admin = await currentAdmin();
  if (!admin) throw new Error("Authentication required");
  return admin;
}
