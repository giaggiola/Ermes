"use client";

import { useEffect, useState } from "react";

import { Button } from "../../../../../../components/ui/button";
import { Input } from "../../../../../../components/ui/input";
import { Label } from "../../../../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../../../components/ui/select";
import { Switch } from "../../../../../../components/ui/switch";
import { adminFetch } from "../../../../admin-api";

type EmailVariant = {
  template_id: string;
  subject_override?: string;
};

export interface EmailDetailData {
  template_id: string;
  // Step name (internal reference)
  name?: string;
  // Status per step
  step_status?: "live" | "disabled";
  // Subject/sender overrides
  subject_override?: string;
  preview_text_override?: string;
  sender_name_override?: string;
  sender_email_override?: string;
  // Smart sending
  skip_recently_emailed?: boolean;
  skip_recently_emailed_hours?: number;
  skip_if_event_types_since_start?: string[];
  skip_if_event_types_since_start_order_scoped?: boolean;
  // UTM tracking
  enable_utm?: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  // A/B testing
  ab_test_enabled?: boolean;
  ab_test_flag?: string;
  ab_variants?: Record<string, EmailVariant>;
  // Templates list (passed from parent)
  templates?: Array<{ id: string; name: string }>;
}

interface EmailDetailPanelProps {
  data: EmailDetailData;
  templates: Array<{ id: string; name: string }>;
  onChange: (updates: Partial<EmailDetailData>) => void;
  flowId?: string;
}

interface TemplateDetails {
  subject?: string;
  preview_text?: string;
  html_content?: string;
}

interface StepAnalytics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  skipped: number;
  open_rate: number;
  click_rate: number;
}

export function EmailDetailPanel({
  data,
  templates,
  onChange,
  flowId,
}: EmailDetailPanelProps) {
  const [templateDetailsResult, setTemplateDetailsResult] = useState<{
    templateId: string;
    details: TemplateDetails | null;
  } | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [showSubjectEdit, setShowSubjectEdit] = useState(false);
  const [analyticsResult, setAnalyticsResult] = useState<{
    flowId: string;
    templateId: string;
    analytics: StepAnalytics | null;
  } | null>(null);

  const selectedTemplate = templates?.find((t) => t.id === data.template_id);
  const templateDetails =
    templateDetailsResult?.templateId === data.template_id
      ? templateDetailsResult.details
      : null;
  const analytics =
    analyticsResult &&
    analyticsResult.flowId === flowId &&
    analyticsResult.templateId === data.template_id
      ? analyticsResult.analytics
      : null;
  const abVariants: Record<string, EmailVariant> = data.ab_variants ?? {
    a: { template_id: data.template_id || "" },
    b: { template_id: "" },
  };
  const variantEntries = ["a", "b"].map(
    (key) => [key, abVariants[key] ?? { template_id: "" }] as const,
  );
  const excludedEventTypes = data.skip_if_event_types_since_start ?? [];

  const toggleExcludedEvent = (eventType: string, checked: boolean) => {
    onChange({
      skip_if_event_types_since_start: checked
        ? Array.from(new Set([...excludedEventTypes, eventType]))
        : excludedEventTypes.filter((value) => value !== eventType),
    });
  };

  const setAbTestEnabled = (checked: boolean) => {
    onChange({
      ab_test_enabled: checked,
      ab_test_flag: data.ab_test_flag || "email-template-test",
      ab_variants: checked ? abVariants : data.ab_variants,
    });
  };

  const updateAbVariant = (key: string, updates: Partial<EmailVariant>) => {
    const nextVariant = {
      ...(abVariants[key] ?? { template_id: "" }),
      ...updates,
    };
    onChange({
      ab_test_enabled: true,
      ab_test_flag: data.ab_test_flag || "email-template-test",
      ab_variants: { ...abVariants, [key]: nextVariant },
    });
  };

  // Fetch analytics when flowId and template_id are available.
  // The analytics endpoint is not yet implemented in the standalone app — this
  // degrades gracefully (404 is swallowed) until a getFlowAnalytics endpoint exists.
  useEffect(() => {
    if (!flowId || !data.template_id) return;

    let cancelled = false;
    const requestedFlowId = flowId;
    const requestedTemplateId = data.template_id;
    (async () => {
      try {
        const result = await adminFetch<{
          step_metrics?: Record<string, StepAnalytics>;
        }>(`email-flows/${requestedFlowId}/analytics`);
        const stepData = result.step_metrics?.[requestedTemplateId];
        if (!cancelled) {
          setAnalyticsResult({
            flowId: requestedFlowId,
            templateId: requestedTemplateId,
            analytics: stepData ?? null,
          });
        }
      } catch {
        // No analytics available yet — ignore.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [flowId, data.template_id]);

  // Fetch template details when template changes
  useEffect(() => {
    if (!data.template_id) return;

    let cancelled = false;
    const requestedTemplateId = data.template_id;
    (async () => {
      try {
        const result = await adminFetch<{ email_template?: TemplateDetails }>(
          `email-templates/${requestedTemplateId}`,
        );
        if (!cancelled) {
          setTemplateDetailsResult({
            templateId: requestedTemplateId,
            details: result.email_template ?? null,
          });
        }
      } catch {
        // Ignore — preview is best-effort.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data.template_id]);

  return (
    <div className="divide-y divide-border">
      {/* Email Name & Status */}
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label className="text-sm font-medium">Email name</Label>
            <Input
              value={data.name || ""}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder={selectedTemplate?.name || "Email step name"}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Status</Label>
            <Select
              value={data.step_status || "live"}
              onValueChange={(value) =>
                onChange({ step_status: value as "live" | "disabled" })
              }
            >
              <SelectTrigger className="mt-1 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-green-600" />
                    Live
                  </div>
                </SelectItem>
                <SelectItem value="disabled">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-red-600" />
                    Disabled
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="space-y-3 p-4">
        <div>
          <Label className="text-sm font-medium">Performance</Label>
          <p className="text-xs text-muted-foreground">
            {analytics
              ? `Based on ${analytics.sent} sent email${analytics.sent !== 1 ? "s" : ""}`
              : "No data yet"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Open rate</p>
            <p className="text-sm font-medium">
              {analytics && analytics.sent > 0
                ? `${analytics.open_rate}%`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Click rate</p>
            <p className="text-sm font-medium">
              {analytics && analytics.sent > 0
                ? `${analytics.click_rate}%`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Delivered</p>
            <p className="text-sm font-medium">
              {analytics && analytics.sent > 0
                ? `${analytics.delivered}/${analytics.sent}`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Skipped</p>
            <p className="text-sm font-medium">{analytics?.skipped ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Subject and Sender */}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Subject and sender</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSubjectEdit(!showSubjectEdit)}
          >
            {showSubjectEdit ? "Done" : "Edit"}
          </Button>
        </div>

        {!showSubjectEdit ? (
          <div className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Subject line</p>
              <p className="text-sm">
                {data.subject_override ||
                  templateDetails?.subject ||
                  "Use template default"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Preview text</p>
              <p className="text-sm">
                {data.preview_text_override ||
                  templateDetails?.preview_text ||
                  "Use template default"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sender</p>
              <p className="text-sm">
                {data.sender_name_override || "Your store"} &lt;
                {data.sender_email_override || "hello@example.com"}&gt;
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Subject line override</Label>
              <Input
                value={data.subject_override || ""}
                onChange={(e) => onChange({ subject_override: e.target.value })}
                placeholder={
                  templateDetails?.subject ||
                  "Leave empty to use template default"
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Preview text override</Label>
              <Input
                value={data.preview_text_override || ""}
                onChange={(e) =>
                  onChange({ preview_text_override: e.target.value })
                }
                placeholder={
                  templateDetails?.preview_text ||
                  "Leave empty to use template default"
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Sender name override</Label>
              <Input
                value={data.sender_name_override || ""}
                onChange={(e) =>
                  onChange({ sender_name_override: e.target.value })
                }
                placeholder="Your store"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Sender email override</Label>
              <Input
                value={data.sender_email_override || ""}
                onChange={(e) =>
                  onChange({ sender_email_override: e.target.value })
                }
                placeholder="hello@example.com"
                className="mt-1"
              />
            </div>
          </div>
        )}
      </div>

      {/* Template Selection */}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Template</Label>
          <div className="flex gap-1">
            <Button
              variant={previewMode === "desktop" ? "default" : "outline"}
              size="sm"
              onClick={() => setPreviewMode("desktop")}
            >
              🖥️
            </Button>
            <Button
              variant={previewMode === "mobile" ? "default" : "outline"}
              size="sm"
              onClick={() => setPreviewMode("mobile")}
            >
              📱
            </Button>
          </div>
        </div>

        <Select
          value={data.template_id || ""}
          onValueChange={(value) => onChange({ template_id: value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select template..." />
          </SelectTrigger>
          <SelectContent>
            {(templates || []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Template Preview */}
        {templateDetails?.html_content ? (
          <div
            className="overflow-hidden rounded-lg border border-border bg-white"
            style={{
              width: previewMode === "desktop" ? "100%" : "180px",
              margin: previewMode === "mobile" ? "0 auto" : undefined,
            }}
          >
            <iframe
              srcDoc={templateDetails.html_content}
              className="pointer-events-none w-full"
              style={{
                height: "200px",
                transform:
                  previewMode === "mobile" ? "scale(0.6)" : "scale(0.5)",
                transformOrigin: "top left",
                width: previewMode === "desktop" ? "200%" : "300px",
              }}
              title="Email preview"
            />
          </div>
        ) : null}
      </div>

      {/* A/B Testing */}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">A/B test</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Split recipients deterministically between two email variants
            </p>
          </div>
          <Switch
            checked={data.ab_test_enabled ?? false}
            onCheckedChange={setAbTestEnabled}
          />
        </div>

        {data.ab_test_enabled ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Test flag</Label>
              <Input
                value={data.ab_test_flag || "email-template-test"}
                onChange={(e) => onChange({ ab_test_flag: e.target.value })}
                placeholder="email-template-test"
                className="mt-1"
              />
            </div>
            {variantEntries.map(([key, variant]) => (
              <div
                key={key}
                className="space-y-2 rounded-lg border border-border bg-muted p-3"
              >
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Variant {key}
                </div>
                <Select
                  value={variant.template_id || ""}
                  onValueChange={(value) =>
                    updateAbVariant(key, { template_id: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates || []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={variant.subject_override || ""}
                  onChange={(e) =>
                    updateAbVariant(key, { subject_override: e.target.value })
                  }
                  placeholder="Optional subject override"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Smart Sending */}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Smart sending</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Skip profiles who were emailed recently
            </p>
          </div>
          <Switch
            checked={data.skip_recently_emailed ?? false}
            onCheckedChange={(checked) =>
              onChange({ skip_recently_emailed: checked })
            }
          />
        </div>

        {data.skip_recently_emailed ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">Skip if emailed within</span>
            <Input
              type="number"
              value={data.skip_recently_emailed_hours ?? 16}
              onChange={(e) =>
                onChange({
                  skip_recently_emailed_hours: parseInt(e.target.value) || 16,
                })
              }
              className="w-16"
              min={1}
            />
            <span className="text-sm">hours</span>
          </div>
        ) : null}
      </div>

      {/* Send-time exclusions */}
      <div className="space-y-3 p-4">
        <div>
          <Label className="text-sm font-medium">Send-time exclusions</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Recheck customer events immediately before this email sends.
          </p>
        </div>
        {[
          {
            description:
              "Do not send recovery or win-back email after a purchase.",
            label: "Placed order since flow started",
            value: "order.placed",
          },
          {
            description: "Let the more specific checkout flow take priority.",
            label: "Checkout abandonment recorded since flow started",
            value: "checkout.abandoned",
          },
          {
            description:
              "Do not send a post-delivery follow-up for a returned order.",
            label: "Order returned since flow started",
            value: "order.returned",
          },
        ].map((option) => (
          <div
            className="flex items-start justify-between gap-4"
            key={option.value}
          >
            <div>
              <p className="text-sm">{option.label}</p>
              <p className="text-xs text-muted-foreground">
                {option.description}
              </p>
            </div>
            <Switch
              checked={excludedEventTypes.includes(option.value)}
              onCheckedChange={(checked) =>
                toggleExcludedEvent(option.value, checked)
              }
            />
          </div>
        ))}
        {excludedEventTypes.length > 0 ? (
          <div className="flex items-start justify-between gap-4 border-t pt-3">
            <div>
              <p className="text-sm">Only match the triggering order</p>
              <p className="text-xs text-muted-foreground">
                Use the order ID so activity on another order does not suppress
                this email.
              </p>
            </div>
            <Switch
              checked={
                data.skip_if_event_types_since_start_order_scoped ?? false
              }
              onCheckedChange={(checked) =>
                onChange({
                  skip_if_event_types_since_start_order_scoped: checked,
                })
              }
            />
          </div>
        ) : null}
      </div>

      {/* UTM Tracking */}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">UTM tracking</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add UTM parameters to all links
            </p>
          </div>
          <Switch
            checked={data.enable_utm ?? false}
            onCheckedChange={(checked) => onChange({ enable_utm: checked })}
          />
        </div>

        {data.enable_utm ? (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">utm_source</Label>
              <Input
                value={data.utm_source || "email"}
                onChange={(e) => onChange({ utm_source: e.target.value })}
                placeholder="email"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">utm_medium</Label>
              <Input
                value={data.utm_medium || "flow"}
                onChange={(e) => onChange({ utm_medium: e.target.value })}
                placeholder="flow"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">utm_campaign</Label>
              <Input
                value={data.utm_campaign || ""}
                onChange={(e) => onChange({ utm_campaign: e.target.value })}
                placeholder="{{flow_name}}"
                className="mt-1"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default EmailDetailPanel;
