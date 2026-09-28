import { type NextRequest } from "next/server";

import { handleCommerceEvent } from "@/lib/commerce-event-route";

export const dynamic = "force-dynamic";

/** Transitional endpoint for any Medusa deliveries still in flight. */
export async function POST(request: NextRequest) {
  return handleCommerceEvent(request);
}
