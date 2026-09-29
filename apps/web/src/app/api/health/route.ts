import { NextResponse } from "next/server";

import { getPool } from "@ermes/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "unavailable" = "ok";

  try {
    await getPool().query("SELECT 1");
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
