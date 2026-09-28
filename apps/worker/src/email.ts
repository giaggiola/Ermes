import { deliveryCredentials } from "@ermes/db";
import { Resend } from "resend";

import {
  type FlowStepEmail,
  type MessageKind,
  renderHandlebarsTemplate,
} from "@ermes/core";
import type { MessagingService } from "@ermes/db";

interface SendRenderedEmailInput {
  campaignId?: string;
  campaignRecipientId?: string;
  campaignRevisionId?: string;
  context: Record<string, unknown>;
  flowRunId?: string | null;
  flowStepKey?: string;
  flowVersionId?: string;
  messageKind: MessageKind;
  metadata?: Record<string, unknown>;
  subject: string;
  subscriberEmail: string;
  smartSendingHours?: number;
  template: Record<string, unknown>;
  templateVersionId?: string;
  flowId?: string | null;
  html: string;
  idempotencyKey: string;
  oneClickUnsubscribeUrl?: string;
  text?: string;
  unsubscribeUrl?: string;
}

export async function sendRenderedEmail(service: MessagingService, input: SendRenderedEmailInput) {
  const { apiKey } = await deliveryCredentials();
  const runtime = await service.getRuntimeSettings();
  const senderName = runtime.emailSenderName;
  const senderEmail = runtime.emailFrom;
  const from = `${senderName} <${senderEmail}>`;
  const eventId = input.idempotencyKey;
  const claimed = await service.claimDelivery({
    campaignId: input.campaignId,
    campaignRecipientId: input.campaignRecipientId,
    campaignRevisionId: input.campaignRevisionId,
    flowId: input.flowId ?? undefined,
    flowRunId: input.flowRunId ?? undefined,
    flowVersionId: input.flowVersionId,
    idempotencyKey: input.idempotencyKey,
    messageKind: input.messageKind,
    recipientEmail: input.subscriberEmail,
    templateId: String(input.template.id),
    templateVersionId: input.templateVersionId,
  });

  if (claimed.claim === "complete") {
    return {
      alreadyComplete: true,
      dryRun: claimed.delivery.state === "dry_run",
      messageId:
        typeof claimed.delivery.provider_id === "string"
          ? claimed.delivery.provider_id
          : undefined,
      skipReason:
        typeof claimed.delivery.last_error === "string"
          ? claimed.delivery.last_error
          : undefined,
      skipped: claimed.delivery.state === "skipped",
    };
  }
  if (claimed.claim === "busy") {
    throw new Error(`Delivery ${input.idempotencyKey} is already being processed`);
  }


  if (input.messageKind === "marketing") {
    const source = input.flowId
      ? `flow:${input.flowId}`
      : input.campaignId
        ? `campaign:${input.campaignId}`
        : "marketing-email";
    if (input.smartSendingHours) {
      const contact = await service.claimMarketingSendWindow({
        email: input.subscriberEmail,
        hours: input.smartSendingHours,
        source,
      });
      if (!contact.allowed) {
        await service.logEmailEvent({
          campaign_id: input.campaignId ?? null,
          event_type: "skipped",
          flow_run_id: input.flowRunId ?? null,
          flow_step_key: input.flowStepKey ?? null,
          metadata: {
            ...input.metadata,
            flow_id: input.flowId ?? undefined,
            message_kind: input.messageKind,
            skip_category: "smart_sending",
            skip_reason: contact.reason,
            smart_sending_hours: input.smartSendingHours,
          },
          provider_event_id: `skip:${input.idempotencyKey}:smart-sending`,
          subscriber_email: input.subscriberEmail,
          template_id: String(input.template.id),
          template_version_id: input.templateVersionId ?? null,
        });
        await service.completeDelivery(input.idempotencyKey, {
          state: "skipped",
        });
        return {
          dryRun: false,
          messageId: undefined,
          skipReason: contact.reason,
          skipped: true,
        };
      }
    } else {
      await service.recordMarketingSendAttempt({
        email: input.subscriberEmail,
        source,
      });
    }
  }

  let result;
  try {
    result = await new Resend(apiKey).emails.send(
      {
        from,
        headers: input.oneClickUnsubscribeUrl
          ? {
              "List-Unsubscribe": `<${input.oneClickUnsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
        html: input.html,
        subject: input.subject,
        text: input.text,
        to: input.subscriberEmail,
      },
      { idempotencyKey: input.idempotencyKey },
    );
  } catch (error) {
    await service.failDelivery(
      input.idempotencyKey,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }

  if (result.error) {
    await service.logIntegrationDelivery({
      error: result.error.message,
      eventId,
      provider: "resend",
      request: { subject: input.subject, to: input.subscriberEmail },
      status: "failed",
    });
    await service.failDelivery(input.idempotencyKey, result.error.message);
    throw new Error(result.error.message);
  }

  await service.logIntegrationDelivery({
    deliveredAt: new Date(),
    eventId,
    provider: "resend",
    request: { subject: input.subject, to: input.subscriberEmail },
    response: { message_id: result.data?.id },
    status: "delivered",
  });

  await service.logEmailEvent({
    event_type: "sent",
    flow_run_id: input.flowRunId ?? null,
    flow_step_key: input.flowStepKey ?? null,
    message_id: result.data?.id,
    metadata: {
      ...input.metadata,
      idempotency_key: input.idempotencyKey,
      message_kind: input.messageKind,
      provider: "resend",
    },
    subscriber_email: input.subscriberEmail,
    template_id: String(input.template.id),
    template_version_id: input.templateVersionId ?? null,
    campaign_id: input.campaignId ?? null,
  });
  await service.completeDelivery(input.idempotencyKey, {
    providerId: result.data?.id,
    state: "sent",
  });

  return {
    dryRun: false,
    messageId: result.data?.id,
    skipReason: undefined,
    skipped: false,
  };
}

export function buildEmailForStep(
  step: FlowStepEmail,
  template: Record<string, unknown>,
  context: Record<string, unknown>,
  run: Record<string, unknown>,
) {
  const subjectTemplate = step.subject_override ?? String(template.subject);
  let html = renderHandlebarsTemplate(String(template.html_content), context);
  const text =
    typeof template.text_content === "string" ? renderHandlebarsTemplate(template.text_content, context) : undefined;

  if (step.enable_utm) {
    html = addUtmParameters(html, {
      utm_campaign: step.utm_campaign ?? String(run.flow_id),
      utm_medium: step.utm_medium ?? "flow",
      utm_source: step.utm_source ?? "email",
    });
  }

  return {
    html,
    subject: renderHandlebarsTemplate(subjectTemplate, context),
    text,
  };
}

export function buildUnsubscribeFooter(unsubscribeUrl: string): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efefef;border-collapse:collapse;">
  <tr>
    <td style="padding:20px 40px;text-align:center;">
      <p style="margin:0;color:#666666;font-family:'Gill Sans','Gill Sans MT',Arial,sans-serif;font-size:11px;line-height:1.6;">
        You're receiving this because you signed up at Your store.<br/>
        <a href="${unsubscribeUrl}" style="color:#1c1c1c;text-decoration:underline;">Unsubscribe</a>
      </p>
    </td>
  </tr>
</table>`;
}

export function insertBeforeBodyClose(html: string, content: string): string {
  const bodyClose = html.toLowerCase().lastIndexOf("</body>");
  if (bodyClose === -1) {
    return `${html}${content}`;
  }
  return `${html.slice(0, bodyClose)}${content}${html.slice(bodyClose)}`;
}

export function addUtmParameters(
  html: string,
  params: { utm_source: string; utm_medium: string; utm_campaign: string },
): string {
  const query = `utm_source=${encodeURIComponent(params.utm_source)}&utm_medium=${encodeURIComponent(
    params.utm_medium,
  )}&utm_campaign=${encodeURIComponent(params.utm_campaign)}`;

  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (match, url: string) => {
    if (url.includes("unsubscribe") || url.includes("preferences")) {
      return match;
    }

    return `href="${url}${url.includes("?") ? "&" : "?"}${query}"`;
  });
}
