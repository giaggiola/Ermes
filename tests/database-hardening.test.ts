import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import {
  emailPreferenceLinks,
  getDb,
  getPool,
  MessagingService,
  runMigrations,
} from "../packages/db/dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

after(async () => {
  if (databaseUrl) {
    await getPool().end();
  }
});

test(
  "unsubscribe links use expiring opaque tokens stored only as hashes",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    await runMigrations();
    const db = getDb();
    const service = new MessagingService(db);
    const email = `opaque-link-${Date.now()}@example.com`;
    const link = await service.createEmailPreferenceLink(
      email,
      "unsubscribe",
      { expiresInSeconds: 60 },
    );

    assert.match(link.token, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(link.token.includes(email), false);
    assert.equal(
      (await service.resolveEmailPreferenceLink(link.token, "unsubscribe"))
        ?.email,
      email,
    );
    assert.equal(
      await service.resolveEmailPreferenceLink(link.token, "preferences"),
      null,
    );

    const tokenHash = createHash("sha256").update(link.token).digest("hex");
    const [stored] = await db
      .select()
      .from(emailPreferenceLinks)
      .where(eq(emailPreferenceLinks.tokenHash, tokenHash));
    assert.equal(stored?.tokenHash, tokenHash);
    assert.notEqual(stored?.tokenHash, link.token);

    await db
      .update(emailPreferenceLinks)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(emailPreferenceLinks.tokenHash, tokenHash));
    assert.equal(
      await service.resolveEmailPreferenceLink(link.token, "unsubscribe"),
      null,
    );
  },
);

test(
  "database-backed idempotency survives concurrent claims and partial campaign retries",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    await runMigrations();
    const service = new MessagingService(getDb());
    const senderEmail = `sender-${Date.now()}@example.com`;
    await service.updateRuntimeSettings({
      emailFrom: senderEmail,
      emailLogoUrl: "https://cdn.example.com/eilish-email-logo.png",
      emailSenderName: "Messaging Test",
    });
    const runtime = await service.getRuntimeSettings();
    assert.equal(runtime.emailFrom, senderEmail);
    assert.equal(
      runtime.emailLogoUrl,
      "https://cdn.example.com/eilish-email-logo.png",
    );
    assert.equal(runtime.emailSenderName, "Messaging Test");
    assert.equal(runtime.source, "database");
    assert.deepEqual(await service.getEmailTemplateBrandContext(runtime), {
      email_logo_url: "https://cdn.example.com/eilish-email-logo.png",
      store_name: "Messaging Test",
      store_url: process.env.STOREFRONT_URL ?? "https://example.com",
    });
    await assert.rejects(
      service.updateRuntimeSettings({
        emailLogoUrl: "http://cdn.example.com/insecure-logo.png",
      }),
      /absolute HTTPS URL/,
    );
    const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const templateId = `template_${suffix}`;
    await service.createEmailTemplates([
      {
        _publish: true,
        html_content: "<p>Hello</p>",
        id: templateId,
        is_active: true,
        name: "Concurrency fixture",
        subject: "Hello",
      },
    ]);
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        service.updateEmailTemplates({
          html_content: `<p>Draft ${index}</p>`,
          id: templateId,
          subject: `Draft ${index}`,
        }),
      ),
    );
    const templateVersions =
      await service.listEmailTemplateVersions(templateId);
    assert.equal(templateVersions.length, 6);
    assert.equal(
      new Set(templateVersions.map((version) => version.version)).size,
      6,
    );

    const subscriptionEmail = `welcome-${suffix}@example.com`;
    const initialSubscriptions = await Promise.all(
      Array.from({ length: 6 }, () =>
        service.subscribeWithStatus(subscriptionEmail, {
          source: "concurrent-test",
        }),
      ),
    );
    assert.equal(
      initialSubscriptions.filter((result) => result.welcomeEligible).length,
      1,
    );
    await service.unsubscribe(subscriptionEmail);
    const resubscriptions = await Promise.all(
      Array.from({ length: 6 }, () =>
        service.subscribeWithStatus(subscriptionEmail, {
          source: "concurrent-resubscribe-test",
        }),
      ),
    );
    assert.equal(
      resubscriptions.filter((result) => result.welcomeEligible).length,
      1,
    );

    const flowId = `flow_${suffix}`;
    const sourceEventId = `order.placed:${suffix}`;
    const runAttempts = await Promise.all(
      Array.from({ length: 6 }, () =>
        service.createFlowRunSnapshot({
          context: { order_id: suffix },
          flowId,
          sourceEventId,
          stepsSnapshot: [{ type: "email", template_id: templateId }],
          subscriberEmail: `person-${suffix}@example.com`,
        }),
      ),
    );
    assert.equal(runAttempts.filter((attempt) => attempt.created).length, 1);
    assert.equal(
      new Set(runAttempts.map((attempt) => attempt.run.id)).size,
      1,
    );
    assert.deepEqual(runAttempts[0].run.steps_snapshot, [
      { type: "email", template_id: templateId },
    ]);

    const deliveryKey = `flow/${String(runAttempts[0].run.id)}/0`;
    const deliveryClaims = await Promise.all(
      Array.from({ length: 4 }, () =>
        service.claimDelivery({
          flowId,
          flowRunId: String(runAttempts[0].run.id),
          idempotencyKey: deliveryKey,
          messageKind: "marketing",
          recipientEmail: `person-${suffix}@example.com`,
          templateId,
        }),
      ),
    );
    assert.equal(
      deliveryClaims.filter((claim) => claim.claim === "acquired").length,
      1,
    );
    await service.completeDelivery(deliveryKey, {
      providerId: `resend_${suffix}`,
      state: "sent",
    });
    assert.equal(
      (
        await service.claimDelivery({
          flowId,
          flowRunId: String(runAttempts[0].run.id),
          idempotencyKey: deliveryKey,
          messageKind: "marketing",
          recipientEmail: `person-${suffix}@example.com`,
          templateId,
        })
      ).claim,
      "complete",
    );

    const smartSendingEmail = `smart-${suffix}@example.com`;
    const smartSendingAt = new Date();
    const smartSendingClaims = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        service.claimMarketingSendWindow({
          email: smartSendingEmail,
          hours: 16,
          now: smartSendingAt,
          source: `concurrent-flow-${index}`,
        }),
      ),
    );
    assert.equal(
      smartSendingClaims.filter((claim) => claim.allowed).length,
      1,
    );
    assert.equal(
      (
        await service.claimMarketingSendWindow({
          email: smartSendingEmail,
          hours: 16,
          now: new Date(smartSendingAt.getTime() + 15 * 60 * 60 * 1000),
          source: "too-soon",
        })
      ).allowed,
      false,
    );
    assert.equal(
      (
        await service.claimMarketingSendWindow({
          email: smartSendingEmail,
          hours: 16,
          now: new Date(smartSendingAt.getTime() + 16 * 60 * 60 * 1000),
          source: "window-elapsed",
        })
      ).allowed,
      true,
    );

    const eventFilterEmail = `event-filter-${suffix}@example.com`;
    const eventFilterSince = new Date(Date.now() - 60_000);
    await service.insertCommerceEvent({
      eventId: `order.placed:event-filter-${suffix}`,
      eventType: "order.placed",
      payload: {
        context: { email: eventFilterEmail },
        eventId: `order.placed:event-filter-${suffix}`,
        occurredAt: new Date().toISOString(),
        payload: { email: eventFilterEmail },
        type: "order.placed",
      },
    });
    assert.equal(
      (
        await service.findCommerceEventSince({
          email: eventFilterEmail,
          eventTypes: ["order.placed"],
          since: eventFilterSince,
        })
      )?.event_type,
      "order.placed",
    );
    assert.equal(
      await service.findCommerceEventSince({
        email: `other-${suffix}@example.com`,
        eventTypes: ["order.placed"],
        since: eventFilterSince,
      }),
      null,
    );

    const [campaign] = await service.createEmailCampaigns([
      {
        id: `campaign_${suffix}`,
        name: "Snapshot test",
        status: "draft",
        subject: "Hello",
        template_id: templateId,
      },
    ]);
    const scheduledAt = new Date(Date.now() + 60_000);
    await service.updateEmailCampaigns({
      id: String(campaign.id),
      scheduled_at: scheduledAt,
      status: "scheduled",
    });
    assert.equal(
      (
        await service.listDueScheduledEmailCampaigns(
          new Date(scheduledAt.getTime() - 1),
        )
      ).some((candidate) => candidate.id === campaign.id),
      false,
    );
    assert.equal(
      (
        await service.listDueScheduledEmailCampaigns(scheduledAt)
      ).some((candidate) => candidate.id === campaign.id),
      true,
    );
    await service.updateEmailCampaigns({
      id: String(campaign.id),
      scheduled_at: null,
      status: "draft",
    });
    const initialAudience = [
      { email: `one-${suffix}@example.com`, id: `subscriber_one_${suffix}` },
      { email: `two-${suffix}@example.com`, id: `subscriber_two_${suffix}` },
    ];
    const campaignRevisions = await Promise.all(
      Array.from({ length: 6 }, () =>
        service.ensureCampaignSendRevision(String(campaign.id)),
      ),
    );
    assert.equal(
      new Set(campaignRevisions.map((revision) => revision.id)).size,
      1,
    );
    const campaignRevisionId = String(campaignRevisions[0].id);
    const firstSnapshot = await service.snapshotCampaignRecipients(
      String(campaign.id),
      campaignRevisionId,
      initialAudience,
    );
    const resumedSnapshot = await service.snapshotCampaignRecipients(
      String(campaign.id),
      campaignRevisionId,
      [
        ...initialAudience,
        {
          email: `late-${suffix}@example.com`,
          id: `subscriber_late_${suffix}`,
        },
      ],
    );
    assert.equal(firstSnapshot.length, 2);
    assert.equal(resumedSnapshot.length, 2);
    assert.equal(
      resumedSnapshot.some((recipient) =>
        String(recipient.email).startsWith("late-"),
      ),
      false,
    );

    const firstRecipient = resumedSnapshot[0];
    const secondRecipient = resumedSnapshot[1];
    assert.ok(await service.claimCampaignRecipient(String(firstRecipient.id)));
    assert.ok(await service.claimCampaignRecipient(String(secondRecipient.id)));
    await service.completeCampaignRecipient(String(firstRecipient.id), "sent", {
      providerId: `resend_campaign_${suffix}`,
    });
    await service.completeCampaignRecipient(
      String(secondRecipient.id),
      "failed",
      { error: "temporary provider failure" },
    );
    const partialCounts = await service.refreshCampaignCounts(
      String(campaign.id),
    );
    assert.deepEqual(
      {
        failed: partialCounts.failedCount,
        pending: partialCounts.pendingCount,
        sent: partialCounts.sentCount,
      },
      { failed: 1, pending: 0, sent: 1 },
    );
    assert.ok(await service.claimCampaignRecipient(String(secondRecipient.id)));
    await service.completeCampaignRecipient(String(secondRecipient.id), "sent");
    const resumedCounts = await service.refreshCampaignCounts(
      String(campaign.id),
    );
    assert.deepEqual(
      {
        failed: resumedCounts.failedCount,
        pending: resumedCounts.pendingCount,
        sent: resumedCounts.sentCount,
      },
      { failed: 0, pending: 0, sent: 2 },
    );

    const discountReservations = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        service.reserveDiscountForStep({
          code: `WELCOME-${suffix}-${index}`,
          discountType: "percentage",
          discountValue: 10,
          flowId,
          flowRunId: String(runAttempts[0].run.id),
          stepKey: `flow/${String(runAttempts[0].run.id)}/1`,
          subscriberEmail: `person-${suffix}@example.com`,
          usageLimit: 1,
        }),
      ),
    );
    assert.equal(
      discountReservations.filter((reservation) => reservation.created).length,
      1,
    );
    assert.equal(
      new Set(
        discountReservations.map((reservation) => reservation.discount.id),
      ).size,
      1,
    );

    const rateResults = await Promise.all(
      Array.from({ length: 4 }, () =>
        service.consumePublicRateLimit({
          action: `subscribe:ip:${suffix}`,
          keyHash: "f".repeat(64),
          limit: 3,
          now: new Date("2026-07-28T12:00:00Z"),
          windowSeconds: 900,
        }),
      ),
    );
    assert.equal(rateResults.filter((result) => result.allowed).length, 3);
    assert.equal(Math.max(...rateResults.map((result) => result.count)), 4);
  },
);

test(
  "signup form autosaves stay mutable while snapshots and publishes are explicit",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    await runMigrations();
    const service = new MessagingService(getDb());
    const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const formId = `form_${suffix}`;
    const [form] = await service.createSignupForms([
      {
        document: {
          schema_version: 1,
          steps: [],
          styles: {},
          targeting: {
            cooldown_days: 30,
            delay_ms: 5000,
            hide_when_logged_in: true,
          },
        },
        id: formId,
        name: "Publishing fixture",
        status: "draft",
        type: "popup",
      },
    ]);

    assert.equal(form.draft_version_id, null);
    assert.deepEqual(await service.listSignupFormVersions(formId), []);

    await service.updateSignupForms({
      document: {
        ...form.document,
        targeting: {
          ...form.document.targeting,
          delay_ms: 7000,
        },
      },
      id: formId,
    });
    assert.deepEqual(await service.listSignupFormVersions(formId), []);

    const experimentSnapshot = await service.createSignupFormVersion(
      formId,
      "ops@example.com",
    );
    assert.equal(experimentSnapshot.form_id, formId);
    assert.equal(experimentSnapshot.version, 1);

    const candidateDocument = {
      ...form.document,
      styles: { background: "#f7f4ef" },
      targeting: { devices: ["mobile"] },
    };
    const candidateSnapshot = await service.createSignupFormVersion(
      formId,
      "ops@example.com",
      candidateDocument,
    );
    assert.deepEqual(candidateSnapshot.document, candidateDocument);
    assert.equal(
      (await service.retrieveSignupForm(formId)).draft_version_id,
      form.draft_version_id,
    );
    await service.deleteSignupFormVersion(
      formId,
      String(candidateSnapshot.id),
    );

    await service.updateSignupForms({
      document: {
        ...form.document,
        targeting: {
          ...form.document.targeting,
          delay_ms: 9000,
        },
      },
      id: formId,
    });
    assert.equal((await service.listSignupFormVersions(formId)).length, 1);

    const published = await service.publishSignupFormVersion(formId);
    assert.equal(published.form_id, formId);
    assert.equal(published.version, 2);
    assert.equal(
      (published.document as { targeting: { delay_ms: number } }).targeting
        .delay_ms,
      9000,
    );

    const updated = await service.retrieveSignupForm(formId);
    assert.equal(updated.published_version_id, published.id);
    assert.equal(updated.draft_version_id, published.id);
    assert.equal(updated.status, "published");

    await assert.rejects(
      service.deleteSignupFormVersion(formId, String(published.id)),
      /cannot be deleted/,
    );

    await service.updateSignupForms({
      document: {
        ...form.document,
        targeting: {
          ...form.document.targeting,
          delay_ms: 11000,
        },
      },
      id: formId,
    });
    const republished = await service.publishSignupFormVersion(formId);
    const retained = await service.listSignupFormVersions(formId);
    assert.deepEqual(
      retained.map((version) => version.id).sort(),
      [experimentSnapshot.id, republished.id].sort(),
    );

    const deletion = await service.deleteSignupFormVersion(
      formId,
      String(experimentSnapshot.id),
    );
    assert.equal(deletion.deleted, true);
    assert.deepEqual(
      (await service.listSignupFormVersions(formId)).map((version) => version.id),
      [republished.id],
    );
  },
);

test(
  "deliverability analytics aggregate unique messages, consent, domains, providers, and dates",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    await runMigrations();
    const service = new MessagingService(getDb());
    const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const base = new Date(
      Date.now() +
        10 * 365 * 24 * 60 * 60 * 1000 +
        Math.floor(Math.random() * 1_000_000_000),
    );
    const at = (seconds: number) =>
      new Date(base.getTime() + seconds * 1000);
    const gmail = `analytics-${suffix}@gmail.com`;
    const outlook = `analytics-${suffix}@outlook.com`;
    const messageOne = `analytics_resend_one_${suffix}`;
    const messageTwo = `analytics_resend_two_${suffix}`;
    const messageThree = `analytics_smtp_three_${suffix}`;

    await service.createEmailEvents([
      {
        created_at: at(1),
        event_type: "sent",
        message_id: messageOne,
        metadata: { provider: "resend" },
        subscriber_email: gmail,
      },
      {
        created_at: at(2),
        event_type: "delivered",
        message_id: messageOne,
        metadata: { provider: "resend" },
        subscriber_email: gmail,
      },
      {
        created_at: at(3),
        event_type: "opened",
        message_id: messageOne,
        metadata: { provider: "resend" },
        subscriber_email: gmail,
      },
      {
        created_at: at(4),
        event_type: "opened",
        message_id: messageOne,
        metadata: { provider: "resend" },
        subscriber_email: gmail,
      },
      {
        created_at: at(5),
        event_type: "clicked",
        message_id: messageOne,
        metadata: { provider: "resend" },
        subscriber_email: gmail,
      },
      {
        created_at: at(6),
        event_type: "sent",
        message_id: messageTwo,
        metadata: { provider: "resend" },
        subscriber_email: outlook,
      },
      {
        created_at: at(7),
        event_type: "bounced",
        message_id: messageTwo,
        metadata: { provider: "resend" },
        subscriber_email: outlook,
      },
      {
        created_at: at(8),
        event_type: "sent",
        message_id: messageThree,
        metadata: { provider: "smtp" },
        subscriber_email: gmail,
      },
      {
        created_at: at(9),
        event_type: "delivered",
        message_id: messageThree,
        metadata: { provider: "smtp" },
        subscriber_email: gmail,
      },
      {
        created_at: at(10),
        event_type: "complained",
        message_id: messageThree,
        metadata: { provider: "smtp" },
        subscriber_email: gmail,
      },
      {
        created_at: at(10),
        event_type: "skipped",
        metadata: {
          provider: "resend",
          skip_category: "smart_sending",
        },
        subscriber_email: gmail,
      },
    ]);
    await service.recordConsentEvent({
      action: "unsubscribed",
      email: gmail,
      occurredAt: at(11),
      source: "analytics-test",
    });

    const analytics = await service.getDeliverabilityAnalytics({
      from: base,
      to: at(60),
    });

    assert.deepEqual(analytics.totals, {
      bounce_rate: 33.3,
      bounced: 1,
      click_rate: 33.3,
      clicked: 1,
      complaint_rate: 33.3,
      complained: 1,
      delivered: 2,
      delivery_rate: 66.7,
      open_rate: 33.3,
      opened: 1,
      sent: 3,
      unsubscribe_rate: 33.3,
      unsubscribed: 1,
    });
    assert.equal(analytics.daily.length, 1);
    assert.deepEqual(
      analytics.daily[0],
      {
        bounced: 1,
        clicked: 1,
        complained: 1,
        date: analytics.daily[0].date,
        delivered: 2,
        opened: 1,
        sent: 3,
        unsubscribed: 1,
      },
    );

    const gmailMetrics = analytics.domains.find(
      (row) => row.domain === "gmail.com",
    );
    assert.equal(gmailMetrics?.sent, 2);
    assert.equal(gmailMetrics?.delivered, 2);
    assert.equal(gmailMetrics?.complained, 1);
    assert.equal(gmailMetrics?.unsubscribed, 1);

    const resendMetrics = analytics.providers.find(
      (row) => row.provider === "resend",
    );
    assert.equal(resendMetrics?.sent, 2);
    assert.equal(resendMetrics?.delivered, 1);
    assert.equal(resendMetrics?.bounced, 1);
    assert.equal(resendMetrics?.opened, 1);

    const smtpMetrics = analytics.providers.find(
      (row) => row.provider === "smtp",
    );
    assert.equal(smtpMetrics?.sent, 1);
    assert.equal(smtpMetrics?.delivered, 1);
    assert.equal(smtpMetrics?.complained, 1);
  },
);

test(
  "deleting a subscriber resets flow re-entry eligibility without erasing audit history",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    await runMigrations();
    const service = new MessagingService(getDb());
    const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const email = `delete-reentry-${suffix}@example.com`;
    const flowId = `delete-reentry-flow-${suffix}`;
    const subscription = await service.subscribeWithStatus(email, {
      source: "delete-reentry-test",
    });
    await service.createFlowRunSnapshot({
      context: {},
      flowId,
      sourceEventId: `delete-reentry-event-${suffix}`,
      stepsSnapshot: [],
      subscriberEmail: email,
    });
    const checkFlowReentry = (
      service as unknown as {
        checkFlowReentry: (
          flow: Record<string, unknown>,
          subscriberEmail: string,
        ) => Promise<{ allowed: boolean }>;
      }
    ).checkFlowReentry.bind(service);

    assert.equal(
      (await checkFlowReentry({ id: flowId, reentry_mode: "never" }, email))
        .allowed,
      false,
    );

    await service.deleteEmailSubscribers(String(subscription.subscriber.id));

    assert.equal((await service.listEmailSubscribers({ email })).length, 0);
    assert.equal(
      (
        await service.listEmailFlowRuns({
          flow_id: flowId,
          subscriber_email: email,
        })
      ).length,
      0,
    );
    const auditRuns = await service.listEmailFlowRuns({
      flow_id: flowId,
      includeDeleted: true,
      subscriber_email: email,
    });
    assert.equal(auditRuns.length, 1);
    assert.ok(auditRuns[0].deleted_at);
    assert.equal(
      (await checkFlowReentry({ id: flowId, reentry_mode: "never" }, email))
        .allowed,
      true,
    );

    const recreated = await service.subscribeWithStatus(email, {
      source: "delete-reentry-test",
    });
    assert.equal(recreated.welcomeEligible, true);
  },
);

test(
  "Medusa flow drafts install idempotently without replacing a legacy welcome flow",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    await runMigrations();
    const service = new MessagingService(getDb());
    const welcomeTemplateId = "tpl_welcome_newsletter_v1";
    const welcomeFlowId = "flow_welcome_newsletter_v1";

    if (
      (await service.listEmailTemplates({ id: welcomeTemplateId })).length === 0
    ) {
      await service.createEmailTemplates([
        {
          _publish: true,
          html_content: "<p>Existing welcome</p>",
          id: welcomeTemplateId,
          is_active: true,
          name: "Existing welcome",
          subject: "Existing welcome",
        },
      ]);
    }
    if ((await service.listEmailFlows({ id: welcomeFlowId })).length === 0) {
      await service.createEmailFlows([
        {
          id: welcomeFlowId,
          message_kind: "marketing",
          name: "Existing welcome",
          reentry_mode: "never",
          status: "active",
          steps: [
            {
              step_id: "existing-welcome",
              step_status: "live",
              template_id: welcomeTemplateId,
              type: "email",
            },
          ],
          trigger_event: "newsletter.subscribed",
        },
      ]);
    }

    const welcomeBefore = await service.retrieveEmailFlow(welcomeFlowId);
    const runCountBefore = (await service.listEmailFlowRuns()).length;
    const first = await service.installStandardFlowDrafts();
    assert.equal(first.created_flow_ids.includes(welcomeFlowId), false);
    assert.equal(first.created_template_ids.includes(welcomeTemplateId), false);
    assert.equal(first.existing_flow_ids.includes(welcomeFlowId), false);
    assert.equal(first.existing_template_ids.includes(welcomeTemplateId), false);

    const catalogue = await service.getStandardFlowRecipeCatalogue();
    assert.equal(catalogue.length, 17);
    assert.equal(catalogue.every((recipe) => recipe.flow_installed), true);
    assert.equal(catalogue.every((recipe) => recipe.template_installed), true);

    const installedFlows = await Promise.all(
      catalogue.map((recipe) => service.retrieveEmailFlow(recipe.flow_id)),
    );
    for (const [index, flow] of installedFlows.entries()) {
      const recipe = catalogue[index];
      assert.equal(flow.status, "draft");
      assert.equal(flow.message_kind, recipe.message_kind);
      const emailSteps = (
        flow.steps as Array<Record<string, unknown>>
      ).filter((step) => step.type === "email");
      assert.ok(
        emailSteps.some((step) => step.step_status === "disabled"),
      );
      if (flow.message_kind === "marketing" && recipe.key !== "welcome") {
        assert.ok(
          emailSteps.every(
            (step) =>
              step.skip_recently_emailed === true &&
              step.skip_recently_emailed_hours === 16,
          ),
        );
      }
    }

    const abandonedCart = await service.retrieveEmailFlow(
      "flow_medusa_abandoned_cart_v2",
    );
    assert.equal(abandonedCart.reentry_mode, "after_duration");
    assert.equal(abandonedCart.reentry_duration, 7);
    assert.equal(abandonedCart.reentry_unit, "days");
    const abandonedCartSteps = (
      abandonedCart.steps as Array<Record<string, unknown>>
    ).map((step) => {
      if (step.type !== "email") return step;
      const {
        skip_if_event_types_since_start: _eventFilters,
        skip_recently_emailed: _smartSending,
        skip_recently_emailed_hours: _smartSendingHours,
        ...withoutSafety
      } = step;
      return withoutSafety;
    });
    await service.updateEmailFlows({
      id: "flow_medusa_abandoned_cart_v2",
      reentry_duration: null,
      reentry_mode: "always",
      reentry_unit: null,
      steps: abandonedCartSteps,
    });
    const postPurchase = await service.retrieveEmailFlow(
      "flow_medusa_post_delivery_follow_up_v2",
    );
    const postPurchaseSteps = (
      postPurchase.steps as Array<Record<string, unknown>>
    ).map((step) => {
      if (step.type !== "email") return step;
      const {
        skip_recently_emailed: _smartSending,
        skip_recently_emailed_hours: _smartSendingHours,
        ...withoutSafety
      } = step;
      return withoutSafety;
    });
    await service.updateEmailFlows({
      id: "flow_medusa_post_delivery_follow_up_v2",
      steps: postPurchaseSteps,
    });

    const versionCountsBefore = new Map(
      await Promise.all(
        catalogue.map(async (recipe) => [
          recipe.flow_id,
          (await service.listEmailFlowVersions(recipe.flow_id)).length,
        ] as const),
      ),
    );
    const second = await service.installStandardFlowDrafts();
    assert.deepEqual(second.created_flow_ids, []);
    assert.deepEqual(second.created_template_ids, []);
    assert.equal(second.existing_flow_ids.length, 17);
    assert.equal(second.existing_template_ids.length, 18);
    assert.deepEqual(second.updated_flow_ids, [
      "flow_medusa_abandoned_cart_v2",
      "flow_medusa_post_delivery_follow_up_v2",
    ]);
    for (const recipe of catalogue) {
      assert.equal(
        (await service.listEmailFlowVersions(recipe.flow_id)).length,
        Number(versionCountsBefore.get(recipe.flow_id)) +
          ([
            "flow_medusa_abandoned_cart_v2",
            "flow_medusa_post_delivery_follow_up_v2",
          ].includes(recipe.flow_id)
            ? 1
            : 0),
      );
    }

    const versionCountsAfterRepair = new Map(
      await Promise.all(
        catalogue.map(async (recipe) => [
          recipe.flow_id,
          (await service.listEmailFlowVersions(recipe.flow_id)).length,
        ] as const),
      ),
    );
    const third = await service.installStandardFlowDrafts();
    assert.deepEqual(third.created_flow_ids, []);
    assert.deepEqual(third.created_template_ids, []);
    assert.deepEqual(third.updated_flow_ids, []);
    for (const recipe of catalogue) {
      assert.equal(
        (await service.listEmailFlowVersions(recipe.flow_id)).length,
        versionCountsAfterRepair.get(recipe.flow_id),
      );
    }

    const welcomeAfter = await service.retrieveEmailFlow(welcomeFlowId);
    assert.equal(welcomeAfter.name, welcomeBefore.name);
    assert.equal(welcomeAfter.status, welcomeBefore.status);
    assert.deepEqual(welcomeAfter.steps, welcomeBefore.steps);
    assert.equal((await service.listEmailFlowRuns()).length, runCountBefore);
  },
);
