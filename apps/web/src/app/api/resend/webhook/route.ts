import { getCredential } from "@ermes/db";
import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { normalizeEmail } from "@ermes/core/validation";
import { getMessagingService } from "@ermes/db";

export const dynamic = "force-dynamic";

type ResendWebhookPayload = {
  type:
    | "email.sent"
    | "email.delivered"
    | "email.opened"
    | "email.clicked"
    | "email.bounced"
    | "email.complained";
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
    created_at: string;
    click?: {
      link: string;
      timestamp: string;
    };
    bounce?: {
      message: string;
    };
  };
};

const resendEventMap: Record<
  string,
  "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained"
> = {
  "email.bounced": "bounced",
  "email.clicked": "clicked",
  "email.complained": "complained",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.sent": "sent",
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const webhookSecret =
    (await getCredential("resendWebhookSecret")) ||
    process.env.RESEND_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (
    !verifyWebhookSignature(
      rawBody,
      {
        svixId: request.headers.get("svix-id") ?? undefined,
        svixSignature: request.headers.get("svix-signature") ?? undefined,
        svixTimestamp: request.headers.get("svix-timestamp") ?? undefined,
      },
      webhookSecret,
      isProduction,
    )
  ) {
    return NextResponse.json(
      { message: "Invalid webhook signature" },
      { status: 401 },
    );
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !payload.data ||
    !Array.isArray(payload.data.to) ||
    typeof payload.data.email_id !== "string"
  ) {
    return NextResponse.json(
      { message: "Invalid webhook payload" },
      { status: 400 },
    );
  }

  const eventType = resendEventMap[payload.type];
  if (!eventType) {
    return NextResponse.json({ ignored: true, received: true });
  }

  if (payload.type === "email.sent") {
    return NextResponse.json({
      reason: "Already logged on send",
      received: true,
      skipped: true,
    });
  }

  const subscriberEmail = payload.data.to[0]
    ? normalizeEmail(payload.data.to[0])
    : "";
  if (!subscriberEmail) {
    return NextResponse.json(
      { message: "No recipient email" },
      { status: 400 },
    );
  }

  const service = getMessagingService();
  const existingEvent = (
    await service.listEmailEvents({ message_id: payload.data.email_id })
  )[0];
  const providerEventId = request.headers.get("svix-id");
  const metadata: Record<string, unknown> = {
    from: payload.data.from,
    provider: "resend",
    resend_created_at: payload.data.created_at,
    subject: payload.data.subject,
  };

  if (payload.type === "email.clicked" && payload.data.click) {
    metadata.click_timestamp = payload.data.click.timestamp;
    metadata.click_url = payload.data.click.link;
  }

  if (payload.type === "email.bounced" && payload.data.bounce) {
    metadata.bounce_message = payload.data.bounce.message;
  }

  await service.logEmailEvent({
    campaign_id:
      typeof existingEvent?.campaign_id === "string"
        ? existingEvent.campaign_id
        : null,
    flow_step_key:
      typeof existingEvent?.flow_step_key === "string"
        ? existingEvent.flow_step_key
        : null,
    event_type: eventType,
    flow_run_id:
      typeof existingEvent?.flow_run_id === "string"
        ? existingEvent.flow_run_id
        : null,
    message_id: payload.data.email_id,
    metadata,
    provider_event_id: providerEventId,
    subscriber_email: subscriberEmail,
    template_id:
      typeof existingEvent?.template_id === "string"
        ? existingEvent.template_id
        : null,
    template_version_id:
      typeof existingEvent?.template_version_id === "string"
        ? existingEvent.template_version_id
        : null,
  });

  if (payload.type === "email.bounced" || payload.type === "email.complained") {
    const issueType =
      payload.type === "email.bounced" ? "bounced" : "complained";
    await service.recordSuppression(
      subscriberEmail,
      issueType === "bounced" ? "bounce" : "complaint",
      "resend",
    );

    const subscriber = (
      await service.listEmailSubscribers({ email: subscriberEmail })
    )[0];
    if (subscriber) {
      const properties =
        (subscriber.properties as Record<string, unknown> | null) ?? {};
      await service.updateEmailSubscribers({
        id: subscriber.id,
        properties: {
          ...properties,
          email_status: issueType,
          issue_count: Number(properties.issue_count ?? 0) + 1,
          last_issue_at: new Date().toISOString(),
        },
      });
    }
  }

  return NextResponse.json({ event_logged: eventType, received: true });
}

export function GET() {
  return NextResponse.json({
    message: "Resend webhook endpoint active",
    status: "ok",
  });
}

function verifyWebhookSignature(
  payload: string,
  headers: {
    svixId?: string;
    svixTimestamp?: string;
    svixSignature?: string;
  },
  secret: string | undefined,
  isProduction: boolean,
): boolean {
  if (!secret) {
    return !isProduction;
  }

  const { svixId, svixSignature, svixTimestamp } = headers;
  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  const timestamp = Number.parseInt(svixTimestamp, 10);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300
  ) {
    return false;
  }

  try {
    const secretBytes = Buffer.from(
      secret.startsWith("whsec_") ? secret.slice(6) : secret,
      "base64",
    );
    const expectedSignature = createHmac("sha256", secretBytes)
      .update(`${svixId}.${svixTimestamp}.${payload}`)
      .digest("base64");

    for (const signatureEntry of svixSignature.split(" ")) {
      const [version, signature] = signatureEntry.split(",");
      if (version !== "v1" || !signature) {
        continue;
      }

      const expected = Buffer.from(expectedSignature);
      const actual = Buffer.from(signature);
      if (
        expected.length === actual.length &&
        timingSafeEqual(actual, expected)
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
