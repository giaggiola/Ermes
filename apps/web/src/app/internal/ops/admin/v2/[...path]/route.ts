import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  SIGNUP_FORM_SCHEMA_VERSION,
  STANDARD_FLOW_RECIPE_KEYS,
  TRIGGER_CATALOG,
  simulateFlowSteps,
} from "@ermes/core";
import { getMessagingService } from "@ermes/db";

import { handleRouteError } from "@/lib/http";
import { authenticateInternalOpsRequest } from "@/lib/internal-ops-auth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const publishInput = z
  .object({ version_id: z.string().min(1).optional() })
  .strict();
const signupFormVersionInput = z
  .object({ document: z.record(z.string(), z.unknown()).optional() })
  .strict();
const simulationInput = z
  .object({ context: z.record(z.string(), z.unknown()).default({}) })
  .strict();
const installRecipesInput = z
  .object({
    recipe_keys: z.enum(STANDARD_FLOW_RECIPE_KEYS).array().optional(),
  })
  .strict();

const emailBlockCatalogue = [
  "button",
  "columns",
  "coupon",
  "divider",
  "image",
  "order",
  "product",
  "repeat",
  "section",
  "social",
  "spacer",
  "text",
] as const;
const flowNodeCatalogue = [
  "condition",
  "delay",
  "discount",
  "email",
  "end",
  "trigger",
] as const;

async function handle(request: NextRequest, context: RouteContext) {
  const auth = await authenticateInternalOpsRequest(request);
  if (!auth.ok) return auth.response;

  const path = (await context.params).path ?? [];
  const service = getMessagingService();

  try {
    if (request.method === "GET" && path.length === 1 && path[0] === "contract") {
      return NextResponse.json({
        api_version: 2,
        capabilities: {
          campaign_revisions: true,
          consent_ledger: true,
          dynamic_segments: true,
          flow_simulation: true,
          immutable_versions: true,
          standard_flow_recipes: true,
          visual_email_document: true,
        },
        email_block_catalogue: emailBlockCatalogue,
        email_document_schema_version: 1,
        flow_document_schema_version: 1,
        flow_node_catalogue: flowNodeCatalogue,
        signup_form_schema_version: SIGNUP_FORM_SCHEMA_VERSION,
        trigger_catalogue: TRIGGER_CATALOG,
      });
    }

    if (
      request.method === "GET" &&
      path.length === 1 &&
      path[0] === "flow-recipes"
    ) {
      return NextResponse.json({
        recipes: await service.getStandardFlowRecipeCatalogue(),
      });
    }

    if (request.method === "GET" && path.length === 3 && path[2] === "versions") {
      if (path[0] === "email-templates") {
        return NextResponse.json({
          versions: await service.listEmailTemplateVersions(path[1]),
        });
      }
      if (path[0] === "email-flows") {
        return NextResponse.json({
          versions: await service.listEmailFlowVersions(path[1]),
        });
      }
      if (path[0] === "signup-forms") {
        return NextResponse.json({
          versions: await service.listSignupFormVersions(path[1]),
        });
      }
    }

    if (
      request.method === "GET" &&
      path.length === 4 &&
      path[0] === "signup-forms" &&
      path[2] === "versions"
    ) {
      const form = await service.retrieveSignupForm(path[1]);
      const version = await service.retrieveSignupFormVersion(path[3]);
      if (String(version.form_id ?? "") !== String(form.id)) {
        return NextResponse.json(
          { message: "Signup form version does not belong to this form" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        form: {
          id: form.id,
          name: form.name,
          type: form.type,
        },
        version,
      });
    }

    if (
      request.method === "GET" &&
      path.length === 3 &&
      path[0] === "profiles" &&
      path[2] === "timeline"
    ) {
      return NextResponse.json(await service.getSubscriberTimeline(path[1]));
    }

    if (
      request.method === "GET" &&
      path.length === 3 &&
      path[0] === "email-campaigns" &&
      path[2] === "revisions"
    ) {
      return NextResponse.json({
        revisions: await service.listEmailCampaignRevisions(path[1]),
      });
    }

    if (
      request.method === "POST" &&
      path.length === 2 &&
      path[0] === "flow-recipes" &&
      path[1] === "install"
    ) {
      const body = installRecipesInput.parse(await readJsonBody(request));
      const installation = await service.installStandardFlowDrafts(
        body.recipe_keys,
      );
      await auditMutation(auth, request, path, "install", "success");
      return NextResponse.json({ installation });
    }

    if (
      request.method === "POST" &&
      path.length === 3 &&
      path[0] === "signup-forms" &&
      path[2] === "versions"
    ) {
      const body = signupFormVersionInput.parse(await readJsonBody(request));
      const version = await service.createSignupFormVersion(
        path[1],
        auth.actorEmail,
        body.document,
      );
      await auditMutation(auth, request, path, "snapshot", "success");
      return NextResponse.json({ version });
    }

    if (
      request.method === "DELETE" &&
      path.length === 4 &&
      path[0] === "signup-forms" &&
      path[2] === "versions"
    ) {
      const deletion = await service.deleteSignupFormVersion(path[1], path[3]);
      await auditMutation(auth, request, path, "delete-snapshot", "success");
      return NextResponse.json({ deletion });
    }

    if (
      request.method === "POST" &&
      path.length === 3 &&
      path[2] === "publish"
    ) {
      const body = publishInput.parse(await readJsonBody(request));
      let published: Record<string, unknown>;
      if (path[0] === "email-templates") {
        published = await service.publishEmailTemplateVersion(
          path[1],
          body.version_id,
        );
      } else if (path[0] === "email-flows") {
        published = await service.publishEmailFlowVersion(
          path[1],
          body.version_id,
        );
      } else if (path[0] === "signup-forms") {
        published = await service.publishSignupFormVersion(
          path[1],
          body.version_id,
        );
      } else {
        return NextResponse.json(
          { message: "Unknown admin action" },
          { status: 404 },
        );
      }
      await auditMutation(auth, request, path, "publish", "success");
      return NextResponse.json({ published });
    }

    if (
      request.method === "POST" &&
      path.length === 3 &&
      path[0] === "email-flows" &&
      path[2] === "validate"
    ) {
      const flow = await service.retrieveEmailFlow(path[1]);
      const versionId = String(flow.draft_version_id ?? "");
      const version = await service.retrieveEmailFlowVersion(versionId);
      return NextResponse.json({
        validation: version.validation_report,
        version_id: version.id,
      });
    }

    if (
      request.method === "POST" &&
      path.length === 3 &&
      path[0] === "email-flows" &&
      path[2] === "simulate"
    ) {
      const body = simulationInput.parse(await readJsonBody(request));
      const flow = await service.retrieveEmailFlow(path[1]);
      const version = await service.retrieveEmailFlowVersion(
        String(flow.draft_version_id),
      );
      return NextResponse.json({
        simulation: simulateFlowSteps(
          version.compiled_steps as Parameters<typeof simulateFlowSteps>[0],
          body.context,
        ),
        version_id: version.id,
      });
    }

    return NextResponse.json(
      { message: "Unknown admin action" },
      { status: 404 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

async function readJsonBody(request: NextRequest) {
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

async function auditMutation(
  auth: { actorEmail: string; requestId: string },
  request: NextRequest,
  path: string[],
  action: string,
  outcome: string,
) {
  await getMessagingService()
    .recordAdminAudit({
      action,
      actorEmail: auth.actorEmail,
      outcome,
      requestId: auth.requestId,
      resourceId: path[1],
      resourceType: path[0] ?? "unknown",
    })
    .catch(() => undefined);
}

export function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}
