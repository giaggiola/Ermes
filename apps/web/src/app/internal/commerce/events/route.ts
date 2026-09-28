import { type NextRequest } from "next/server";

import { handleCommerceEvent } from "@/lib/commerce-event-route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleCommerceEvent(request);
}
