import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultTemplateContext,
  evaluateSegmentRules,
  medusaEventTypeSchema,
  renderHandlebarsTemplate,
  simulateFlowSteps,
  STANDARD_FLOW_RECIPES,
  validateFlowSteps,
} from "../packages/core/dist/index.js";

test("segment groups evaluate nested profile data with all and any semantics", () => {
  const profile = {
    email: "customer@example.com",
    properties: {
      country: "IT",
      lifetime_value: 275,
      tags: ["vip", "newsletter"],
    },
    subscribed: true,
  };

  assert.equal(
    evaluateSegmentRules(
      {
        conditions: [
          {
            field: "properties.country",
            operator: "equals",
            value: "it",
          },
          {
            field: "properties.lifetime_value",
            operator: "greater_than",
            value: 200,
          },
          {
            field: "properties.tags",
            operator: "contains",
            value: "vip",
          },
        ],
        match: "all",
      },
      profile,
    ),
    true,
  );

  assert.equal(
    evaluateSegmentRules(
      {
        conditions: [
          { field: "properties.country", operator: "equals", value: "US" },
          { field: "subscribed", operator: "equals", value: true },
        ],
        match: "any",
      },
      profile,
    ),
    true,
  );
});

test("segment negative operators and missing values do not leak into matches", () => {
  const profile = { properties: { tags: ["newsletter"] } };

  assert.equal(
    evaluateSegmentRules(
      {
        conditions: [
          {
            field: "properties.tags",
            operator: "not_contains",
            value: "vip",
          },
          {
            field: "properties.phone",
            operator: "exists",
          },
        ],
        match: "all",
      },
      profile,
    ),
    false,
  );
});

test("flow validation identifies stable-ID collisions and nested step errors", () => {
  const report = validateFlowSteps([
    {
      step_id: "send-welcome",
      template_id: "welcome",
      type: "email",
    },
    {
      conditions: [
        {
          field: "order.total",
          operator: "greater_than",
          value: "100",
        },
      ],
      false_branch: [
        {
          duration: 0,
          step_id: "send-welcome",
          type: "delay",
          unit: "hours",
        },
      ],
      step_id: "order-value",
      true_branch: [
        {
          code_prefix: "",
          discount_type: "percentage",
          discount_value: 0,
          step_id: "discount",
          type: "discount",
          usage_limit: 1,
        },
      ],
      type: "condition",
    },
  ]);

  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.includes("reuses stable ID")));
  assert.ok(report.errors.some((error) => error.includes("positive duration")));
  assert.ok(report.errors.some((error) => error.includes("code prefix")));
  assert.ok(report.errors.some((error) => error.includes("positive value")));
});

test("valid branched flows keep deterministic stable IDs without warnings", () => {
  const report = validateFlowSteps([
    {
      conditions: [
        { field: "customer.country", operator: "equals", value: "IT" },
      ],
      false_branch: [
        {
          step_id: "wait-other",
          type: "delay",
          duration: 1,
          unit: "days",
        },
      ],
      step_id: "country-split",
      true_branch: [
        {
          step_id: "send-italy",
          template_id: "italy",
          type: "email",
        },
      ],
      type: "condition",
    },
  ]);

  assert.deepEqual(report, { errors: [], valid: true, warnings: [] });
});

test("standard flow recipes are safe drafts with valid, testable paths", () => {
  assert.deepEqual(
    STANDARD_FLOW_RECIPES.map((recipe) => recipe.key),
    [
      "welcome",
      "abandoned-cart",
      "abandoned-checkout",
      "order-confirmation",
      "order-shipped",
      "order-out-for-delivery",
      "order-delivered",
      "order-delivery-failed",
      "order-returned",
      "gift-card-issued",
      "back-in-stock",
      "price-drop",
      "cart-item-price-drop",
      "post-delivery-follow-up",
      "referral-invitation",
      "referral-reward",
      "win-back-30-days",
    ],
  );
  assert.equal(
    new Set(STANDARD_FLOW_RECIPES.map((recipe) => recipe.flowId)).size,
    STANDARD_FLOW_RECIPES.length,
  );
  assert.equal(
    new Set(
      STANDARD_FLOW_RECIPES.flatMap((recipe) =>
        recipe.templates.map((template) => template.id),
      ),
    ).size,
    18,
  );

  for (const recipe of STANDARD_FLOW_RECIPES) {
    assert.equal(medusaEventTypeSchema.safeParse(recipe.triggerEvent).success, true);
    assert.deepEqual(validateFlowSteps(recipe.steps), {
      errors: [],
      valid: true,
      warnings: [],
    });
    assert.equal(
      recipe.messageKind,
      [
        "order-confirmation",
        "order-shipped",
        "order-out-for-delivery",
        "order-delivered",
        "order-delivery-failed",
        "order-returned",
        "gift-card-issued",
        "referral-reward",
      ].includes(recipe.key)
        ? "transactional"
        : "marketing",
    );
    assert.ok(
      recipe.steps.some(
        (step) => step.type === "email" && step.step_status === "disabled",
      ),
    );
    for (const template of recipe.templates) {
      assert.doesNotMatch(template.subject, /^\[Placeholder\]/);
      assert.doesNotMatch(template.htmlContent, /placeholder content/i);
      assert.match(template.htmlContent, /background:#efefef/);
      assert.match(template.htmlContent, /Sackers Gothic Medium/);
      assert.match(template.htmlContent, /Gill Sans/);
      const rendered = renderHandlebarsTemplate(
        template.htmlContent,
        defaultTemplateContext,
      );
      assert.doesNotMatch(rendered, /{{[^}]+}}/);
      assert.match(rendered, /https:\/\//);
    }
    if (recipe.key === "welcome") {
      assert.match(recipe.templates[0].htmlContent, /{{discount_code}}/);
    }

    const simulation = simulateFlowSteps(recipe.steps, {
      email: "synthetic@example.com",
      first_name: "Synthetic",
    });
    assert.equal(simulation.length, recipe.steps.length);
    assert.ok(
      simulation.some(
        (step) =>
          step.type === "email" &&
          step.step_status === "disabled" &&
          recipe.templates.some(
            (template) => template.id === step.template_id,
          ),
      ),
    );
  }

  const postDelivery = STANDARD_FLOW_RECIPES.find(
    (recipe) => recipe.key === "post-delivery-follow-up",
  );
  assert.deepEqual(
    simulateFlowSteps(postDelivery?.steps ?? [], {})[0],
    {
      delay_ms: 3 * 24 * 60 * 60 * 1000,
      duration: 3,
      path: "0",
      type: "delay",
      unit: "days",
    },
  );
  assert.deepEqual(
    simulateFlowSteps(postDelivery?.steps ?? [], {})[2],
    {
      delay_ms: 4 * 24 * 60 * 60 * 1000,
      duration: 4,
      path: "2",
      type: "delay",
      unit: "days",
    },
  );
  const postDeliveryEmails = postDelivery?.steps.filter(
    (step) => step.type === "email",
  );
  assert.equal(postDelivery?.triggerEvent, "order.delivered");
  assert.equal(postDeliveryEmails?.length, 2);
  assert.ok(
    postDeliveryEmails?.every(
      (step) =>
        step.skip_if_event_types_since_start_order_scoped === true &&
        step.skip_if_event_types_since_start?.includes("order.returned"),
    ),
  );
  assert.ok(
    postDelivery?.templates.every(
      (template) => !template.htmlContent.includes("line_price"),
    ),
  );

  const referralInvitation = STANDARD_FLOW_RECIPES.find(
    (recipe) => recipe.key === "referral-invitation",
  );
  const referralInvitationEmail = referralInvitation?.steps.find(
    (step) => step.type === "email",
  );
  assert.deepEqual(referralInvitationEmail?.skip_if_event_types_since_start, [
    "order.returned",
    "referral.invitation_cancelled",
  ]);
  assert.equal(
    referralInvitationEmail?.skip_if_event_types_since_start_order_scoped,
    true,
  );

  const abandonmentRecipes = STANDARD_FLOW_RECIPES.filter((recipe) =>
    ["abandoned-cart", "abandoned-checkout"].includes(recipe.key),
  );
  for (const recipe of abandonmentRecipes) {
    assert.deepEqual(recipe.reentry, {
      duration: 7,
      mode: "after_duration",
      unit: "days",
    });
    const email = recipe.steps.find((step) => step.type === "email");
    assert.equal(email?.skip_recently_emailed, true);
    assert.equal(email?.skip_recently_emailed_hours, 16);
    assert.ok(
      email?.skip_if_event_types_since_start?.includes("order.placed"),
    );
  }

  const abandonedCart = STANDARD_FLOW_RECIPES.find(
    (recipe) => recipe.key === "abandoned-cart",
  );
  const abandonedCartEmail = abandonedCart?.steps.find(
    (step) => step.type === "email",
  );
  assert.ok(
    abandonedCartEmail?.skip_if_event_types_since_start?.includes(
      "checkout.abandoned",
    ),
  );

  const winBack = STANDARD_FLOW_RECIPES.find(
    (recipe) => recipe.key === "win-back-30-days",
  );
  assert.deepEqual(winBack?.reentry, {
    duration: 60,
    mode: "after_duration",
    unit: "days",
  });
  const winBackEmail = winBack?.steps.find(
    (step) => step.type === "email",
  );
  assert.ok(
    winBackEmail?.skip_if_event_types_since_start?.includes("order.placed"),
  );
  assert.ok(winBack?.steps.some((step) => step.type === "discount"));
});
