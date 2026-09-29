import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";

import {
  type ExecuteStepJob,
  type FlowStep,
  type FlowStepCondition,
  type FlowStepDiscount,
  type FlowStepEmail,
  calculateFlowDelay,
  evaluateFlowCondition,
  flowStepAtPath,
  getBoss,
  getEventRecipient,
  getMessageKindForEvent,
  type CommerceEventEnvelope,
  commerceEventEnvelopeSchema,
  nextFlowStepPath,
  normalizeEmail,
  queueNames,
  randomAlphanumeric,
  renderHandlebarsTemplate,
  selectFlowEmailVariant,
  type SendCampaignRecipientJob,
  sendJob,
  type StartFlowJob,
  toFlowTriggerEvent,
} from "@ermes/core";
import {
  getMessagingService,
  installationRow,
  type MessagingService,
} from "@ermes/db";
import { EmailDeliveryDisabledError } from "@ermes/core/installation";
import { withDeliveryGate } from "./delivery-gate.js";

import {
  buildEmailForStep,
  buildUnsubscribeFooter,
  insertBeforeBodyClose,
  sendRenderedEmail,
} from "./email.js";
import {
  checkShopifyRecoveryEligibility,
  createCommercePromotion,
} from "./commerce.js";

type Job<T> = {
  data: T;
  id?: string;
  retryCount?: number;
};
const deliveryQueues = new Set<string>([
  queueNames.executeStep,
  queueNames.sendCampaign,
  queueNames.sendCampaignRecipient,
]);

export async function registerWorkers(logger: Logger) {
  const boss = await getBoss();
  const service = getMessagingService();

  await work(
    boss,
    queueNames.dispatchScheduledCampaigns,
    { teamSize: 1 },
    async () => {
      if (!(await installationRow()).delivery_enabled) return;
      const campaigns = await service.listDueScheduledEmailCampaigns();
      for (const campaign of campaigns) {
        const campaignId = String(campaign.id);
        await sendJob(
          queueNames.sendCampaign,
          { campaignId },
          {
            ...retryOptions(),
            singletonKey: campaignId,
            singletonSeconds: 60,
          },
        );
      }
      if (campaigns.length > 0) {
        logger.info(
          { campaignCount: campaigns.length },
          "due campaigns dispatched",
        );
      }
    },
  );
  await boss.schedule(
    queueNames.dispatchScheduledCampaigns,
    "* * * * *",
    null,
    { tz: "UTC" },
  );

  await work(
    boss,
    queueNames.processCommerceEvent,
    { teamSize: 5 },
    async (job: Job<{ commerceEventId: string }>) => {
      await processCommerceEvent(service, job.data, logger);
    },
  );

  await work(
    boss,
    queueNames.startFlow,
    { teamSize: 5 },
    async (job: Job<StartFlowJob>) => {
      await startFlow(service, job.data, logger);
    },
  );

  await work(
    boss,
    queueNames.executeStep,
    { teamSize: 10 },
    async (job: Job<ExecuteStepJob>) => {
      await executeStep(service, job.data, logger, job.retryCount ?? 0);
    },
  );

  await work(
    boss,
    queueNames.sendCampaign,
    { teamSize: 2 },
    async (job: Job<{ campaignId: string }>) => {
      await sendCampaign(service, job.data.campaignId, logger);
    },
  );

  await work(
    boss,
    queueNames.sendCampaignRecipient,
    { teamSize: 10 },
    async (job: Job<SendCampaignRecipientJob>) => {
      await sendCampaignRecipient(service, job.data, logger);
    },
  );
}

async function work<T>(
  boss: PgBoss,
  queueName: string,
  options: Record<string, unknown>,
  handler: (job: Job<T>) => Promise<void>,
) {
  await (
    boss as unknown as {
      work: (
        name: string,
        options: unknown,
        handler: (jobOrJobs: Job<T> | Job<T>[]) => Promise<void>,
      ) => Promise<string>;
    }
  ).work(queueName, options, async (jobOrJobs) => {
    const jobs = Array.isArray(jobOrJobs) ? jobOrJobs : [jobOrJobs];
    for (const job of jobs) {
      const gated = deliveryQueues.has(queueName);
      if (!gated) {
        await handler(job);
        continue;
      }
      await withDeliveryGate({
        enabled: async () =>
          Boolean((await installationRow()).delivery_enabled),
        run: () => handler(job),
        defer: async () => {
          const next = await boss.send(queueName, job.data as object, {
            ...retryOptions(),
            startAfter: new Date(Date.now() + 60_000),
          });
          if (!next) throw new Error("Could not defer paused delivery job");
        },
      });
    }
  });
}

async function processCommerceEvent(
  service: MessagingService,
  data: { commerceEventId: string },
  logger: Logger,
) {
  const event = await service.retrieveCommerceEvent(data.commerceEventId);
  if (!event) {
    logger.warn(
      { commerceEventId: data.commerceEventId },
      "commerce event not found",
    );
    return;
  }

  if (event.processed_at) return;

  const envelope = commerceEventEnvelopeSchema.parse(
    event.payload,
  ) as CommerceEventEnvelope;

  if (envelope.type === "discount.redeemed") {
    const code =
      stringValue(envelope.payload.code) ?? stringValue(envelope.context.code);
    const orderId =
      stringValue(envelope.payload.order_id) ??
      stringValue(envelope.context.order_id);
    if (code && orderId) {
      await service.markDiscountRedeemed(code, orderId);
    }
    await service.markCommerceEventProcessed(String(event.id));
    return;
  }

  let newsletterWelcomeEligible = true;
  if (envelope.type === "newsletter.subscribed") {
    const email = getEventRecipient(envelope);
    if (email && envelope.payload.subscription_recorded === true) {
      // Native storefront subscriptions and their outbox event commit together.
      // Replaying that event must never resubscribe a later opt-out.
      const current = (await service.listEmailSubscribers({ email }))[0];
      newsletterWelcomeEligible = Boolean(
        current?.subscribed &&
        new Date(String(current.subscribed_at)).getTime() ===
          new Date(String(envelope.payload.subscribed_at)).getTime(),
      );
    } else if (email) {
      const subscribed = await service.subscribeWithStatus(email, {
        first_name:
          stringValue(envelope.context.first_name) ??
          stringValue(envelope.payload.first_name),
        source:
          stringValue(envelope.context.source) ??
          stringValue(envelope.payload.source) ??
          `${envelope.source}-event`,
      });
      newsletterWelcomeEligible = subscribed.welcomeEligible;
    }
  }

  await maybeCaptureCartPriceDropWatches(service, envelope);

  const productWatchHandled = await maybeProcessProductWatchFanout(
    service,
    envelope,
    logger,
  );
  if (!productWatchHandled && newsletterWelcomeEligible) {
    const email = getEventRecipient(envelope);
    if (!email) {
      throw new Error(`Event ${envelope.eventId} has no recipient email`);
    }

    const context = buildEventContext(envelope, email);
    const triggerEvent = toFlowTriggerEvent(envelope.type);
    const messageKind = getMessageKindForEvent(envelope.type);
    const results = await service.triggerFlowsForEvent(
      triggerEvent,
      email,
      context,
      messageKind,
      envelope.eventId,
    );
    logger.info(
      { eventId: envelope.eventId, results },
      "triggered flows for commerce event",
    );
    await maybeMarkSpecificWatchNotified(service, envelope);
  }

  await service.markCommerceEventProcessed(String(event.id));
}

async function maybeProcessProductWatchFanout(
  service: MessagingService,
  envelope: CommerceEventEnvelope,
  logger: Logger,
) {
  if (
    envelope.type !== "product.back_in_stock" &&
    envelope.type !== "product.price_drop"
  ) {
    return false;
  }

  if (getEventRecipient(envelope)) {
    return false;
  }

  const productId =
    stringValue(envelope.payload.product_id) ??
    stringValue(envelope.context.product_id);
  if (!productId) {
    return false;
  }

  const alertType =
    envelope.type === "product.back_in_stock" ? "back-in-stock" : "price-drop";
  const productHandle =
    stringValue(envelope.payload.product_handle) ??
    stringValue(envelope.context.product_handle);
  const watchRows = await Promise.all(
    [...new Set([productId, productHandle].filter(Boolean))].map(
      (watchProductId) =>
        service.listEmailProductWatches({
          notified: false,
          product_id: watchProductId,
        }),
    ),
  );
  const watches = [
    ...new Map(
      watchRows.flat().map((watch) => [String(watch.id), watch]),
    ).values(),
  ];
  const variantId =
    stringValue(envelope.payload.variant_id) ??
    stringValue(envelope.context.variant_id);
  let triggered = 0;

  for (const watch of watches) {
    if (
      watch.alert_type !== alertType &&
      !(alertType === "price-drop" && watch.alert_type === "cart-price-drop")
    ) {
      continue;
    }
    if (variantId && watch.variant_id && watch.variant_id !== variantId) {
      continue;
    }
    const watchContext =
      watch.context && typeof watch.context === "object"
        ? (watch.context as Record<string, unknown>)
        : {};
    const watchedSku = stringValue(watchContext.variant_sku);
    const eventSku =
      stringValue(envelope.payload.variant_sku) ??
      stringValue(envelope.context.variant_sku);
    if (watchedSku && eventSku && watchedSku !== eventSku) {
      continue;
    }

    if (alertType === "price-drop") {
      const currentPrice =
        numericValue(envelope.payload.current_price) ??
        numericValue(envelope.context.current_price);
      const referencePrice = numericValue(watch.reference_price);
      if (
        currentPrice == null ||
        referencePrice == null ||
        currentPrice >= referencePrice
      ) {
        continue;
      }
    }

    const email = String(watch.email);
    const context = {
      ...watchContext,
      ...buildEventContext(envelope, email, {
        watch_id: watch.id,
        old_price: watch.reference_price,
        reference_price: watch.reference_price,
      }),
    };
    const triggerEvent =
      watch.alert_type === "cart-price-drop"
        ? "product.cart-price-drop"
        : toFlowTriggerEvent(envelope.type);
    await service.triggerFlowsForEvent(
      triggerEvent,
      email,
      context,
      "marketing",
      `${envelope.eventId}:${String(watch.id)}`,
    );
    await service.updateEmailProductWatches({
      id: watch.id,
      notified: true,
      notified_at: new Date(),
    });
    triggered++;
  }

  logger.info(
    { alertType, eventId: envelope.eventId, productId, triggered },
    "processed product watch fan-out",
  );
  return true;
}

async function maybeCaptureCartPriceDropWatches(
  service: MessagingService,
  envelope: CommerceEventEnvelope,
) {
  const email = getEventRecipient(envelope);
  if (!email) return;

  if (envelope.type === "order.placed") {
    await service.completeCartPriceDropWatches(email);
    return;
  }
  if (envelope.type !== "cart.abandoned") return;

  const rawItems = Array.isArray(envelope.payload.items)
    ? envelope.payload.items
    : Array.isArray(envelope.payload.line_items)
      ? envelope.payload.line_items
      : Array.isArray(envelope.context.items)
        ? envelope.context.items
        : [];
  const checkoutUrl =
    stringValue(envelope.payload.checkout_url) ??
    stringValue(envelope.context.checkout_url);
  const currency =
    stringValue(envelope.payload.currency) ??
    stringValue(envelope.context.currency);
  const items = rawItems.flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== "object") return [];
    const item = rawItem as Record<string, unknown>;
    const productHandle = stringValue(item.product_handle);
    const productId = productHandle ?? stringValue(item.product_id);
    const quantity = numericValue(item.quantity) ?? 1;
    const referencePrice =
      numericValue(item.unit_price) ??
      numericValue(item.price) ??
      (numericValue(item.line_price) != null
        ? Number(item.line_price) / Math.max(1, quantity)
        : undefined);
    if (!productId || referencePrice == null) return [];
    return [
      {
        context: {
          checkout_url: checkoutUrl,
          currency,
          product_image_alt: item.image_alt ?? item.title,
          product_image_url: item.image_url ?? item.image ?? item.thumbnail,
          product_title: item.title ?? item.product_title,
          product_url: item.product_url,
          variant_sku: item.variant_sku ?? item.sku,
          variant_title: item.variant_title ?? item.variant,
        },
        currencyCode: currency,
        productId,
        referencePrice,
        variantId: productHandle ? undefined : stringValue(item.variant_id),
      },
    ];
  });
  // Treat the newest abandoned-cart snapshot as authoritative so a later cart
  // refreshes its checkout link and captured reference prices.
  await service.completeCartPriceDropWatches(email);
  await service.ensureCartPriceDropWatches({ email, items });
}

async function maybeMarkSpecificWatchNotified(
  service: MessagingService,
  envelope: CommerceEventEnvelope,
) {
  if (
    envelope.type !== "product.back_in_stock" &&
    envelope.type !== "product.price_drop"
  ) {
    return;
  }

  const watchId =
    stringValue(envelope.payload.watch_id) ??
    stringValue(envelope.context.watch_id);
  if (!watchId) {
    return;
  }

  await service.updateEmailProductWatches({
    id: watchId,
    notified: true,
    notified_at: new Date(),
  });
}

async function startFlow(
  service: MessagingService,
  data: StartFlowJob,
  logger: Logger,
) {
  const execution = await service.getFlowExecutionSnapshot(data.flowId);
  const flow = execution.flow;
  if (flow.status !== "active") {
    logger.debug(
      { flowId: data.flowId, status: flow.status },
      "flow not active",
    );
    return;
  }

  const pinnedSteps = await pinFlowTemplateVersions(
    service,
    execution.steps as FlowStep[],
  );
  const result = await service.createFlowRunSnapshot({
    context: data.context,
    flowId: data.flowId,
    flowVersionId: execution.flowVersionId,
    sourceEventId: data.sourceEventId,
    stepsSnapshot: pinnedSteps,
    subscriberEmail: data.email,
  });
  const run = result.run;
  if (!result.created) {
    logger.info(
      {
        flowId: data.flowId,
        flowRunId: run.id,
        sourceEventId: data.sourceEventId,
      },
      "duplicate flow start ignored",
    );
    return;
  }

  await queueStep({ flowRunId: String(run.id), stepPath: "0" });

  logger.info({ flowId: data.flowId, flowRunId: run.id }, "started flow run");
}

async function pinFlowTemplateVersions(
  service: MessagingService,
  steps: FlowStep[],
): Promise<FlowStep[]> {
  return Promise.all(
    steps.map(async (step) => {
      if (step.type === "condition") {
        return {
          ...step,
          false_branch: step.false_branch
            ? await pinFlowTemplateVersions(service, step.false_branch)
            : undefined,
          true_branch: step.true_branch
            ? await pinFlowTemplateVersions(service, step.true_branch)
            : undefined,
        };
      }
      if (step.type !== "email") {
        return step;
      }

      const template = await service.resolveEmailTemplateForDelivery(
        step.template_id,
      );
      const variants: FlowStepEmail["ab_variants"] = step.ab_variants
        ? Object.fromEntries(
            await Promise.all(
              Object.entries(step.ab_variants).map(async ([key, variant]) => {
                const variantTemplate =
                  await service.resolveEmailTemplateForDelivery(
                    variant.template_id,
                  );
                return [
                  key,
                  {
                    ...variant,
                    template_version_id:
                      typeof variantTemplate.template_version_id === "string"
                        ? variantTemplate.template_version_id
                        : undefined,
                  },
                ];
              }),
            ),
          )
        : undefined;

      return {
        ...step,
        ab_variants: variants,
        template_version_id:
          typeof template.template_version_id === "string"
            ? template.template_version_id
            : undefined,
      };
    }),
  );
}

async function executeStep(
  service: MessagingService,
  data: ExecuteStepJob,
  logger: Logger,
  retryCount = 0,
) {
  const run = await service.retrieveEmailFlowRun(data.flowRunId);
  if (run.status !== "running") {
    logger.debug(
      { flowRunId: data.flowRunId, status: run.status },
      "flow run not running",
    );
    return;
  }

  // During a rolling deploy, jobs from the previous worker may still contain
  // stepIndex. They are mapped to the equivalent top-level stable path.
  const stepPath = data.stepPath ?? String(data.stepIndex ?? 0);
  const steps = run.steps_snapshot as FlowStep[] | null;
  if (!Array.isArray(steps)) {
    throw new Error(`Flow run ${data.flowRunId} has no step snapshot`);
  }
  const step = flowStepAtPath(steps, stepPath);

  if (!step) {
    await service.updateEmailFlowRuns({
      completed_at: new Date(),
      id: data.flowRunId,
      status: "completed",
    });
    return;
  }

  try {
    if (step.type === "email") {
      await executeEmailStep(service, step, run, stepPath, logger);
      await queueNextSnapshotStep(steps, data.flowRunId, stepPath);
    } else if (step.type === "delay") {
      const startAfter = new Date(Date.now() + calculateFlowDelay(step));
      await queueNextSnapshotStep(steps, data.flowRunId, stepPath, {
        startAfter,
      });
    } else if (step.type === "condition") {
      await executeConditionStep(step, run, steps, data.flowRunId, stepPath);
    } else if (step.type === "discount") {
      await executeDiscountStep(service, step, run, stepPath, logger);
      await queueNextSnapshotStep(steps, data.flowRunId, stepPath);
    }

    await service.updateEmailFlowRuns({
      current_step_index: Number(stepPath.split(".")[0]),
      id: data.flowRunId,
    });
  } catch (error) {
    if (error instanceof EmailDeliveryDisabledError) throw error;
    await service.updateEmailFlowRuns({
      error_message: error instanceof Error ? error.message : String(error),
      id: data.flowRunId,
      status: retryCount >= 4 ? "failed" : "running",
    });
    throw error;
  }
}

async function executeEmailStep(
  service: MessagingService,
  step: FlowStepEmail,
  run: Record<string, unknown>,
  stepPath: string,
  logger: Logger,
) {
  if (step.step_status === "disabled") {
    logger.debug({ flowRunId: run.id }, "email step disabled");
    return;
  }

  const context = {
    ...((run.context as Record<string, unknown>) ?? {}),
    ...(await service.getEmailTemplateBrandContext()),
  };
  const messageKind =
    context.__message_kind === "transactional" ? "transactional" : "marketing";
  const subscriberEmail = normalizeEmail(String(run.subscriber_email));
  const suppression = await service.getSuppressionState(
    subscriberEmail,
    messageKind,
  );
  if (!suppression.allowed) {
    await logFlowEmailSkip(service, {
      category: "suppression",
      messageKind,
      reason: `Suppressed: ${suppression.reason}`,
      run,
      step,
      stepPath,
      subscriberEmail,
    });
    logger.info(
      { reason: suppression.reason, subscriberEmail },
      "email suppressed",
    );
    return;
  }

  const excludedEventTypes = step.skip_if_event_types_since_start ?? [];
  if (context.shopify_recovery_id) {
    const eligibility = await checkShopifyRecoveryEligibility(
      String(context.shopify_recovery_id),
      subscriberEmail,
      String(context.occurred_at ?? ""),
    );
    if (!eligibility.allowed) {
      await logFlowEmailSkip(service, {
        category: "recovery_eligibility",
        messageKind,
        reason: eligibility.reason ?? "Recovery is no longer eligible",
        run,
        step,
        stepPath,
        subscriberEmail,
      });
      return;
    }
  }
  if (excludedEventTypes.length > 0) {
    const occurredAt = new Date(String(context.occurred_at ?? ""));
    const runStartedAt = new Date(String(run.started_at));
    const since = Number.isNaN(occurredAt.getTime())
      ? runStartedAt
      : occurredAt;
    const excludedBy = await service.findCommerceEventSince({
      email: subscriberEmail,
      eventTypes: excludedEventTypes,
      orderId: step.skip_if_event_types_since_start_order_scoped
        ? String(context.order_id ?? "") || undefined
        : undefined,
      since,
    });
    if (excludedBy) {
      const eventType = String(excludedBy.event_type);
      const reason = `${eventType} occurred after this flow started`;
      await logFlowEmailSkip(service, {
        category: "event_filter",
        messageKind,
        reason,
        run,
        step,
        stepPath,
        subscriberEmail,
      });
      logger.info(
        {
          eventType,
          flowRunId: run.id,
          subscriberEmail,
        },
        "email skipped by send-time event filter",
      );
      return;
    }
  }

  const selectedVariant = selectFlowEmailVariant(step, subscriberEmail);
  const templateId = selectedVariant?.template_id || step.template_id;
  const templateVersionId =
    selectedVariant?.template_version_id ?? step.template_version_id;
  const template = await service.resolveEmailTemplateForDelivery(
    templateId,
    templateVersionId,
  );
  if (!template.is_active) {
    throw new Error(`Template ${templateId} is not active`);
  }

  const renderStep = selectedVariant
    ? {
        ...step,
        template_id: templateId,
        subject_override:
          selectedVariant.subject_override ?? step.subject_override,
      }
    : step;
  const built = buildEmailForStep(renderStep, template, context, run);
  let html = built.html;
  let oneClickUnsubscribeUrl: string | undefined;
  let unsubscribeUrl: string | undefined;
  if (messageKind === "marketing") {
    const links = await createUnsubscribeLinks(service, subscriberEmail);
    unsubscribeUrl = links.confirmationUrl;
    oneClickUnsubscribeUrl = links.oneClickUrl;
    html = insertBeforeBodyClose(html, buildUnsubscribeFooter(unsubscribeUrl));
  }

  const delivery = await sendRenderedEmail(service, {
    context,
    flowRunId: String(run.id),
    flowId: String(run.flow_id),
    flowStepKey: stepPath,
    flowVersionId:
      typeof run.flow_version_id === "string" ? run.flow_version_id : undefined,
    html,
    idempotencyKey: `flow/${String(run.id)}/${stepPath}`,
    messageKind,
    oneClickUnsubscribeUrl,
    metadata: {
      order_id: context.order_id,
      source: "flow",
      ab_test_flag: selectedVariant
        ? (step.ab_test_flag ?? "email-template-test")
        : undefined,
      ab_variant: selectedVariant?.key,
      ab_variant_template_id: selectedVariant?.template_id,
    },
    subject: built.subject,
    subscriberEmail,
    smartSendingHours: step.skip_recently_emailed
      ? (step.skip_recently_emailed_hours ?? 16)
      : undefined,
    template,
    templateVersionId:
      typeof template.template_version_id === "string"
        ? template.template_version_id
        : undefined,
    text: built.text,
    unsubscribeUrl,
  });
  if (delivery.skipped) {
    logger.info(
      {
        flowRunId: run.id,
        reason: delivery.skipReason,
        subscriberEmail,
      },
      "email skipped by smart sending",
    );
  }
}

async function executeConditionStep(
  step: FlowStepCondition,
  run: Record<string, unknown>,
  steps: FlowStep[],
  flowRunId: string,
  stepPath: string,
) {
  const context = (run.context as Record<string, unknown>) ?? {};
  const matches = evaluateFlowCondition(step, context);
  const branch = matches ? step.true_branch : step.false_branch;
  const branchName = matches ? "true" : "false";

  if (branch && branch.length > 0) {
    await queueStep({
      flowRunId,
      stepPath: `${stepPath}.${branchName}.0`,
    });
    return;
  }

  await queueNextSnapshotStep(steps, flowRunId, stepPath);
}

async function executeDiscountStep(
  service: MessagingService,
  step: FlowStepDiscount,
  run: Record<string, unknown>,
  stepPath: string,
  logger: Logger,
) {
  const context = (run.context as Record<string, unknown>) ?? {};
  const expiresAt = step.expires_in_days
    ? new Date(Date.now() + step.expires_in_days * 24 * 60 * 60 * 1000)
    : undefined;
  const stepKey = `flow/${String(run.id)}/${stepPath}`;
  const reserved = await service.reserveDiscountForStep({
    code: `${step.code_prefix}-${randomAlphanumeric(6)}`,
    currencyCode: step.currency_code,
    discountType: step.discount_type,
    discountValue: step.discount_value,
    expiresAt,
    flowId: String(run.flow_id),
    flowRunId: String(run.id),
    stepKey,
    subscriberEmail: String(run.subscriber_email),
    usageLimit: step.usage_limit || 1,
  });
  const discount = reserved.discount;
  if (discount.promotion_id) {
    logger.info(
      { flowRunId: run.id, stepPath },
      "discount step already completed",
    );
    return;
  }
  const promotion = await createCommercePromotion({
    code: String(discount.code),
    currencyCode: step.currency_code,
    discountType: step.discount_type,
    discountValue: step.discount_value,
    expiresAt,
    minPurchase: step.min_purchase,
    idempotencyKey: stepKey,
    usageLimit: step.usage_limit || 1,
  });

  await service.completeDiscountPromotion(
    String(discount.id),
    promotion.promotionId,
  );

  await service.updateEmailFlowRuns({
    context: {
      ...context,
      discount_code: promotion.code,
      discount_expires: expiresAt
        ? expiresAt.toLocaleDateString("en-US", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : undefined,
      discount_type: step.discount_type,
      discount_value: step.discount_value,
    },
    id: run.id,
  });

  logger.info({ flowRunId: run.id }, "discount step completed");
}

async function sendCampaign(
  service: MessagingService,
  campaignId: string,
  logger: Logger,
) {
  const campaign = await service.retrieveEmailCampaign(campaignId);
  if (!["scheduled", "sending"].includes(String(campaign.status))) {
    logger.info(
      { campaignId, status: campaign.status },
      "campaign not sendable",
    );
    return;
  }

  const revision = await service.ensureCampaignSendRevision(campaignId);
  const template = await service.resolveCampaignRevisionTemplate(
    String(revision.id),
  );
  if (!template.is_active) {
    throw new Error("Campaign template is inactive");
  }

  const subscribers = await service.getFilteredSubscribers(
    revision.audience_definition as Record<string, unknown> | null,
  );
  const recipients = await service.snapshotCampaignRecipients(
    campaignId,
    String(revision.id),
    subscribers,
  );
  await service.updateEmailCampaigns({
    id: campaignId,
    recipient_count: recipients.length,
    status: "sending",
  });

  let queuedRecipients = 0;
  for (const recipient of recipients) {
    if (!["pending", "failed"].includes(String(recipient.state))) {
      continue;
    }
    await sendJob(
      queueNames.sendCampaignRecipient,
      { campaignId, recipientId: recipient.id },
      retryOptions(),
    );
    queuedRecipients++;
  }

  if (queuedRecipients === 0) {
    await finalizeCampaignFromRecipients(service, campaignId);
  } else {
    await service.refreshCampaignCounts(campaignId);
  }
  logger.info(
    { campaignId, recipientCount: recipients.length },
    "campaign recipient jobs queued",
  );
}

async function sendCampaignRecipient(
  service: MessagingService,
  data: SendCampaignRecipientJob,
  logger: Logger,
) {
  const recipient = await service.claimCampaignRecipient(data.recipientId);
  if (!recipient) {
    return;
  }

  try {
    const campaign = await service.retrieveEmailCampaign(data.campaignId);
    const revisionId =
      typeof recipient.campaign_revision_id === "string"
        ? recipient.campaign_revision_id
        : String(campaign.send_revision_id);
    const revision = await service.retrieveEmailCampaignRevision(revisionId);
    const template = await service.resolveCampaignRevisionTemplate(revisionId);
    const email = normalizeEmail(String(recipient.email));
    const suppression = await service.getSuppressionState(email, "marketing");
    if (!suppression.allowed) {
      await service.completeCampaignRecipient(data.recipientId, "skipped");
      await finalizeCampaignFromRecipients(service, data.campaignId);
      return;
    }

    const subscriber = recipient.subscriber_id
      ? await service
          .retrieveEmailSubscriber(String(recipient.subscriber_id))
          .catch(() => null)
      : null;
    const runtime = await service.getRuntimeSettings();
    const context = {
      ...brandTemplateContext(),
      ...((revision.context as Record<string, unknown> | null) ?? {}),
      email,
      first_name: subscriber?.first_name ?? "",
      last_name: subscriber?.last_name ?? "",
      ...(await service.getEmailTemplateBrandContext(runtime)),
    };
    const subject = renderHandlebarsTemplate(
      String(revision.subject || template.subject),
      context,
    );
    const links = await createUnsubscribeLinks(service, email);
    const unsubscribeUrl = links.confirmationUrl;
    const oneClickUnsubscribeUrl = links.oneClickUrl;
    const html = insertBeforeBodyClose(
      renderHandlebarsTemplate(String(template.html_content), context),
      buildUnsubscribeFooter(unsubscribeUrl),
    );
    const text =
      typeof template.text_content === "string"
        ? renderHandlebarsTemplate(template.text_content, context)
        : undefined;

    const delivery = await sendRenderedEmail(service, {
      campaignId: data.campaignId,
      campaignRecipientId: data.recipientId,
      campaignRevisionId: revisionId,
      context,
      html,
      idempotencyKey: String(recipient.delivery_key),
      messageKind: "marketing",
      metadata: { campaign_id: data.campaignId, campaign_name: campaign.name },
      oneClickUnsubscribeUrl,
      subject,
      subscriberEmail: email,
      smartSendingHours: 16,
      template,
      templateVersionId:
        typeof template.template_version_id === "string"
          ? template.template_version_id
          : undefined,
      text,
      unsubscribeUrl,
    });
    await service.completeCampaignRecipient(
      data.recipientId,
      delivery.skipped ? "skipped" : "sent",
      { providerId: delivery.messageId },
    );
    await finalizeCampaignFromRecipients(service, data.campaignId);
  } catch (error) {
    if (error instanceof EmailDeliveryDisabledError) {
      await service.releaseCampaignRecipient(data.recipientId);
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    await service.completeCampaignRecipient(data.recipientId, "failed", {
      error: message,
    });
    await finalizeCampaignFromRecipients(service, data.campaignId);
    logger.warn(
      { campaignId: data.campaignId, error, recipientId: data.recipientId },
      "campaign recipient failed",
    );
    throw error;
  }
}

async function finalizeCampaignFromRecipients(
  service: MessagingService,
  campaignId: string,
) {
  const counts = await service.refreshCampaignCounts(campaignId);
  if (counts.pendingCount > 0) {
    return;
  }
  await service.updateEmailCampaigns({
    id: campaignId,
    sent_at: new Date(),
    status: counts.failedCount > 0 ? "failed" : "sent",
  });
}

async function queueStep(
  data: ExecuteStepJob,
  options: Record<string, unknown> = {},
) {
  await sendJob(
    queueNames.executeStep,
    { ...data },
    { ...retryOptions(), ...options },
  );
}

async function queueNextSnapshotStep(
  steps: FlowStep[],
  flowRunId: string,
  currentPath: string,
  options: Record<string, unknown> = {},
) {
  const next = nextFlowStepPath(steps, currentPath);
  if (!next) {
    await queueStep(
      { flowRunId, stepPath: terminalPath(currentPath) },
      options,
    );
    return;
  }
  await queueStep({ flowRunId, stepPath: next }, options);
}

function retryOptions() {
  return { retryBackoff: true, retryDelay: 30, retryLimit: 5 };
}

function terminalPath(currentPath: string): string {
  const topLevel = Number(currentPath.split(".")[0]);
  return String(
    Number.isFinite(topLevel) ? topLevel + 1_000_000_000 : 1_000_000_000,
  );
}

async function logFlowEmailSkip(
  service: MessagingService,
  input: {
    category: "event_filter" | "suppression" | "recovery_eligibility";
    messageKind: "marketing" | "transactional";
    reason: string;
    run: Record<string, unknown>;
    step: FlowStepEmail;
    stepPath: string;
    subscriberEmail: string;
  },
) {
  const context = (input.run.context as Record<string, unknown> | null) ?? {};
  await service.logEmailEvent({
    event_type: "skipped",
    flow_run_id: String(input.run.id),
    flow_step_key: input.stepPath,
    metadata: {
      flow_id: input.run.flow_id,
      message_kind: input.messageKind,
      order_id: context.order_id,
      skip_category: input.category,
      skip_reason: input.reason,
      trigger_event: context.__trigger_event,
    },
    provider_event_id: `skip:flow/${String(input.run.id)}/${input.stepPath}/${input.category}`,
    subscriber_email: input.subscriberEmail,
    template_id: input.step.template_id,
    template_version_id: input.step.template_version_id ?? null,
  });
}

function buildEventContext(
  envelope: CommerceEventEnvelope,
  email: string,
  extra: Record<string, unknown> = {},
) {
  return {
    ...brandTemplateContext(),
    ...envelope.context,
    ...envelope.payload,
    ...extra,
    email,
    event_id: envelope.eventId,
    occurred_at: envelope.occurredAt,
  };
}

function brandTemplateContext() {
  const storeUrl = process.env.STOREFRONT_URL ?? "https://example.com";
  return {
    care_guide_url: `${storeUrl}/pages/care-guide`,
    editorial_image_alt: "Your store collection",
    editorial_image_url: process.env.EMAIL_EDITORIAL_IMAGE_URL ?? "",
    store_name: "Your store",
    store_url: storeUrl,
  };
}

async function createUnsubscribeLinks(
  service: MessagingService,
  email: string,
) {
  const { token } = await service.createEmailPreferenceLink(
    email,
    "unsubscribe",
  );
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL is required for unsubscribe links");
  return {
    confirmationUrl: `${base}/unsubscribe?token=${encodeURIComponent(token)}`,
    oneClickUrl: `${base}/api/store/email-unsubscribe?token=${encodeURIComponent(token)}`,
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numericValue(value: unknown) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value !== "") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
}
