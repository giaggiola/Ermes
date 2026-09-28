import { NextResponse, type NextRequest } from "next/server";

import {
  commerceEventEnvelopeSchema,
  getEventRecipient,
} from "@ermes/core/events";
import { verifyEilishSignature } from "@ermes/core/http-signing";
import { hasDeterministicEventId } from "@ermes/core/idempotency";
import { queueNames, sendJob } from "@ermes/core/queue";
import { getMessagingService } from "@ermes/db";

export async function handleCommerceEvent(request: NextRequest) {
  const secret =
    process.env.COMMERCE_EVENT_WEBHOOK_SECRET ??
    process.env.MEDUSA_EVENT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { message: "COMMERCE_EVENT_WEBHOOK_SECRET is not configured" },
      { status: 503 },
    );
  }

  const timestamp = request.headers.get("x-eilish-timestamp") ?? "";
  const signature = request.headers.get("x-eilish-signature") ?? "";
  const headerEventId = request.headers.get("x-eilish-event-id") ?? "";
  const rawBody = await request.text();
  if (rawBody.length > 256 * 1024) {
    return NextResponse.json(
      { message: "Commerce event is too large" },
      { status: 413 },
    );
  }
  if (
    !verifyEilishSignature({
      body: rawBody,
      maxAgeSeconds: 300,
      secret,
      signature,
      timestamp,
    })
  ) {
    return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = commerceEventEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid event payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const envelope = parsed.data;
  if (!headerEventId || headerEventId !== envelope.eventId) {
    return NextResponse.json(
      { message: "X-Eilish-Event-Id must match payload eventId" },
      { status: 400 },
    );
  }
  if (!hasDeterministicEventId(envelope.eventId)) {
    return NextResponse.json(
      { message: "Event ID must use a deterministic prefix" },
      { status: 400 },
    );
  }

  const recipient = getEventRecipient(envelope);
  const fanoutProductEvent =
    envelope.type === "product.back_in_stock" ||
    envelope.type === "product.price_drop";
  if (
    envelope.type !== "discount.redeemed" &&
    !fanoutProductEvent &&
    !recipient
  ) {
    return NextResponse.json(
      { message: "Event payload must include recipient email context" },
      { status: 400 },
    );
  }

  const service = getMessagingService();
  const inserted = await service.insertCommerceEvent({
    eventId: envelope.eventId,
    eventType: envelope.type,
    payload: envelope,
    source: envelope.source,
  });
  if (inserted?.id) {
    await sendJob(queueNames.processCommerceEvent, {
      commerceEventId: inserted.id,
    });
  }

  return NextResponse.json(
    {
      accepted: true,
      duplicate: !inserted,
      event_id: envelope.eventId,
    },
    { status: 202 },
  );
}
