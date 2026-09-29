"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import {
  BarChart3,
  CalendarClock,
  FlaskConical,
  Megaphone,
  Send,
  Tags,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/admin/empty-state";
import { PageHeader } from "../../components/admin/page-header";
import { StatusBadge } from "../../components/admin/status-badge";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Checkbox } from "../../../../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../components/ui/table";
import { adminFetch, jsonBody } from "../../admin-api";
import type { CampaignAudienceFilter, EmailCampaign } from "../../admin-types";
import { useMessagingCompatibility } from "../../contract";
import {
  useAdminCreate,
  useCampaignAnalytics,
  useEmailCampaigns,
  useEmailSegments,
  useEmailTemplates,
  useSubscriberTags,
} from "../../use-admin";

const campaignSchema = z.object({
  name: z.string().min(1, "Name is required"),
  scheduled_at: z
    .string()
    .refine(
      (value) => !value || new Date(value).getTime() > Date.now(),
      "Schedule must be in the future",
    )
    .optional(),
  subject: z.string().min(1, "Subject is required"),
  template_id: z.string().min(1, "Template is required"),
});

type CampaignForm = z.infer<typeof campaignSchema>;
type AudienceMode = "all" | "segments" | "tags";

function buildAudienceFilter(
  mode: AudienceMode,
  includeTags: string[],
  excludeTags: string[],
  includeSegments: string[],
  excludeSegments: string[],
): CampaignAudienceFilter | null {
  if (mode === "all") return null;

  const filter: CampaignAudienceFilter = {};
  if (mode === "tags") {
    if (includeTags.length > 0) filter.tags = includeTags;
    if (excludeTags.length > 0) filter.exclude_tags = excludeTags;
  }
  if (mode === "segments") {
    if (includeSegments.length > 0) filter.segment_ids = includeSegments;
    if (excludeSegments.length > 0) {
      filter.exclude_segment_ids = excludeSegments;
    }
  }
  return Object.keys(filter).length > 0 ? filter : null;
}

function tagList(filter: CampaignAudienceFilter | null | undefined) {
  const include = filter?.tags ?? [];
  const exclude = filter?.exclude_tags ?? [];
  const includeSegments = filter?.segment_ids ?? [];
  const excludeSegments = filter?.exclude_segment_ids ?? [];
  if (
    include.length === 0 &&
    exclude.length === 0 &&
    includeSegments.length === 0 &&
    excludeSegments.length === 0
  )
    return "All subscribers";
  const parts = [];
  if (include.length > 0) parts.push(`Include ${include.join(", ")}`);
  if (exclude.length > 0) parts.push(`Exclude ${exclude.join(", ")}`);
  if (includeSegments.length > 0)
    parts.push(`${includeSegments.length} included segment(s)`);
  if (excludeSegments.length > 0)
    parts.push(`${excludeSegments.length} excluded segment(s)`);
  return parts.join("; ");
}

function CampaignAnalyticsSummary({ campaign }: { campaign: EmailCampaign }) {
  const analytics = useCampaignAnalytics(campaign.id);
  const data = analytics.data;

  if (!data) {
    return (
      <span>
        {campaign.sent_count}/{campaign.recipient_count} sent,{" "}
        {campaign.failed_count} failed
      </span>
    );
  }

  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <span>
        {campaign.sent_count}/{campaign.recipient_count} sent,{" "}
        {campaign.failed_count} failed
      </span>
      <span className="inline-flex items-center gap-1">
        <BarChart3 className="size-3" />
        {data.open_rate}% open, {data.click_rate}% click, {data.bounced} bounced
      </span>
    </div>
  );
}

export default function CampaignsPage() {
  const compatibility = useMessagingCompatibility();
  const campaigns = useEmailCampaigns();
  const templates = useEmailTemplates();
  const tags = useSubscriberTags();
  const segments = useEmailSegments();
  const queryClient = useQueryClient();
  const createCampaign = useAdminCreate<Record<string, unknown>>(
    "email-campaigns",
    ["email-campaigns", "dashboard"],
  );

  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [includeTags, setIncludeTags] = useState<string[]>([]);
  const [excludeTags, setExcludeTags] = useState<string[]>([]);
  const [includeSegments, setIncludeSegments] = useState<string[]>([]);
  const [excludeSegments, setExcludeSegments] = useState<string[]>([]);
  const [reviewCampaign, setReviewCampaign] = useState<EmailCampaign | null>(
    null,
  );
  const [reviewEstimate, setReviewEstimate] = useState<number | null>(null);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [testCampaign, setTestCampaign] = useState<EmailCampaign | null>(null);
  const [testEmail, setTestEmail] = useState("");

  const sendCampaign = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`email-campaigns/${id}/send`, jsonBody({})),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["messaging", "email-campaigns"],
      }),
  });
  const cancelCampaign = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`email-campaigns/${id}/cancel`, jsonBody({})),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["messaging", "email-campaigns"],
      }),
  });
  const estimateAudience = useMutation({
    mutationFn: (filter: CampaignAudienceFilter | null) =>
      adminFetch<{ count: number }>(
        "email-campaigns/preview-audience",
        jsonBody({ filter }),
      ),
  });
  const sendTest = useMutation({
    mutationFn: (input: { campaignId: string; email: string }) =>
      adminFetch<{ dry_run?: boolean; message?: string }>(
        `email-campaigns/${input.campaignId}/send-test`,
        jsonBody({ email: input.email, request_id: crypto.randomUUID() }),
      ),
  });

  const form = useForm<CampaignForm>({
    defaultValues: {
      name: "",
      scheduled_at: "",
      subject: "",
      template_id: "",
    },
    resolver: zodResolver(campaignSchema),
  });
  const selectedTemplateId = useWatch({
    control: form.control,
    name: "template_id",
  });
  const selectedTemplate = useMemo(
    () =>
      (templates.data ?? []).find(
        (template) => template.id === selectedTemplateId,
      ),
    [selectedTemplateId, templates.data],
  );

  const audienceFilter = useMemo(
    () =>
      buildAudienceFilter(
        audienceMode,
        includeTags,
        excludeTags,
        includeSegments,
        excludeSegments,
      ),
    [audienceMode, excludeSegments, excludeTags, includeSegments, includeTags],
  );
  const audienceKey = JSON.stringify(audienceFilter ?? {});
  const audienceEstimate = useQuery({
    queryFn: () =>
      adminFetch<{ count: number }>(
        "email-campaigns/preview-audience",
        jsonBody({ filter: audienceFilter }),
      ),
    queryKey: ["messaging", "email-campaigns", "preview-audience", audienceKey],
  });

  async function onSubmit(values: CampaignForm) {
    try {
      await createCampaign.mutateAsync({
        name: values.name,
        scheduled_at: values.scheduled_at
          ? new Date(values.scheduled_at).toISOString()
          : null,
        status: "draft",
        subject: values.subject,
        subscriber_filter: audienceFilter,
        template_id: values.template_id,
      });
      form.reset({ name: "", scheduled_at: "", subject: "", template_id: "" });
      setAudienceMode("all");
      setIncludeTags([]);
      setExcludeTags([]);
      setIncludeSegments([]);
      setExcludeSegments([]);
      toast.success("Campaign created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Campaign create failed",
      );
    }
  }

  async function openReview(campaign: EmailCampaign) {
    setReviewCampaign(campaign);
    setReviewEstimate(null);
    setReviewAcknowledged(false);
    try {
      const estimate = await estimateAudience.mutateAsync(
        campaign.subscriber_filter ?? null,
      );
      setReviewEstimate(estimate.count);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Audience estimate failed",
      );
    }
  }

  async function queueCampaign(id: string) {
    try {
      await sendCampaign.mutateAsync(id);
      setReviewCampaign(null);
      setReviewAcknowledged(false);
      toast.success(
        reviewCampaign?.scheduled_at &&
          new Date(reviewCampaign.scheduled_at).getTime() > Date.now()
          ? "Campaign scheduled"
          : "Campaign queued",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Queue failed");
    }
  }

  async function sendCampaignTest() {
    if (!testCampaign) return;
    try {
      const result = await sendTest.mutateAsync({
        campaignId: testCampaign.id,
        email: testEmail,
      });
      toast.success(
        result.dry_run
          ? "Campaign test rendered as dry run"
          : "Campaign test sent",
      );
      setTestCampaign(null);
      setTestEmail("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test send failed");
    }
  }

  async function cancel(id: string) {
    if (
      !window.confirm(
        "Cancel this schedule and return the campaign to draft? It will not be sent.",
      )
    ) {
      return;
    }
    try {
      await cancelCampaign.mutateAsync(id);
      toast.success("Campaign schedule cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cancel failed");
    }
  }

  const localTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  const reviewedTemplate = reviewCampaign
    ? (templates.data ?? []).find(
        (template) => template.id === reviewCampaign.template_id,
      )
    : null;
  const reviewIsScheduled = Boolean(
    reviewCampaign?.scheduled_at &&
    new Date(reviewCampaign.scheduled_at).getTime() > Date.now(),
  );

  function toggleTag(tag: string, target: "include" | "exclude") {
    const setter = target === "include" ? setIncludeTags : setExcludeTags;
    const otherSetter = target === "include" ? setExcludeTags : setIncludeTags;
    setter((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    );
    otherSetter((current) => current.filter((item) => item !== tag));
  }

  function toggleSegment(id: string, target: "include" | "exclude") {
    const setter =
      target === "include" ? setIncludeSegments : setExcludeSegments;
    const otherSetter =
      target === "include" ? setExcludeSegments : setIncludeSegments;
    setter((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    otherSetter((current) => current.filter((item) => item !== id));
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Campaigns"
        description="Compose, schedule, send, and inspect one-off marketing campaigns."
      />

      {campaigns.error ? (
        <ErrorState
          error={campaigns.error}
          onRetry={() => void campaigns.refetch()}
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.45fr)_minmax(0,0.55fr)]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Compose</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
              <label className="grid gap-2 text-sm font-medium">
                Campaign name
                <Input {...form.register("name")} />
                {form.formState.errors.name ? (
                  <span className="text-xs font-normal text-destructive">
                    {form.formState.errors.name.message}
                  </span>
                ) : null}
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Subject
                <Input
                  {...form.register("subject")}
                  placeholder={selectedTemplate?.subject ?? ""}
                />
                {form.formState.errors.subject ? (
                  <span className="text-xs font-normal text-destructive">
                    {form.formState.errors.subject.message}
                  </span>
                ) : null}
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Template
                <Select
                  value={selectedTemplateId}
                  onValueChange={(value) =>
                    form.setValue("template_id", value, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose template" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates.data ?? []).map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.template_id ? (
                  <span className="text-xs font-normal text-destructive">
                    {form.formState.errors.template_id.message}
                  </span>
                ) : selectedTemplate &&
                  !selectedTemplate.published_version_id ? (
                  <span className="text-xs font-normal text-amber-700 dark:text-amber-300">
                    Publish this template before the campaign can be queued.
                  </span>
                ) : null}
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Schedule (optional)
                <Input
                  type="datetime-local"
                  {...form.register("scheduled_at")}
                />
                <span className="text-xs font-normal text-muted-foreground">
                  Entered in {localTimeZone}. The campaign remains a draft until
                  it passes review.
                </span>
                {form.formState.errors.scheduled_at ? (
                  <span className="text-xs font-normal text-destructive">
                    {form.formState.errors.scheduled_at.message}
                  </span>
                ) : null}
              </label>

              <div className="grid gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="size-4" />
                  Audience
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={audienceMode === "all" ? "default" : "outline"}
                    onClick={() => setAudienceMode("all")}
                  >
                    All subscribers
                  </Button>
                  <Button
                    type="button"
                    variant={audienceMode === "tags" ? "default" : "outline"}
                    onClick={() => setAudienceMode("tags")}
                  >
                    By tag
                  </Button>
                  <Button
                    type="button"
                    variant={
                      audienceMode === "segments" ? "default" : "outline"
                    }
                    onClick={() => setAudienceMode("segments")}
                  >
                    Segments
                  </Button>
                </div>

                {audienceMode === "tags" ? (
                  <div className="grid gap-3 rounded-lg border border-border p-3">
                    <div className="grid gap-2">
                      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <Tags className="size-3" />
                        Include
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(tags.data ?? []).map((tag) => (
                          <Button
                            key={tag}
                            type="button"
                            size="sm"
                            variant={
                              includeTags.includes(tag) ? "default" : "outline"
                            }
                            onClick={() => toggleTag(tag, "include")}
                          >
                            {tag}
                          </Button>
                        ))}
                        {(tags.data ?? []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            No subscriber tags yet.
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Exclude
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(tags.data ?? []).map((tag) => (
                          <Button
                            key={tag}
                            type="button"
                            size="sm"
                            variant={
                              excludeTags.includes(tag) ? "default" : "outline"
                            }
                            onClick={() => toggleTag(tag, "exclude")}
                          >
                            {tag}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {audienceMode === "segments" ? (
                  <div className="grid gap-3 rounded-lg border border-border p-3">
                    <div className="grid gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Include any
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(segments.data ?? []).map((segment) => (
                          <Button
                            key={segment.id}
                            onClick={() => toggleSegment(segment.id, "include")}
                            size="sm"
                            type="button"
                            variant={
                              includeSegments.includes(segment.id)
                                ? "default"
                                : "outline"
                            }
                          >
                            {segment.name} ({segment.estimated_count})
                          </Button>
                        ))}
                        {(segments.data ?? []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Create a segment first.
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Exclude
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(segments.data ?? []).map((segment) => (
                          <Button
                            key={segment.id}
                            onClick={() => toggleSegment(segment.id, "exclude")}
                            size="sm"
                            type="button"
                            variant={
                              excludeSegments.includes(segment.id)
                                ? "default"
                                : "outline"
                            }
                          >
                            {segment.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                  {audienceEstimate.isLoading
                    ? "Estimating audience…"
                    : audienceEstimate.error
                      ? "Audience estimate unavailable. Sending will remain blocked until review can load it."
                      : `Estimated ${audienceEstimate.data?.count ?? 0} eligible subscribers`}
                </div>
              </div>

              <Button
                disabled={!compatibility.canEdit || createCampaign.isPending}
                type="submit"
              >
                <Megaphone className="size-4" />
                Save draft
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            {campaigns.isPending ? (
              <LoadingState label="Loading campaigns" />
            ) : campaigns.error ? null : (campaigns.data ?? []).length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Results</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(campaigns.data ?? []).map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <div className="grid gap-1">
                          <span className="font-medium">{campaign.name}</span>
                          <span className="max-w-72 truncate text-xs text-muted-foreground">
                            {campaign.subject}
                          </span>
                          <span className="max-w-72 truncate text-xs text-muted-foreground">
                            {tagList(campaign.subscriber_filter)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={campaign.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <CampaignAnalyticsSummary campaign={campaign} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="size-3" />
                          {campaign.scheduled_at
                            ? format(
                                new Date(campaign.scheduled_at),
                                "MMM d, HH:mm",
                              )
                            : "unscheduled"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {["draft", "failed"].includes(campaign.status) ? (
                            <>
                              <Button
                                disabled={!compatibility.canEdit}
                                size="sm"
                                variant="outline"
                                onClick={() => setTestCampaign(campaign)}
                              >
                                <FlaskConical className="size-4" />
                                Test
                              </Button>
                              <Button
                                disabled={!compatibility.canEdit}
                                size="sm"
                                variant="outline"
                                onClick={() => openReview(campaign)}
                              >
                                <Send className="size-4" />
                                {campaign.scheduled_at
                                  ? "Review schedule"
                                  : campaign.status === "failed"
                                    ? "Review retry"
                                    : "Review send"}
                              </Button>
                            </>
                          ) : null}
                          {campaign.status === "scheduled" &&
                          campaign.scheduled_at &&
                          new Date(campaign.scheduled_at).getTime() >
                            Date.now() ? (
                            <Button
                              disabled={
                                !compatibility.canEdit ||
                                cancelCampaign.isPending
                              }
                              size="sm"
                              variant="ghost"
                              onClick={() => cancel(campaign.id)}
                            >
                              <XCircle className="size-4" />
                              Cancel schedule
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState message="No campaigns yet." />
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog
        open={Boolean(reviewCampaign)}
        onOpenChange={(open) => {
          if (!open) {
            setReviewCampaign(null);
            setReviewAcknowledged(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewIsScheduled
                ? "Review scheduled campaign"
                : "Review campaign send"}
            </DialogTitle>
            <DialogDescription>
              This freezes the published template, audience definition, subject,
              and schedule into an immutable send revision.
            </DialogDescription>
          </DialogHeader>
          {reviewCampaign ? (
            <div className="grid gap-3 text-sm">
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Subject
                </span>
                <span>{reviewCampaign.subject}</span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Template
                </span>
                <span>
                  {reviewedTemplate?.name ?? reviewCampaign.template_id}
                  {reviewedTemplate?.published_version_id
                    ? " · published"
                    : " · not published"}
                </span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Audience
                </span>
                <span>{tagList(reviewCampaign.subscriber_filter)}</span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Recipients
                </span>
                <span>{reviewEstimate ?? "..."}</span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Schedule
                </span>
                <span>
                  {reviewCampaign.scheduled_at
                    ? `${format(new Date(reviewCampaign.scheduled_at), "MMM d, yyyy HH:mm")} (${localTimeZone})`
                    : "Send as soon as it is queued"}
                </span>
                {reviewCampaign.scheduled_at ? (
                  <span className="text-xs text-muted-foreground">
                    {new Date(reviewCampaign.scheduled_at).toISOString()} UTC
                  </span>
                ) : null}
              </div>
              <label className="flex items-start gap-3 rounded-md border border-border p-3">
                <Checkbox
                  checked={reviewAcknowledged}
                  id="campaign-send-acknowledgement"
                  onCheckedChange={(checked) =>
                    setReviewAcknowledged(checked === true)
                  }
                />
                <span className="text-sm leading-5">
                  I verified the subject, published template, audience,
                  exclusions, recipient estimate, and send time.
                </span>
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReviewCampaign(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !compatibility.canEdit ||
                !reviewCampaign ||
                reviewEstimate === null ||
                !reviewAcknowledged ||
                !reviewedTemplate?.published_version_id ||
                sendCampaign.isPending
              }
              onClick={() =>
                reviewCampaign ? queueCampaign(reviewCampaign.id) : undefined
              }
            >
              <Send className="size-4" />
              {reviewIsScheduled ? "Confirm schedule" : "Queue send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(testCampaign)}
        onOpenChange={(open) => (!open ? setTestCampaign(null) : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send test</DialogTitle>
            <DialogDescription>
              {testCampaign ? testCampaign.name : "Campaign test"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <label className="grid gap-2 text-sm font-medium">
              Test email
              <Input
                value={testEmail}
                onChange={(event) => setTestEmail(event.target.value)}
                placeholder="test@example.com"
              />
            </label>
            {testCampaign ? (
              <Badge variant="outline">{testCampaign.subject}</Badge>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTestCampaign(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !compatibility.canEdit ||
                !testCampaign ||
                !testEmail ||
                sendTest.isPending
              }
              onClick={sendCampaignTest}
            >
              <FlaskConical className="size-4" />
              Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
