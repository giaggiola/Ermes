import assert from "node:assert/strict";
import test from "node:test";

import {
  createEilishSignature,
  verifyEilishSignature,
} from "../packages/core/dist/http-signing.js";
import {
  evaluateTriggerConditions,
  getFlowReentryDecision,
  getSuppressionDecision,
  resolveFlowMessageKind,
} from "../packages/core/dist/delivery-policy.js";
import {
  calculateFlowDelay,
  evaluateFlowCondition,
  flowStepAtPath,
  nextFlowStepPath,
  selectFlowEmailVariant,
} from "../packages/core/dist/flow-runtime.js";
import { hasDeterministicEventId } from "../packages/core/dist/idempotency.js";
import {
  createOpsAdminSignature,
  verifyOpsAdminSignature,
} from "../packages/core/dist/ops-admin-signing.js";
import {
  buildUnsubscribeUrls,
  buildStorefrontUnsubscribeUrls,
  createPreferenceToken,
  verifyPreferenceToken,
} from "../packages/core/dist/preference-token.js";
import { hashRateLimitKey } from "../packages/core/dist/rate-limit.js";
import { renderHandlebarsTemplate } from "../packages/core/dist/render-template.js";
import {
  createDefaultSignupForm,
  isSupportedSignupForm,
} from "../packages/core/dist/signup-form-schema.js";
import {
  commerceEventEnvelopeSchema,
} from "../packages/core/dist/events.js";

test("commerce HMAC accepts an intact request and rejects stale or modified bodies", () => {
  const secret = "commerce-test-secret";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ eventId: "order:ord_1:placed", type: "order.placed" });
  const signature = createEilishSignature({ body, secret, timestamp });

  assert.equal(
    verifyEilishSignature({
      body,
      maxAgeSeconds: 300,
      secret,
      signature,
      timestamp,
    }),
    true,
  );
  assert.equal(
    verifyEilishSignature({
      body: `${body} `,
      maxAgeSeconds: 300,
      secret,
      signature,
      timestamp,
    }),
    false,
  );
  assert.equal(
    verifyEilishSignature({
      body,
      maxAgeSeconds: 300,
      secret,
      signature,
      timestamp: String(Number(timestamp) - 301),
    }),
    false,
  );
});

test("commerce envelopes identify Shopify without changing canonical triggers", () => {
  const parsed = commerceEventEnvelopeSchema.parse({
    context: { email: "customer@example.com" },
    eventId: "order.placed:shopify-webhook-1",
    occurredAt: "2026-07-29T12:00:00.000Z",
    payload: { order_id: "gid://shopify/Order/1" },
    source: "shopify",
    type: "order.placed",
  });
  assert.equal(parsed.source, "shopify");
  assert.equal(parsed.type, "order.placed");
});

test("Shopify order timestamps accept explicit timezones and preserve the event time", () => {
  for (const occurredAt of [
    "2026-09-09T15:50:45-04:00",
    "2026-09-10T01:20:45+05:30",
    "2026-09-09T19:50:45Z",
    "2026-09-09T19:50:45.000Z",
  ]) {
    const parsed = commerceEventEnvelopeSchema.parse({
      context: { email: "customer@example.com" },
      eventId: "order.placed:shopify-webhook-timezone",
      occurredAt,
      payload: { order_id: "gid://shopify/Order/1" },
      source: "shopify",
      type: "order.placed",
    });
    assert.equal(parsed.occurredAt, occurredAt);
    assert.equal(new Date(parsed.occurredAt).toISOString(), "2026-09-09T19:50:45.000Z");
  }
});

test("commerce timestamps still reject missing timezones and invalid dates", () => {
  for (const occurredAt of [
    "2026-09-09T15:50:45",
    "2026-09-09",
    "2026-02-30T15:50:45-04:00",
    "invalid",
  ]) {
    assert.equal(commerceEventEnvelopeSchema.safeParse({
      eventId: "order.placed:shopify-webhook-invalid-time",
      occurredAt,
      payload: {},
      source: "shopify",
      type: "order.placed",
    }).success, false, occurredAt);
  }
});

test("Ops admin HMAC binds actor, method, path/query, and raw body", () => {
  const input = {
    actorEmail: "operator@example.com",
    body: '{"name":"Welcome"}',
    method: "POST",
    pathAndQuery: "/internal/ops/admin/v1/email-flows?draft=true",
    secret: "ops-shared-secret-that-is-long-enough",
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const signature = createOpsAdminSignature(input);
  assert.equal(verifyOpsAdminSignature({ ...input, signature }), true);

  for (const changed of [
    { ...input, actorEmail: "other@example.com" },
    { ...input, method: "PATCH" },
    { ...input, pathAndQuery: "/internal/ops/admin/v1/email-flows?draft=false" },
    { ...input, body: '{"name":"Changed"}' },
  ]) {
    assert.equal(verifyOpsAdminSignature({ ...changed, signature }), false);
  }
  assert.equal(
    verifyOpsAdminSignature({
      ...input,
      signature,
      timestamp: String(Number(input.timestamp) - 301),
    }),
    false,
  );
});

test("preference tokens are purpose-bound, expiring, tamper-evident, and rotatable", () => {
  const currentSecret = "current-preference-secret-0000000000";
  const previousSecret = "previous-preference-secret-00000000";
  const issuedAt = 2_000_000_000;
  const token = createPreferenceToken({
    email: " PERSON@Example.COM ",
    expiresInSeconds: 60,
    issuedAt,
    purpose: "preferences",
    secret: previousSecret,
  });

  const claims = verifyPreferenceToken({
    now: issuedAt + 30,
    previousSecret,
    purpose: "preferences",
    secret: currentSecret,
    token,
  });
  assert.equal(claims?.email, "person@example.com");
  assert.equal(
    verifyPreferenceToken({
      now: issuedAt + 30,
      previousSecret,
      purpose: "unsubscribe",
      secret: currentSecret,
      token,
    }),
    null,
  );
  assert.equal(
    verifyPreferenceToken({
      now: issuedAt + 61,
      previousSecret,
      purpose: "preferences",
      secret: currentSecret,
      token,
    }),
    null,
  );
  assert.equal(
    verifyPreferenceToken({
      now: issuedAt + 30,
      previousSecret,
      purpose: "preferences",
      secret: currentSecret,
      token: `${token.slice(0, -1)}x`,
    }),
    null,
  );
});

test("unsubscribe links separate human confirmation from mailbox-provider one-click POST", () => {
  assert.deepEqual(
    buildUnsubscribeUrls({
      appUrl: "https://messaging.example.test/admin",
      token: "signed.token+/=",
    }),
    {
      confirmationUrl:
        "https://messaging.example.test/unsubscribe?token=signed.token%2B%2F%3D",
      oneClickUrl:
        "https://messaging.example.test/api/store/email-unsubscribe?token=signed.token%2B%2F%3D",
    },
  );
});

test("opaque unsubscribe links stay on the first-party Shopify storefront", () => {
  assert.deepEqual(
    buildStorefrontUnsubscribeUrls({
      storefrontUrl: "https://www.eilishstudio.com/collections/new",
      token: "opaque_token-123",
    }),
    {
      confirmationUrl:
        "https://www.eilishstudio.com/apps/eilish/unsubscribe/opaque_token-123",
      oneClickUrl:
        "https://www.eilishstudio.com/apps/eilish/unsubscribe/opaque_token-123",
    },
  );
});

test("rate-limit keys do not persist raw IPs or email addresses", () => {
  const secret = "rate-limit-secret-000000000000000";
  const emailHash = hashRateLimitKey(secret, "email", "Person@Example.com");
  const ipHash = hashRateLimitKey(secret, "ip", "203.0.113.42");
  assert.match(emailHash, /^[a-f0-9]{64}$/);
  assert.match(ipHash, /^[a-f0-9]{64}$/);
  assert.equal(emailHash.includes("example.com"), false);
  assert.equal(ipHash.includes("203.0.113.42"), false);
  assert.notEqual(emailHash, ipHash);
});

test("signup-form schema version 1 remains readable while future versions are rejected", () => {
  const current = createDefaultSignupForm();
  assert.equal(current.schema_version, 1);
  assert.deepEqual(current.targeting.triggers, ["time"]);
  assert.equal(current.targeting.trigger_match, "any");
  assert.equal(current.targeting.cooldown_days, 30);
  assert.deepEqual(current.targeting.devices, ["desktop", "mobile"]);
  assert.equal(current.targeting.hide_after_submit, true);
  assert.deepEqual(current.targeting.close_button_devices, ["desktop", "mobile"]);
  assert.deepEqual(current.targeting.dismiss_on_outside_devices, ["desktop", "mobile"]);
  assert.equal(
    current.steps.some((step) => step.kind === "already_subscribed"),
    true,
  );
  assert.equal(isSupportedSignupForm(current), true);
  assert.equal(isSupportedSignupForm({ ...current, schema_version: 2 }), false);
});

test("deterministic event IDs and Handlebars templates preserve the deployed wire contract", () => {
  assert.equal(hasDeterministicEventId("order.placed:ord_1"), true);
  assert.equal(hasDeterministicEventId("random-id"), false);
  assert.equal(
    renderHandlebarsTemplate(
      "Hello {{first_name}} — order {{order.id}}",
      { first_name: "Ava", order: { id: "ord_1" } },
    ),
    "Hello Ava — order ord_1",
  );
});

test("flow conditions support legacy clauses, grouped matching, and nested context", () => {
  assert.equal(
    evaluateFlowCondition(
      {
        type: "condition",
        field: "order.total",
        operator: "greater_than",
        value: "50",
      },
      { order: { total: 75 } },
    ),
    true,
  );
  assert.equal(
    evaluateFlowCondition(
      {
        type: "condition",
        match: "all",
        conditions: [
          { field: "customer.tier", operator: "equals", value: "vip" },
          { field: "coupon", operator: "is_not_set", value: "" },
        ],
      },
      { customer: { tier: "vip" } },
    ),
    true,
  );
  assert.equal(
    evaluateFlowCondition(
      {
        type: "condition",
        match: "any",
        conditions: [
          { field: "country", operator: "equals", value: "US" },
          { field: "country", operator: "equals", value: "IT" },
        ],
      },
      { country: "IT" },
    ),
    true,
  );
});

test("nested branch paths resume at siblings and then return to the parent flow", () => {
  const steps = [
    { type: "email", template_id: "before" },
    {
      type: "condition",
      field: "country",
      operator: "equals",
      value: "IT",
      true_branch: [
        { type: "email", template_id: "inside-1" },
        { type: "delay", duration: 5, unit: "minutes" },
      ],
      false_branch: [{ type: "email", template_id: "inside-false" }],
    },
    { type: "email", template_id: "after" },
  ];

  assert.equal(flowStepAtPath(steps, "1.true.0")?.type, "email");
  assert.equal(nextFlowStepPath(steps, "1.true.0"), "1.true.1");
  assert.equal(nextFlowStepPath(steps, "1.true.1"), "2");
  assert.equal(nextFlowStepPath(steps, "1.false.0"), "2");
  assert.equal(nextFlowStepPath(steps, "2"), null);
});

test("delay calculations and A/B selection are stable across retries", () => {
  assert.equal(
    calculateFlowDelay({ type: "delay", duration: 90, unit: "minutes" }, 2_000_000_000_000),
    90 * 60 * 1000,
  );
  const step = {
    type: "email",
    template_id: "fallback",
    ab_test_enabled: true,
    ab_variants: {
      a: { template_id: "template-a" },
      b: { template_id: "template-b" },
    },
  };
  const first = selectFlowEmailVariant(step, " PERSON@example.com ");
  const retry = selectFlowEmailVariant(step, "person@example.com");
  assert.deepEqual(first, retry);
  assert.ok(first?.template_id === "template-a" || first?.template_id === "template-b");
});

test("trigger conditions preserve all/any matching and subscriber tag behavior", () => {
  const subscriber = {
    email: "person@example.com",
    properties: { tags: ["vip", "repeat"] },
  };
  assert.equal(
    evaluateTriggerConditions(
      {
        match: "all",
        conditions: [
          { field: "order.total", operator: "greater_than", value: "100" },
          { field: "subscriber.tags", operator: "has_tag", value: "vip" },
        ],
      },
      subscriber,
      { order: { total: 125 } },
    ),
    true,
  );
  assert.equal(
    evaluateTriggerConditions(
      {
        match: "any",
        conditions: [
          { field: "country", operator: "equals", value: "US" },
          { field: "country", operator: "equals", value: "IT" },
        ],
      },
      subscriber,
      { country: "IT" },
    ),
    true,
  );
});

test("re-entry rules distinguish never, recent completion, and elapsed windows", () => {
  const nowMs = Date.parse("2026-07-28T12:00:00Z");
  assert.equal(
    getFlowReentryDecision({
      mode: "always",
      nowMs,
      previousRuns: [
        {
          completed_at: "2026-07-28T11:59:00Z",
          status: "completed",
        },
      ],
    }).allowed,
    true,
  );
  assert.equal(
    getFlowReentryDecision({
      mode: "never",
      nowMs,
      previousRuns: [{ status: "failed" }],
    }).allowed,
    false,
  );
  assert.equal(
    getFlowReentryDecision({
      duration: 24,
      mode: "after_duration",
      nowMs,
      previousRuns: [
        {
          completed_at: "2026-07-28T00:00:00Z",
          started_at: "2026-07-27T23:59:00Z",
          status: "completed",
        },
      ],
      unit: "hours",
    }).allowed,
    false,
  );
  assert.equal(
    getFlowReentryDecision({
      duration: 24,
      mode: "after_duration",
      nowMs,
      previousRuns: [
        {
          completed_at: "2026-07-26T00:00:00Z",
          started_at: "2026-07-25T23:59:00Z",
          status: "completed",
        },
      ],
      unit: "hours",
    }).allowed,
    true,
  );
  assert.equal(
    getFlowReentryDecision({
      duration: 24,
      mode: "after_duration",
      nowMs,
      previousRuns: [
        {
          started_at: "2026-07-28T11:00:00Z",
          status: "running",
        },
      ],
      unit: "hours",
    }).allowed,
    false,
  );
});

test("flow message policy overrides the trigger fallback", () => {
  assert.equal(resolveFlowMessageKind("marketing", "transactional"), "marketing");
  assert.equal(
    resolveFlowMessageKind("transactional", "marketing"),
    "transactional",
  );
  assert.equal(resolveFlowMessageKind(undefined, "transactional"), "transactional");
});

test("transactional delivery ignores unsubscribe but respects hard suppressions", () => {
  assert.deepEqual(
    getSuppressionDecision({
      activeReasons: ["unsubscribe"],
      messageKind: "transactional",
      subscriberSubscribed: false,
    }),
    { allowed: true },
  );
  assert.deepEqual(
    getSuppressionDecision({
      activeReasons: ["unsubscribe"],
      messageKind: "marketing",
      subscriberSubscribed: false,
    }),
    { allowed: false, reason: "unsubscribe" },
  );
  for (const reason of ["bounce", "complaint", "manual"] as const) {
    assert.deepEqual(
      getSuppressionDecision({
        activeReasons: [reason],
        messageKind: "transactional",
        subscriberSubscribed: true,
      }),
      { allowed: false, reason },
    );
  }
});
