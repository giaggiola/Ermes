"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminFetch, deleteInit, jsonBody, patchBody } from "./admin-api";
import type {
  AdminSettings,
  AdminSettingsUpdate,
  CampaignAnalytics,
  DashboardStats,
  DeliverabilityAnalytics,
  EmailCampaign,
  EmailEvent,
  EmailFlow,
  EmailFlowRun,
  EmailSubscriber,
  EmailSegment,
  EmailTemplate,
  MessageSuppression,
  SignupForm,
  SignupFormExperiment,
  SignupFormExperimentDetail,
  SignupFormVersion,
  SignupFormAnalytics,
  TemplatePreview,
  TriggerMetric,
} from "./admin-types";

type CollectionKey =
  | "email_campaigns"
  | "email_events"
  | "email_flow_runs"
  | "email_flows"
  | "email_subscribers"
  | "email_segments"
  | "email_templates"
  | "message_suppressions"
  | "signup_forms";

function collection<T>(key: CollectionKey) {
  return (payload: Record<string, unknown>) => (payload[key] ?? []) as T[];
}

export function useDashboardStats() {
  return useQuery({
    queryFn: () => adminFetch<{ stats: DashboardStats }>("dashboard").then((data) => data.stats),
    queryKey: ["messaging", "dashboard"],
  });
}

export function useDeliverabilityAnalytics(days: number) {
  return useQuery({
    queryFn: () =>
      adminFetch<{ analytics: DeliverabilityAnalytics }>(
        `analytics?days=${days}`,
      ).then((data) => data.analytics),
    queryKey: ["messaging", "analytics", days],
  });
}

export function useSettings() {
  return useQuery({
    queryFn: () => adminFetch<{ settings: AdminSettings }>("settings").then((data) => data.settings),
    queryKey: ["messaging", "settings"],
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: AdminSettingsUpdate) =>
      adminFetch<{ settings: AdminSettings }>("settings", {
        body: JSON.stringify(values),
        method: "PUT",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["messaging", "settings"] }),
  });
}

export function useEmailTemplates() {
  return useQuery({
    queryFn: () => adminFetch<Record<string, unknown>>("email-templates").then(collection<EmailTemplate>("email_templates")),
    queryKey: ["messaging", "email-templates"],
  });
}

export function useEmailCampaigns() {
  return useQuery({
    queryFn: () => adminFetch<Record<string, unknown>>("email-campaigns").then(collection<EmailCampaign>("email_campaigns")),
    queryKey: ["messaging", "email-campaigns"],
  });
}

export function useEmailFlows() {
  return useQuery({
    queryFn: () => adminFetch<Record<string, unknown>>("email-flows").then(collection<EmailFlow>("email_flows")),
    queryKey: ["messaging", "email-flows"],
  });
}

export function useEmailFlowRuns() {
  return useQuery({
    queryFn: () => adminFetch<Record<string, unknown>>("email-flow-runs").then(collection<EmailFlowRun>("email_flow_runs")),
    queryKey: ["messaging", "email-flow-runs"],
  });
}

export function useEmailSubscribers() {
  return useQuery({
    queryFn: () => adminFetch<Record<string, unknown>>("email-subscribers").then(collection<EmailSubscriber>("email_subscribers")),
    queryKey: ["messaging", "email-subscribers"],
  });
}

export function useEmailSegments() {
  return useQuery({
    queryFn: () =>
      adminFetch<Record<string, unknown>>("email-segments").then(
        collection<EmailSegment>("email_segments"),
      ),
    queryKey: ["messaging", "email-segments"],
  });
}

export function useSubscriberTags() {
  return useQuery({
    queryFn: () => adminFetch<{ tags: string[] }>("email-subscribers/tags").then((data) => data.tags),
    queryKey: ["messaging", "email-subscribers", "tags"],
  });
}

export function useTriggerMetrics() {
  return useQuery({
    queryFn: () => adminFetch<{ metrics: TriggerMetric[] }>("metrics").then((data) => data.metrics),
    queryKey: ["messaging", "metrics"],
  });
}

export function useCampaignAnalytics(campaignId?: string) {
  return useQuery({
    enabled: Boolean(campaignId),
    queryFn: () =>
      adminFetch<{ analytics: CampaignAnalytics }>(`email-campaigns/${campaignId}/analytics`).then((data) => data.analytics),
    queryKey: ["messaging", "email-campaigns", campaignId, "analytics"],
  });
}

export function useSignupForms() {
  return useQuery({
    queryFn: () => adminFetch<Record<string, unknown>>("signup-forms").then(collection<SignupForm>("signup_forms")),
    queryKey: ["messaging", "signup-forms"],
  });
}

export function useSignupFormAnalytics(days = 30, device = "all", window?: { from: string; to: string }) {
  const query = new URLSearchParams({ days: String(days) });
  if (device !== "all") query.set("device", device);
  if (window) { query.set("from_date", window.from); query.set("to_date", window.to); }
  return useQuery({
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: () =>
      adminFetch<{ analytics: SignupFormAnalytics }>(
        `signup-forms/analytics?${query}`,
      ).then((data) => data.analytics),
    queryKey: ["messaging", "signup-forms", "analytics", days, device, window?.from, window?.to],
  });
}

export function useSignupForm(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => adminFetch<{ signup_form: SignupForm }>(`signup-forms/${id}`).then((data) => data.signup_form),
    queryKey: ["messaging", "signup-forms", id],
  });
}

export function useSignupFormVersions(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () =>
      adminFetch<{ versions: SignupFormVersion[] }>(
        `v2/signup-forms/${id}/versions`,
      ).then((data) => data.versions),
    queryKey: ["messaging", "signup-forms", id, "versions"],
  });
}

export function useSignupFormVersion(formId: string | null, versionId: string | null) {
  return useQuery({
    enabled: Boolean(formId && versionId),
    queryFn: () =>
      adminFetch<{ version: SignupFormVersion }>(
        `v2/signup-forms/${formId}/versions/${versionId}`,
      ).then((data) => data.version),
    queryKey: ["messaging", "signup-forms", formId, "versions", versionId],
  });
}

export function useSignupFormExperiments(formId: string | null) {
  return useQuery({
    enabled: Boolean(formId),
    queryFn: () =>
      adminFetch<SignupFormExperiment[]>(
        `signup-forms/${formId}/experiments`,
      ),
    queryKey: ["messaging", "signup-forms", formId, "experiments"],
  });
}

export function useSignupFormExperiment(experimentId: string | null) {
  return useQuery({
    enabled: Boolean(experimentId),
    queryFn: () =>
      adminFetch<SignupFormExperimentDetail>(
        `form-experiments/${experimentId}`,
      ),
    queryKey: ["messaging", "form-experiments", experimentId],
  });
}

export function useCreateSignupFormExperiment(formId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      adminFetch<SignupFormExperiment>(
        `signup-forms/${formId}/experiments`,
        jsonBody(payload),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["messaging", "signup-forms", formId, "experiments"],
      }),
  });
}

export function useUpdateSignupFormExperiment(experimentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      adminFetch<SignupFormExperiment>(
        `form-experiments/${experimentId}`,
        patchBody(payload),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["messaging", "form-experiments", experimentId],
      }),
  });
}

export function useSignupFormExperimentAction(experimentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, body }: { action: string; body?: unknown }) =>
      adminFetch<SignupFormExperiment>(
        `form-experiments/${experimentId}/${action}`,
        jsonBody(body ?? {}),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "form-experiments", experimentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "signup-forms"],
      });
    },
  });
}

export function useUpdateSignupFormExperimentVariant(
  experimentId: string | null,
  variantKey: string | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { document: Record<string, unknown>; name?: string }) =>
      adminFetch<SignupFormExperiment>(
        `form-experiments/${experimentId}/variants/${variantKey}`,
        { body: JSON.stringify(payload), method: "PUT" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "form-experiments", experimentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["messaging", "signup-forms"],
      });
    },
  });
}

export function useEmailEvents() {
  return useQuery({
    queryFn: () => adminFetch<Record<string, unknown>>("email-events").then(collection<EmailEvent>("email_events")),
    queryKey: ["messaging", "email-events"],
  });
}

export function useMessageSuppressions() {
  return useQuery({
    queryFn: () =>
      adminFetch<Record<string, unknown>>("message-suppressions?active=true").then(
        collection<MessageSuppression>("message_suppressions"),
      ),
    queryKey: ["messaging", "message-suppressions"],
  });
}

export function useAdminCreate<TInput extends Record<string, unknown>>(resource: string, invalidate: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => adminFetch(resource, jsonBody(input)),
    onSuccess: () => {
      for (const key of invalidate) {
        void queryClient.invalidateQueries({ queryKey: ["messaging", key] });
      }
    },
  });
}

export function useAdminPatch<TInput extends Record<string, unknown>>(resource: string, invalidate: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: TInput & { id: string }) => adminFetch(`${resource}/${id}`, patchBody(input)),
    onSuccess: () => {
      for (const key of invalidate) {
        void queryClient.invalidateQueries({ queryKey: ["messaging", key] });
      }
    },
  });
}

export function useAdminDelete(resource: string, invalidate: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`${resource}/${id}`, deleteInit()),
    onSuccess: () => {
      for (const key of invalidate) {
        void queryClient.invalidateQueries({ queryKey: ["messaging", key] });
      }
    },
  });
}

export function useTemplatePreview(templateId?: string) {
  return useMutation({
    mutationFn: (context: Record<string, unknown>) => {
      if (!templateId) throw new Error("Template must be saved before previewing");
      return adminFetch<TemplatePreview>(`email-templates/${templateId}/preview`, jsonBody({ context }));
    },
  });
}

export function useTemplateTestSend(templateId?: string) {
  return useMutation({
    mutationFn: (input: { email: string; context?: Record<string, unknown> }) => {
      if (!templateId) throw new Error("Template must be saved before test send");
      return adminFetch<{ dry_run?: boolean; message?: string; preview?: { html: string; subject: string } }>(
        `email-templates/${templateId}/send-test`,
        jsonBody({ ...input, request_id: crypto.randomUUID() }),
      );
    },
  });
}
