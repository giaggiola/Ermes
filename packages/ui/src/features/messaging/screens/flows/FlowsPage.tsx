"use client";

import { format } from "date-fns";
import { ChevronRight, ListFilter, Mail, MoreHorizontal, Play, Plus, Search, Tags, TriangleAlert, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { triggerLabel } from "../../trigger-catalog";

import { EmptyState, ErrorState, LoadingState } from "../../components/admin/empty-state";
import { JsonBlock } from "../../components/admin/json-block";
import { PageHeader } from "../../components/admin/page-header";
import { StatusBadge } from "../../components/admin/status-badge";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../../components/ui/dropdown-menu";
import { Input } from "../../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../components/ui/tabs";
import { adminFetch, jsonBody } from "../../admin-api";
import type { EmailFlow, EmailTemplate } from "../../admin-types";
import { useEmailFlowRuns, useEmailFlows, useEmailTemplates } from "../../use-admin";
import { useMessagingCompatibility } from "../../contract";

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Live" },
  { value: "draft", label: "Draft" },
  { value: "paused", label: "Disabled" },
] as const;

type StatusFilter = (typeof statusOptions)[number]["value"];

type FlowListStep = {
  ab_test_enabled?: boolean;
  step_status?: "live" | "disabled";
  template_id?: string | null;
  type?: string;
};

function flowStatusLabel(status: EmailFlow["status"]) {
  if (status === "active") return "Live";
  if (status === "paused") return "Disabled";
  return "Draft";
}

function flowStatusTone(status: EmailFlow["status"]) {
  if (status === "active") return { dot: "bg-emerald-600", tone: "active" };
  if (status === "paused") return { dot: "bg-red-600", tone: "failed" };
  return { dot: "bg-zinc-500", tone: "draft" };
}

function flowEmailAlert(flow: EmailFlow, templates: EmailTemplate[]) {
  const templateById = new Map(templates.map((template) => [template.id, template]));
  const steps = Array.isArray(flow.steps) ? (flow.steps as FlowListStep[]) : [];

  return steps.some((step) => {
    if (step?.type !== "email") return false;
    if (step.step_status === "disabled") return true;
    if (!step.template_id) return true;
    const template = templateById.get(step.template_id);
    return !template || !template.is_active;
  });
}

function flowTags(flow: EmailFlow) {
  return Array.isArray(flow.tags) ? flow.tags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0) : [];
}

function flowHasAbTest(flow: EmailFlow) {
  const steps = Array.isArray(flow.steps) ? (flow.steps as FlowListStep[]) : [];
  return steps.some((step) => step?.type === "email" && step.ab_test_enabled);
}

export default function FlowsPage() {
  const router = useRouter();
  const compatibility = useMessagingCompatibility();
  const flows = useEmailFlows();
  const runs = useEmailFlowRuns();
  const templates = useEmailTemplates();
  const queryClient = useQueryClient();

  const [alertOnly, setAlertOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [testFlowId, setTestFlowId] = useState<string>("");
  const [testEmail, setTestEmail] = useState("");

  const flowNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const flow of flows.data ?? []) {
      map.set(flow.id, flow.name);
    }
    return map;
  }, [flows.data]);

  const flowAlerts = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const flow of flows.data ?? []) {
      map.set(flow.id, flowEmailAlert(flow, templates.data ?? []));
    }
    return map;
  }, [flows.data, templates.data]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const flow of flows.data ?? []) {
      for (const tag of flowTags(flow)) tags.add(tag);
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [flows.data]);

  const filteredFlows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (flows.data ?? []).filter((flow) => {
      if (query && !flow.name.toLowerCase().includes(query)) return false;
      if (statusFilter !== "all" && flow.status !== statusFilter) return false;
      if (alertOnly && !flowAlerts.get(flow.id)) return false;
      if (selectedTags.length > 0 && !selectedTags.some((tag) => flowTags(flow).includes(tag))) return false;
      return true;
    });
  }, [alertOnly, flowAlerts, flows.data, search, selectedTags, statusFilter]);

  const recentRuns = (runs.data ?? []).slice(0, 10);

  const testTrigger = useMutation({
    mutationFn: (input: { email: string; flow_id: string }) =>
      adminFetch("email-flows/test-trigger", jsonBody(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messaging", "email-flow-runs"] }),
  });
  const installRecipes = useMutation({
    mutationFn: () =>
      adminFetch<{
        installation: {
          created_flow_ids: string[];
          created_template_ids: string[];
          retained_legacy_active_flow_ids: string[];
          retired_flow_ids: string[];
          updated_flow_ids: string[];
        };
      }>("v2/flow-recipes/install", jsonBody({})),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messaging", "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["messaging", "email-flows"] }),
        queryClient.invalidateQueries({ queryKey: ["messaging", "email-templates"] }),
      ]);
    },
  });

  async function runTest() {
    if (!compatibility.canEdit) return;
    try {
      await testTrigger.mutateAsync({ email: testEmail, flow_id: testFlowId });
      toast.success("Test trigger queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test trigger failed");
    }
  }

  async function installStarterFlows() {
    if (!compatibility.canEdit || installRecipes.isPending) return;
    if (
      !window.confirm(
        "Create missing starter flows and apply the standard safety exclusions to existing starter drafts? Email steps remain disabled and nothing will send.",
      )
    ) {
      return;
    }

    try {
      const result = await installRecipes.mutateAsync();
      const created = result.installation.created_flow_ids.length;
      const retired = result.installation.retired_flow_ids.length;
      const updated = result.installation.updated_flow_ids.length;
      toast.success(
        created > 0
          ? `${created} starter flow${created === 1 ? "" : "s"} created as drafts`
          : retired > 0
            ? `${retired} legacy post-purchase flow${retired === 1 ? "" : "s"} retired`
          : updated > 0
            ? `${updated} starter flow${updated === 1 ? "" : "s"} updated with safety exclusions`
          : "All starter flows are already installed",
      );
      if (result.installation.retained_legacy_active_flow_ids.length > 0) {
        toast.warning(
          "Active legacy post-purchase flows were retained; disable them after publishing the consolidated flow.",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Starter flows could not be installed",
      );
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Flows"
        description="Build and manage automation flows visually. Open a flow to edit its steps on the canvas."
        actions={
          <div className="flex items-center gap-2">
            <Button disabled={!compatibility.canEdit} onClick={() => router.push("/messaging/flows/new")}>
              <Plus className="size-4" />
              New flow
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="More flow actions" size="icon" variant="outline">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!compatibility.canEdit || installRecipes.isPending}
                  onSelect={() => void installStarterFlows()}
                >
                  <WandSparkles className="size-4" />
                  Install starter flows
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {flows.error ? (
        <ErrorState error={flows.error} onRetry={() => void flows.refetch()} />
      ) : null}

      <Tabs defaultValue="definitions" className="gap-4">
        <TabsList>
          <TabsTrigger value="definitions">Definitions</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>

        <TabsContent value="definitions" className="grid gap-4">
          <Card className="gap-0 rounded-lg py-0">
            <CardHeader className="border-b py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search flows" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="sm:ml-auto" variant="outline">
                      <ListFilter className="size-4" />
                      Filters
                      {selectedTags.length + (alertOnly ? 1 : 0) > 0 ? (
                        <Badge className="ml-1" variant="secondary">
                          {selectedTags.length + (alertOnly ? 1 : 0)}
                        </Badge>
                      ) : null}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>Flow health</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem checked={alertOnly} onCheckedChange={setAlertOnly}>
                      <TriangleAlert className="size-4" />
                      Sender alerts only
                    </DropdownMenuCheckboxItem>
                    {allTags.length > 0 ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="flex items-center gap-2">
                          <Tags className="size-4" />
                          Tags
                        </DropdownMenuLabel>
                        {allTags.map((tag) => (
                          <DropdownMenuCheckboxItem
                            checked={selectedTags.includes(tag)}
                            key={tag}
                            onCheckedChange={() => toggleTag(tag)}
                          >
                            {tag}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </>
                    ) : null}
                    {selectedTags.length > 0 || alertOnly ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => {
                            setSelectedTags([]);
                            setAlertOnly(false);
                          }}
                        >
                          Clear filters
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {flows.isPending ? (
                <LoadingState label="Loading flows" />
              ) : flows.error ? null : (flows.data ?? []).length > 0 ? (
                filteredFlows.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Steps</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="w-0" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFlows.map((flow) => {
                        const stepCount = Array.isArray(flow.steps) ? flow.steps.length : 0;
                        const hasAlert = flowAlerts.get(flow.id) ?? false;
                        const hasAbTest = flowHasAbTest(flow);
                        const statusTone = flowStatusTone(flow.status);
                        const tags = flowTags(flow);

                        return (
                          <TableRow key={flow.id} className="cursor-pointer" onClick={() => router.push(`/messaging/flows/${flow.id}`)}>
                            <TableCell>
                              <div className="grid gap-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{flow.name}</span>
                                  {hasAlert ? (
                                    <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                                      <TriangleAlert className="size-3" />
                                      Sender alert
                                    </Badge>
                                  ) : null}
                                  {hasAbTest ? (
                                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                                      A/B
                                    </Badge>
                                  ) : null}
                                </div>
                                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1">
                                    <Mail className="size-3" />
                                    {triggerLabel(flow.trigger_event)}
                                  </span>
                                  {tags.length > 0 ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Tags className="size-3" />
                                      {tags.join(", ")}
                                    </span>
                                  ) : null}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <StatusBadge value={statusTone.tone} label={flowStatusLabel(flow.status)} dotClassName={statusTone.dot} />
                            </TableCell>
                            <TableCell className="text-muted-foreground">{stepCount}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {flow.updated_at ? format(new Date(flow.updated_at), "MMM d, yyyy") : "-"}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              <ChevronRight className="ml-auto size-4" />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState message="No flows match the current filters." />
                )
              ) : (
                <EmptyState message="No flows yet. Create one to get started." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operations">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Recent Runs</CardTitle>
              </CardHeader>
              <CardContent>
                {runs.isPending ? (
                  <LoadingState label="Loading flow runs" />
                ) : runs.error ? (
                  <ErrorState
                    error={runs.error}
                    onRetry={() => void runs.refetch()}
                  />
                ) : recentRuns.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Flow</TableHead>
                        <TableHead>Subscriber</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead>Context</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentRuns.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell>{flowNames.get(run.flow_id) ?? run.flow_id}</TableCell>
                          <TableCell>{run.subscriber_email}</TableCell>
                          <TableCell>
                            <StatusBadge value={run.status} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">{format(new Date(run.started_at), "MMM d, HH:mm")}</TableCell>
                          <TableCell className="min-w-80">
                            <JsonBlock value={run.context} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState message="No flow runs yet." />
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Test a flow</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Select value={testFlowId} onValueChange={setTestFlowId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a flow" />
                  </SelectTrigger>
                  <SelectContent>
                    {(flows.data ?? []).map((flow) => (
                      <SelectItem key={flow.id} value={flow.id}>
                        {flow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="test@example.com" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} />
                <Button type="button" variant="outline" disabled={!compatibility.canEdit || !testEmail || !testFlowId || testTrigger.isPending} onClick={runTest}>
                  <Play className="size-4" />
                  Send test trigger
                </Button>
              </CardContent>
            </Card>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
