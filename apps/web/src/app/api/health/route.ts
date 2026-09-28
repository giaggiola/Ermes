import { NextResponse } from "next/server";

import { getMessagingService } from "@ermes/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "unavailable" = "ok";
  let stats: Record<string, number> | undefined;

  try {
    const service = getMessagingService();
    stats = await service.getDashboardStats();
  } catch {
    database = "unavailable";
  }

  const ok = database === "ok";

  return NextResponse.json(
    {
      database,
      ok,
      service: "ermes-web",
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
