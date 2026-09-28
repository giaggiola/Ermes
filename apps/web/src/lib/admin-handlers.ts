import { deliveryCredentials } from "@ermes/db";
import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

import {
  SIGNUP_FORM_SCHEMA_VERSION,
  TRIGGER_CATALOG,
  resolveFlowMessageKind,
  type SegmentRuleGroup,
} from "@ermes/core";
import { queueNames, sendJob } from "@ermes/core/queue";
import { defaultTemplateContext, renderHandlebarsTemplate } from "@ermes/core/render-template";
import { isValidEmail, normalizeEmail } from "@ermes/core/validation";
import { getMessagingService } from "@ermes/db";

import { handleRouteError, HttpError, parseBody } from "@/lib/http";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const runtimeSettingsInput = z
  .object({
    email_from: z.string().email().optional(),
    email_logo_url: z
      .string()
      .trim()
      .refine(
        (value) => !value || /^https:\/\/[^\s]+$/i.test(value),
        "Email logo must be an absolute HTTPS URL",
      )
      .optional(),
    email_sender_name: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "At least one runtime setting is required",
  });

const analyticsMaxRangeMs = 366 * 24 * 60 * 60 * 1000;

function getAnalyticsRange(searchParams: URLSearchParams) {
  const daysValue = searchParams.get("days");
  const fromValue = searchParams.get("from");
  const toValue = searchParams.get("to");

  if (daysValue && (fromValue || toValue)) {
    throw new HttpError("Use either days or from/to for analytics", 400);
  }

  const to = toValue ? new Date(toValue) : new Date();
  let from: Date;
  if (fromValue) {
    from = new Date(fromValue);
  } else {
    const days = daysValue ? Number(daysValue) : 30;
    if (
      !Number.isInteger(days) ||
      days < 1 ||
      days * 24 * 60 * 60 * 1000 > analyticsMaxRangeMs
    ) {
      throw new HttpError("Analytics days must be between 1 and 366", 400);
    }
    from = new Date(to);
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - (days - 1));
  }

  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    throw new HttpError("Analytics dates must be valid ISO-8601 values", 400);
  }
  if (from.getTime() >= to.getTime()) {
    throw new HttpError("Analytics from date must be before to date", 400);
  }
  if (to.getTime() - from.getTime() > analyticsMaxRangeMs) {
    throw new HttpError("Analytics date range cannot exceed 366 days", 400);
  }

  return { from, to };
}

const resources = {
  "email-campaigns": {
    create: "createEmailCampaigns",
    delete: "deleteEmailCampaigns",
    list: "listEmailCampaigns",
    retrieve: "retrieveEmailCampaign",
    update: "updateEmailCampaigns",
  },
  "email-discount-codes": {
    create: "createEmailDiscountCodes",
    delete: "deleteEmailDiscountCodes",
    list: "listEmailDiscountCodes",
    retrieve: "retrieveEmailDiscountCode",
    update: "updateEmailDiscountCodes",
  },
  "email-events": {
    create: "createEmailEvents",
    delete: "deleteEmailEvents",
    list: "listEmailEvents",
    retrieve: "retrieveEmailEvent",
    update: "updateEmailEvents",
  },
  "email-flow-runs": {
    create: "createEmailFlowRuns",
    delete: "deleteEmailFlowRuns",
    list: "listEmailFlowRuns",
    retrieve: "retrieveEmailFlowRun",
    update: "updateEmailFlowRuns",
  },
  "email-flows": {
    create: "createEmailFlows",
    delete: "deleteEmailFlows",
    list: "listEmailFlows",
    retrieve: "retrieveEmailFlow",
    update: "updateEmailFlows",
  },
  "email-product-watches": {
    create: "createEmailProductWatches",
    delete: "deleteEmailProductWatches",
    list: "listEmailProductWatches",
    retrieve: "retrieveEmailProductWatch",
    update: "updateEmailProductWatches",
  },
  "email-segments": {
    create: "createEmailSegments",
    delete: "deleteEmailSegments",
    list: "listEmailSegments",
    retrieve: "retrieveEmailSegment",
    update: "updateEmailSegments",
  },
  "email-subscribers": {
    create: "createEmailSubscribers",
    delete: "deleteEmailSubscribers",
    list: "listEmailSubscribers",
    retrieve: "retrieveEmailSubscriber",
    update: "updateEmailSubscribers",
  },
  "email-templates": {
    create: "createEmailTemplates",
    delete: "deleteEmailTemplates",
    list: "listEmailTemplates",
    retrieve: "retrieveEmailTemplate",
    update: "updateEmailTemplates",
  },
  "signup-forms": {
    create: "createSignupForms",
    delete: "deleteSignupForms",
    list: "listSignupForms",
    retrieve: "retrieveSignupForm",
    update: "updateSignupForms",
  },
} as const;

export async function dispatchAdminGET(request: NextRequest, context: RouteContext) {
  try {
    const path = await getPath(context);
    const service = getMessagingService();

    if (path[0] === "contract" && path.length === 1) {
      return NextResponse.json({
        api_version: 1,
        signup_form_schema_version: SIGNUP_FORM_SCHEMA_VERSION,
        trigger_catalogue: TRIGGER_CATALOG,
      });
    }

    if (path[0] === "analytics") {
      const range = getAnalyticsRange(request.nextUrl.searchParams);
      return NextResponse.json({
        analytics: await service.getDeliverabilityAnalytics(range),
      });
    }

    if (path[0] === "dashboard") {
      return NextResponse.json({ stats: await service.getDashboardStats() });
    }

    if (path[0] === "settings") {
      return NextResponse.json({ settings: await service.getAdminSettings() });
    }

    if (path[0] === "metrics") {
      return NextResponse.json({ metrics: await service.listDistinctCommerceEventTypes() });
    }

    if (path[0] === "email-flows" && path[1] && path[2] === "analytics") {
      return NextResponse.json(await service.getFlowAnalytics(path[1]));
    }

    if (path[0] === "email-campaigns" && path[1] && path[2] === "analytics") {
      return NextResponse.json({ analytics: await service.getCampaignAnalytics(path[1]) });
    }

    if (path[0] === "email-subscribers" && path[1] === "tags") {
      return NextResponse.json({ tags: await service.getAllTags() });
    }

    if (path[0] === "email-subscribers" && path[1] && path[2] === "timeline") {
      return NextResponse.json(await service.getSubscriberTimeline(path[1]));
    }

    if (path[0] === "email-templates" && path[2] === "preview") {
      const template = await service.retrieveEmailTemplate(path[1]);
      const defaultContext = {
        ...defaultTemplateContext,
        ...(await service.getEmailTemplateBrandContext()),
      };
      return NextResponse.json({
        available_variables: Object.keys(defaultContext),
        default_context: defaultContext,
        template: {
          category: template.category,
          id: template.id,
          name: template.name,
          subject: template.subject,
          variables: template.variables,
        },
      });
    }

    if (path[0] === "message-suppressions") {
      const filter = Object.fromEntries(request.nextUrl.searchParams.entries());
      return NextResponse.json({ message_suppressions: await service.listMessageSuppressions(filter) });
    }

    const config = getResource(path[0]);
    if (!config) {
      return NextResponse.json({ message: "Unknown admin resource" }, { status: 404 });
    }

    if (path[1]) {
      const row = await callService(service, config.retrieve, path[1]);
      return NextResponse.json({ [singular(path[0])]: row });
    }

    const filter = Object.fromEntries(request.nextUrl.searchParams.entries());
    const rows = await callService(service, config.list, filter);
    return NextResponse.json({ [collectionKey(path[0])]: rows });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function dispatchAdminPOST(request: NextRequest, context: RouteContext) {
  try {
    const path = await getPath(context);
    const body = await parseBody(request);
    const service = getMessagingService();

    if (path[0] === "email-templates" && path[1] && path[2] === "preview") {
      const template = await service.retrieveEmailTemplate(path[1]);
      const contextData = {
        ...defaultTemplateContext,
        ...((body.context as Record<string, unknown> | undefined) ?? {}),
        ...(await service.getEmailTemplateBrandContext()),
      };

      return NextResponse.json({
        context_used: contextData,
        preview: {
          html: renderHandlebarsTemplate(String(template.html_content), contextData),
          subject: renderHandlebarsTemplate(String(template.subject), contextData),
          text:
            typeof template.text_content === "string"
              ? renderHandlebarsTemplate(template.text_content, contextData)
              : null,
        },
        template: {
          category: template.category,
          id: template.id,
          is_active: template.is_active,
          name: template.name,
          variables: template.variables,
        },
      });
    }

    if (path[0] === "email-templates" && path[1] && path[2] === "send-test") {
      return await sendTestEmail(path[1], body);
    }

    if (path[0] === "email-campaigns" && path[1] === "preview-audience") {
      const filter = (body.filter as Record<string, unknown> | null | undefined) ?? null;
      return NextResponse.json(await service.previewCampaignAudience(filter));
    }

    if (path[0] === "email-segments" && path[1] === "preview") {
      const rules = body.rules as SegmentRuleGroup;
      if (
        !rules ||
        !Array.isArray(rules.conditions) ||
        !["all", "any"].includes(rules.match)
      ) {
        return NextResponse.json(
          { message: "Valid segment rules are required" },
          { status: 400 },
        );
      }
      return NextResponse.json(await service.previewEmailSegment(rules));
    }

    if (path[0] === "email-campaigns" && path[1] && path[2] === "send-test") {
      return await sendCampaignTestEmail(path[1], body);
    }

    if (path[0] === "email-campaigns" && path[1] && path[2] === "send") {
      const campaignId = path[1];
      const campaign = await service.retrieveEmailCampaign(campaignId);
      const status = String(campaign.status);
      if (!["draft", "failed"].includes(status)) {
        throw new HttpError(
          status === "scheduled"
            ? "Campaign is already scheduled"
            : "Campaign can no longer be queued",
          409,
        );
      }

      const scheduledAt = campaign.scheduled_at
        ? new Date(String(campaign.scheduled_at))
        : null;
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
        throw new HttpError("Campaign schedule is invalid", 400);
      }

      await service.ensureCampaignSendRevision(campaignId);
      await service.updateEmailCampaigns({
        id: campaignId,
        status: "scheduled",
      });

      const dueNow = !scheduledAt || scheduledAt.getTime() <= Date.now();
      const jobId = dueNow
        ? await sendJob(
            queueNames.sendCampaign,
            { campaignId },
            {
              singletonKey: campaignId,
              singletonSeconds: 60,
            },
          )
        : undefined;
      return NextResponse.json({
        job_id: jobId,
        message: dueNow ? "Campaign queued" : "Campaign scheduled",
        scheduled_at: scheduledAt?.toISOString() ?? null,
        status: "scheduled",
      });
    }

    if (path[0] === "email-campaigns" && path[1] && path[2] === "cancel") {
      const campaignId = path[1];
      const campaign = await service.retrieveEmailCampaign(campaignId);
      const scheduledAt = campaign.scheduled_at
        ? new Date(String(campaign.scheduled_at))
        : null;
      if (
        campaign.status !== "scheduled" ||
        !scheduledAt ||
        scheduledAt.getTime() <= Date.now()
      ) {
        throw new HttpError(
          "Only a campaign that has not reached its send time can be cancelled",
          409,
        );
      }
      const cancelled = await service.updateEmailCampaigns({
        audience_snapshotted_at: null,
        id: campaignId,
        scheduled_at: null,
        send_revision_id: null,
        status: "draft",
      });
      return NextResponse.json({
        campaign: cancelled,
        message: "Campaign schedule cancelled",
      });
    }

    if (path[0] === "email-flows" && path[1] === "test-trigger") {
      const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
      if (!email || !isValidEmail(email)) {
        return NextResponse.json({ message: "Valid email is required" }, { status: 400 });
      }

      const contextData = {
        ...defaultTemplateContext,
        ...((body.context as Record<string, unknown> | undefined) ?? {}),
        email,
        ...(await service.getEmailTemplateBrandContext()),
      };

      if (typeof body.flow_id === "string" && body.flow_id) {
        const flow = await service.retrieveEmailFlow(body.flow_id);
        const result = await service.triggerFlow(
          body.flow_id,
          email,
          contextData,
          resolveFlowMessageKind(flow.message_kind, "marketing"),
        );
        return NextResponse.json({ results: [result] });
      }

      const triggerEvent = typeof body.trigger_event === "string" ? body.trigger_event : "order.placed";
      const results = await service.triggerFlowsForEvent(triggerEvent, email, contextData, "transactional");
      return NextResponse.json({ results });
    }

    if (path[0] === "message-suppressions") {
      const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
      const reason = typeof body.reason === "string" ? body.reason : "manual";
      const source = typeof body.source === "string" && body.source ? body.source : "admin";

      if (!email || !isValidEmail(email)) {
        return NextResponse.json({ message: "Valid email is required" }, { status: 400 });
      }

      if (!["bounce", "complaint", "manual", "unsubscribe"].includes(reason)) {
        return NextResponse.json({ message: "Invalid suppression reason" }, { status: 400 });
      }

      const suppression = await service.recordSuppression(
        email,
        reason as "bounce" | "complaint" | "manual" | "unsubscribe",
        source,
      );
      return NextResponse.json({ message_suppression: suppression }, { status: 201 });
    }

    const config = getResource(path[0]);
    if (!config) {
      return NextResponse.json({ message: "Unknown admin resource" }, { status: 404 });
    }

    if (path[0] === "email-campaigns") {
      body.status = "draft";
      for (const field of [
        "audience_snapshotted_at",
        "failed_count",
        "recipient_count",
        "send_revision_id",
        "sent_at",
        "sent_count",
      ]) {
        delete body[field];
      }
    }
    const created = (await callService(service, config.create, [body])) as Record<string, unknown>[];
    return NextResponse.json({ [singular(path[0])]: created[0] }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function dispatchAdminDELETE(_request: NextRequest, context: RouteContext) {
  try {
    const path = await getPath(context);
    const config = getResource(path[0]);

    if (path[0] === "message-suppressions" && path[1]) {
      const suppression = await getMessagingService().clearSuppressionById(path[1]);
      return NextResponse.json({ message_suppression: suppression, success: Boolean(suppression) });
    }

    if (!config || !path[1]) {
      return NextResponse.json({ message: "Unknown admin resource" }, { status: 404 });
    }

    await callService(getMessagingService(), config.delete, path[1]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function dispatchAdminUpdate(request: NextRequest, context: RouteContext) {
  try {
    const path = await getPath(context);
    if (path[0] === "settings" && path.length === 1) {
      const body = runtimeSettingsInput.parse(await parseBody(request));
      const service = getMessagingService();
      await service.updateRuntimeSettings({
        emailFrom: body.email_from,
        emailLogoUrl: body.email_logo_url,
        emailSenderName: body.email_sender_name,
      });
      return NextResponse.json({ settings: await service.getAdminSettings() });
    }
    const config = getResource(path[0]);
    if (!config || !path[1]) {
      return NextResponse.json({ message: "Unknown admin resource" }, { status: 404 });
    }

    const body = await parseBody(request);
    if (
      path[0] === "email-campaigns" &&
      [
        "audience_snapshotted_at",
        "failed_count",
        "recipient_count",
        "send_revision_id",
        "sent_at",
        "sent_count",
        "status",
      ].some((field) => field in body)
    ) {
      throw new HttpError(
        "Use the campaign send or cancel action to change lifecycle state",
        400,
      );
    }
    const updated = await callService(getMessagingService(), config.update, {
      ...body,
      id: path[1],
    });

    return NextResponse.json({ [singular(path[0])]: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function auditMutation(
  request: NextRequest,
  context: RouteContext,
  actorEmail: string,
  response: Response,
) {
  const path = await getPath(context);
  await getMessagingService()
    .recordAdminAudit({
      action: request.method.toUpperCase(),
      actorEmail,
      outcome: response.ok ? "success" : `http_${response.status}`,
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      resourceId: path[1],
      resourceType: path[0] ?? "unknown",
    })
    .catch(() => undefined);
}

async function sendTestEmail(templateId: string, body: Record<string, unknown>) {
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ message: "Valid email is required" }, { status: 400 });
  }
  const requestId =
    typeof body.request_id === "string" &&
    /^[a-zA-Z0-9_-]{8,128}$/.test(body.request_id)
      ? body.request_id
      : undefined;
  if (!requestId) {
    return NextResponse.json(
      { message: "Valid request_id is required" },
      { status: 400 },
    );
  }

  const service = getMessagingService();
  const template = await service.retrieveEmailTemplate(templateId);
  const runtime = await service.getRuntimeSettings();
  const contextData = {
    ...defaultTemplateContext,
    ...((body.context as Record<string, unknown> | undefined) ?? {}),
    email,
    ...(await service.getEmailTemplateBrandContext(runtime)),
  };

  const subject = `[TEST] ${renderHandlebarsTemplate(String(template.subject), contextData)}`;
  const html = renderHandlebarsTemplate(String(template.html_content), contextData);

  const { apiKey } = await deliveryCredentials();

  const senderName = runtime.emailSenderName;
  const senderEmail = runtime.emailFrom;
  const result = await new Resend(apiKey).emails.send(
    {
      from: `${senderName} <${senderEmail}>`,
      html,
      subject,
      to: email,
    },
    { idempotencyKey: `template-test/${templateId}/${requestId}` },
  );

  if (result.error) {
    return NextResponse.json({ error: result.error.message, message: "Failed to send test email" }, { status: 500 });
  }

  return NextResponse.json({ message: `Test email sent to ${email}`, message_id: result.data?.id, success: true });
}

async function sendCampaignTestEmail(campaignId: string, body: Record<string, unknown>) {
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ message: "Valid email is required" }, { status: 400 });
  }
  const requestId =
    typeof body.request_id === "string" &&
    /^[a-zA-Z0-9_-]{8,128}$/.test(body.request_id)
      ? body.request_id
      : undefined;
  if (!requestId) {
    return NextResponse.json(
      { message: "Valid request_id is required" },
      { status: 400 },
    );
  }

  const service = getMessagingService();
  const campaign = await service.retrieveEmailCampaign(campaignId);
  const template = await service.retrieveEmailTemplate(String(campaign.template_id));
  const runtime = await service.getRuntimeSettings();
  const contextData = {
    ...defaultTemplateContext,
    ...((campaign.context as Record<string, unknown> | null) ?? {}),
    ...((body.context as Record<string, unknown> | undefined) ?? {}),
    email,
    ...(await service.getEmailTemplateBrandContext(runtime)),
  };

  const subject = `[TEST] ${renderHandlebarsTemplate(String(campaign.subject || template.subject), contextData)}`;
  const html = renderHandlebarsTemplate(String(template.html_content), contextData);

  const { apiKey } = await deliveryCredentials();

  const senderName = runtime.emailSenderName;
  const senderEmail = runtime.emailFrom;
  const result = await new Resend(apiKey).emails.send(
    {
      from: `${senderName} <${senderEmail}>`,
      html,
      subject,
      to: email,
    },
    { idempotencyKey: `campaign-test/${campaignId}/${requestId}` },
  );

  if (result.error) {
    return NextResponse.json({ error: result.error.message, message: "Failed to send campaign test" }, { status: 500 });
  }

  return NextResponse.json({ message: `Campaign test sent to ${email}`, message_id: result.data?.id, success: true });
}

async function getPath(context: RouteContext) {
  const params = await context.params;
  return params.path ?? [];
}

function getResource(resource: string | undefined) {
  if (!resource || !(resource in resources)) {
    return null;
  }

  return resources[resource as keyof typeof resources];
}

function callService(service: unknown, method: string, ...args: unknown[]) {
  return (service as Record<string, (...methodArgs: unknown[]) => unknown>)[method](...args);
}

function collectionKey(resource: string) {
  return resource.replaceAll("-", "_");
}

function singular(resource: string) {
  if (resource.endsWith("ies")) {
    return resource.slice(0, -3).replaceAll("-", "_") + "y";
  }

  if (resource.endsWith("s")) {
    return resource.slice(0, -1).replaceAll("-", "_");
  }

  return resource.replaceAll("-", "_");
}
