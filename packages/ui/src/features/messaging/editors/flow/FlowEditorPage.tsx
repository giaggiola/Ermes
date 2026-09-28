"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, MoreHorizontal, Play, Plus, Rocket, Save, Settings2, Tags, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Edge, Node } from "@xyflow/react";
import type { TriggerConditionInput } from "../../contracts/flow-types";
import { triggerByValue, type TriggerDefinition } from "../../trigger-catalog";

import { Button } from "../../../../components/ui/button";
import { EditorWorkspace } from "../../../../components/patterns/EditorWorkspace";
import { Badge } from "../../../../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../components/ui/dropdown-menu";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../../../../components/ui/sheet";
import { Textarea } from "../../../../components/ui/textarea";
import { StatusBadge } from "../../components/admin/status-badge";
import { adminFetch, jsonBody, patchBody } from "../../admin-api";
import { useEmailTemplates } from "../../use-admin";
import type { EmailFlow } from "../../admin-types";
import { useMessagingCompatibility } from "../../contract";
import {
  confirmUnsavedChanges,
  useUnsavedChangesGuard,
} from "../../journeys/use-unsaved-changes-guard";

import { FlowCanvas } from "./components/FlowCanvas";
import { Sidebar } from "./components/Sidebar";
import { NodeDetailPanel } from "./components/NodeDetailPanel";
import { TriggerPicker } from "./components/TriggerPicker";
import { stepsToFlow, flowToSteps, createInitialFlow, type FlowStep } from "./components/flowUtils";

interface FlowState {
  id?: string;
  name: string;
  description: string;
  message_kind: "marketing" | "transactional";
  trigger_event: string;
  steps: FlowStep[];
  status: "draft" | "active" | "paused";
  tags: string[];
  reentry_mode?: "never" | "after_duration" | "always";
  reentry_duration?: number;
  reentry_unit?: "hours" | "days";
  trigger_delay_hours?: number;
  trigger_conditions?: TriggerConditionInput | null;
}

function normalizeTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0) : [];
}

export default function FlowEditorPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const compatibility = useMessagingCompatibility();
  const isNew = id === "new";

  const templatesQuery = useEmailTemplates();
  const templates = (templatesQuery.data ?? []).map((t) => ({ id: t.id, name: t.name }));

  const [flow, setFlow] = useState<FlowState>({
    name: "",
    description: "",
    message_kind: "marketing",
    trigger_event: "",
    steps: [],
    status: "draft",
    tags: [],
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [triggerChosen, setTriggerChosen] = useState(!isNew);

  // Visual flow state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flowInitialized, setFlowInitialized] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  useUnsavedChangesGuard(dirty);

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      setFlowInitialized(false);
      setTriggerChosen(false);
      setNodes([]);
      setEdges([]);
      setDirty(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await adminFetch<{ email_flow: EmailFlow }>(`email-flows/${id}`);
        if (cancelled) return;
        const loaded = data.email_flow;
        const steps = (loaded.steps as FlowStep[]) ?? [];
        setFlow({
          id: loaded.id,
          name: loaded.name,
          description: loaded.description ?? "",
          message_kind:
            loaded.message_kind ??
            triggerByValue(loaded.trigger_event)?.messageKind ??
            "marketing",
          trigger_event: loaded.trigger_event,
          steps,
          status: loaded.status,
          tags: normalizeTags(loaded.tags),
          reentry_mode: loaded.reentry_mode ?? "never",
          reentry_duration: loaded.reentry_duration ?? undefined,
          reentry_unit: loaded.reentry_unit ?? undefined,
          trigger_delay_hours: loaded.trigger_delay_hours ?? 1,
          trigger_conditions: (loaded.trigger_conditions as TriggerConditionInput | null) ?? [],
        });

        // Convert flow steps to visual nodes/edges
        const graph = loaded.graph_document;
        const storedNodes =
          graph && Array.isArray(graph.nodes) ? (graph.nodes as Node[]) : null;
        const storedEdges =
          graph && Array.isArray(graph.edges) ? (graph.edges as Edge[]) : null;
        const fallback = stepsToFlow(loaded.trigger_event, steps);
        const flowNodes = storedNodes?.length ? storedNodes : fallback.nodes;
        const flowEdges = storedEdges ?? fallback.edges;

        // Inject flow-level settings into trigger node
        const nodesWithFlowSettings = flowNodes.map((node) => {
          if (node.type === "trigger") {
            return {
              ...node,
              data: {
                ...node.data,
                reentry_mode: loaded.reentry_mode ?? "never",
                reentry_duration: loaded.reentry_duration,
                reentry_unit: loaded.reentry_unit,
                trigger_delay_hours: loaded.trigger_delay_hours ?? 1,
                trigger_conditions: loaded.trigger_conditions ?? [],
              },
            };
          }
          return node;
        });

        setNodes(nodesWithFlowSettings);
        setEdges(flowEdges);
        setFlowInitialized(true);
        setTriggerChosen(true);
        setDirty(false);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  // Sync visual changes back to flow data
  const handleNodesChange = useCallback(
    (newNodes: Node[]) => {
      setNodes(newNodes);
      setDirty(true);
      const { triggerEvent, steps } = flowToSteps(newNodes, edges);
      setFlow((prev) => ({ ...prev, trigger_event: triggerEvent, steps }));
    },
    [edges],
  );

  const handleEdgesChange = useCallback(
    (newEdges: Edge[]) => {
      setEdges(newEdges);
      setDirty(true);
      const { triggerEvent, steps } = flowToSteps(nodes, newEdges);
      setFlow((prev) => ({ ...prev, trigger_event: triggerEvent, steps }));
    },
    [nodes],
  );

  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNode(node);
  }, []);

  const handleTriggerSelect = useCallback((trigger: TriggerDefinition) => {
    const { nodes: initialNodes, edges: initialEdges } = createInitialFlow(trigger.value);
    setNodes(initialNodes);
    setEdges(initialEdges);
    setSelectedNode(null);
    setFlow((prev) => ({
      ...prev,
      message_kind: trigger.messageKind,
      trigger_event: trigger.value,
      trigger_delay_hours: trigger.timed ? prev.trigger_delay_hours ?? 1 : 0,
      steps: [],
    }));
    setFlowInitialized(true);
    setTriggerChosen(true);
    setDirty(true);
  }, []);

  // Handle node data updates from the detail panel
  const handleUpdateNodeFromPanel = useCallback(
    (nodeId: string, updates: Record<string, unknown>) => {
      setDirty(true);
      setNodes((nds) => {
        const newNodes = nds.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...updates } } : node));

        const { triggerEvent, steps } = flowToSteps(newNodes, edges);
        const node = newNodes.find((n) => n.id === nodeId);

        if (node?.type === "trigger") {
          const selectedTrigger = triggerByValue(triggerEvent);
          setFlow((prev) => ({
            ...prev,
            message_kind:
              typeof updates.trigger_event === "string"
                ? selectedTrigger?.messageKind ?? prev.message_kind
                : prev.message_kind,
            trigger_event: triggerEvent,
            steps,
            reentry_mode: (updates.reentry_mode as FlowState["reentry_mode"]) ?? prev.reentry_mode,
            reentry_duration: (updates.reentry_duration as number) ?? prev.reentry_duration,
            reentry_unit: (updates.reentry_unit as FlowState["reentry_unit"]) ?? prev.reentry_unit,
            trigger_delay_hours: (updates.trigger_delay_hours as number) ?? prev.trigger_delay_hours,
            trigger_conditions: (updates.trigger_conditions as TriggerConditionInput) ?? prev.trigger_conditions,
          }));
        } else {
          setFlow((prev) => ({ ...prev, trigger_event: triggerEvent, steps }));
        }

        const updatedNode = newNodes.find((n) => n.id === nodeId);
        if (updatedNode) {
          setSelectedNode(updatedNode);
        }
        return newNodes;
      });
    },
    [edges],
  );

  const handleCloseDetailPanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    setFlow((prev) => ({ ...prev, tags: Array.from(new Set([...prev.tags, tag])).sort((a, b) => a.localeCompare(b)) }));
    setTagInput("");
    setDirty(true);
  };

  const removeTag = (tag: string) => {
    setFlow((prev) => ({ ...prev, tags: prev.tags.filter((item) => item !== tag) }));
    setDirty(true);
  };

  const handleSave = async (): Promise<string | null> => {
    if (!compatibility.canEdit) return null;
    if (!triggerChosen) {
      setError("Choose a trigger before saving");
      toast.error("Choose a trigger before saving");
      return null;
    }

    if (!flow.name) {
      setError("Flow name is required");
      toast.error("Flow name is required");
      return null;
    }

    // Sync final state from canvas
    const { triggerEvent, steps } = flowToSteps(nodes, edges);
    const payload = {
      name: flow.name,
      description: flow.description || null,
      message_kind: flow.message_kind,
      trigger_event: triggerEvent,
      steps,
      status: flow.status,
      tags: flow.tags.length > 0 ? flow.tags : null,
      reentry_mode: flow.reentry_mode ?? "never",
      reentry_duration: flow.reentry_mode === "after_duration" ? flow.reentry_duration ?? null : null,
      reentry_unit: flow.reentry_mode === "after_duration" ? flow.reentry_unit ?? "days" : null,
      trigger_delay_hours: flow.trigger_delay_hours ?? 0,
      trigger_conditions: flow.trigger_conditions ?? [],
      graph_document: {
        edges,
        nodes: nodes.map((node) => {
          const data = {
            ...(node.data as Record<string, unknown>),
          };
          delete data.onDataChange;
          delete data.templates;
          return {
            data,
            id: node.id,
            position: node.position,
            type: node.type,
          };
        }),
        schema_version: 1,
      },
    };

    setSaving(true);
    setError(null);

    try {
      if (isNew) {
        const created = await adminFetch<{ email_flow: EmailFlow }>("email-flows", jsonBody(payload));
        await queryClient.invalidateQueries({ queryKey: ["messaging", "email-flows"] });
        await queryClient.invalidateQueries({ queryKey: ["messaging", "dashboard"] });
        toast.success("Flow created");
        setDirty(false);
        router.push(`/messaging/flows/${created.email_flow.id}`);
        return created.email_flow.id;
      } else {
        const updated = await adminFetch<{ email_flow: EmailFlow }>(`email-flows/${id}`, patchBody(payload));
        await queryClient.invalidateQueries({ queryKey: ["messaging", "email-flows"] });
        setFlow((prev) => ({ ...prev, id: updated.email_flow.id, status: payload.status, steps: payload.steps, tags: payload.tags ?? [] }));
        setDirty(false);
        toast.success("Flow saved");
        return updated.email_flow.id;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!compatibility.canEdit) return;
    const { steps } = flowToSteps(nodes, edges);

    if (steps.length === 0) {
      setError("Add at least one step before activating");
      toast.error("Add at least one step before activating");
      return;
    }

    const hasInvalidSteps = steps.some((step) => step.type === "email" && !step.template_id);
    if (hasInvalidSteps) {
      setError("All email steps must have a template selected");
      toast.error("All email steps must have a template selected");
      return;
    }

    if (isNew) {
      toast.info("Create the flow before publishing it.");
      return;
    }
    if (
      !window.confirm(
        `Publish "${flow.name}"? New eligible events can enter this flow as soon as the published version is active.`,
      )
    ) {
      return;
    }

    setPublishing(true);
    try {
      const savedId = await handleSave();
      if (!savedId) return;
      const validation = await adminFetch<{
        validation: { errors?: string[]; valid: boolean };
      }>(`v2/email-flows/${savedId}/validate`, jsonBody({}));
      if (!validation.validation.valid) {
        throw new Error(
          validation.validation.errors?.join(". ") ||
            "Flow validation failed",
        );
      }
      await adminFetch(
        `v2/email-flows/${savedId}/publish`,
        jsonBody({}),
      );
      setFlow((prev) => ({ ...prev, status: "active" }));
      await queryClient.invalidateQueries({
        queryKey: ["messaging", "email-flows"],
      });
      toast.success("Flow published");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleSimulate = async () => {
    if (isNew) {
      toast.info("Create the flow before simulating it.");
      return;
    }
    setSimulating(true);
    try {
      const result = await adminFetch<{
        simulation: Array<Record<string, unknown>>;
      }>(
        `v2/email-flows/${id}/simulate`,
        jsonBody({
          context: {
            email: "preview@example.com",
            first_name: "Preview",
          },
        }),
      );
      toast.success(
        `Simulation completed ${result.simulation.length} step${result.simulation.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setSimulating(false);
    }
  };

  if (loading || compatibility.loading) {
    return (
      <div
        aria-live="polite"
        className="flex h-full items-center justify-center"
        role="status"
      >
        <div className="animate-pulse text-muted-foreground motion-reduce:animate-none">
          Loading flow editor…
        </div>
      </div>
    );
  }

  return (
    <EditorWorkspace
      header={
        <div className="border-b border-border bg-card">
          <div className="flex min-w-0 items-center gap-3 px-3 py-2.5 sm:px-4">
            <Button
              aria-label="Back to flows"
              onClick={() => {
                if (confirmUnsavedChanges(dirty)) router.push("/messaging/flows");
              }}
              size="icon-sm"
              title="Back to flows"
              variant="ghost"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-sm font-semibold">
                  {isNew ? flow.name || "New flow" : flow.name || "Untitled flow"}
                </h1>
                {!isNew ? <span className="hidden sm:inline-flex"><StatusBadge value={flow.status} /></span> : null}
              </div>
              <p className={`mt-0.5 text-xs ${dirty ? "text-amber-600" : "text-muted-foreground"}`}>
                {saving ? "Saving…" : dirty ? "Unsaved changes" : isNew ? "Not created yet" : "Saved"}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {triggerChosen ? (
                <Sheet>
                  <SheetTrigger asChild>
                    <Button aria-label="Flow settings" variant="outline">
                      <Settings2 className="size-4" />
                      <span className="hidden lg:inline">Flow settings</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="w-full gap-0 sm:max-w-md">
                    <SheetHeader className="border-b pr-12">
                      <SheetTitle>Flow settings</SheetTitle>
                      <SheetDescription>
                        Name, delivery policy, and organization for this flow.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="grid gap-5 overflow-y-auto p-4">
                      <div className="grid gap-2">
                        <Label>Flow name</Label>
                        <Input
                          value={flow.name}
                          onChange={(event) => {
                            setFlow({ ...flow, name: event.target.value });
                            setDirty(true);
                          }}
                          placeholder="Welcome series"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label>Description</Label>
                        <Textarea
                          value={flow.description}
                          onChange={(event) => {
                            setFlow({ ...flow, description: event.target.value });
                            setDirty(true);
                          }}
                          placeholder="What this flow does and who it is for"
                          rows={3}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label>Delivery policy</Label>
                        <Select
                          value={flow.message_kind}
                          onValueChange={(value) => {
                            setFlow({
                              ...flow,
                              message_kind: value as "marketing" | "transactional",
                            });
                            setDirty(true);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="marketing">Marketing — honors opt-out</SelectItem>
                            <SelectItem value="transactional">Transactional — service message</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Transactional delivery is only for essential order or service messages.
                        </p>
                      </div>

                      <div className="grid gap-2">
                        <Label className="flex items-center gap-2">
                          <Tags className="size-3.5" />
                          Tags
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            value={tagInput}
                            onChange={(event) => setTagInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addTag();
                              }
                            }}
                            placeholder="Add a tag"
                          />
                          <Button aria-label="Add tag" type="button" size="icon" variant="outline" onClick={addTag}>
                            <Plus className="size-4" />
                          </Button>
                        </div>
                        {flow.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {flow.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                                {tag}
                                <button
                                  aria-label={`Remove ${tag}`}
                                  type="button"
                                  className="rounded-full p-0.5 hover:bg-background/80"
                                  onClick={() => removeTag(tag)}
                                >
                                  <X className="size-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No tags added.</p>
                        )}
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              ) : null}
              {!isNew && triggerChosen ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button aria-label="More flow actions" size="icon" variant="outline">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={!compatibility.canEdit || simulating}
                      onSelect={() => void handleSimulate()}
                    >
                      <Play className="size-4" />
                      {simulating ? "Testing flow…" : "Test flow"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {!isNew ? (
                <Button
                  aria-label="Save flow draft"
                  variant="outline"
                  onClick={() => void handleSave()}
                  disabled={!compatibility.canEdit || saving || !triggerChosen}
                >
                  <Save className="size-4" />
                  <span className="hidden md:inline">Save draft</span>
                </Button>
              ) : null}
              {isNew ? (
                <Button
                  onClick={() => void handleSave()}
                  disabled={!compatibility.canEdit || saving || !triggerChosen}
                >
                  Create flow
                </Button>
              ) : (
                <Button
                  onClick={handlePublish}
                  disabled={!compatibility.canEdit || publishing || !triggerChosen}
                >
                  <Rocket className="size-4" />
                  <span className="hidden md:inline">
                    {flow.status === "active" ? "Publish changes" : "Publish"}
                  </span>
                  <span className="md:hidden">Publish</span>
                </Button>
              )}
            </div>
          </div>

          {error ? (
            <div
              className="mx-4 mb-3 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40"
              role="alert"
            >
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          ) : null}
        </div>
      }
    >
      {isNew && !triggerChosen ? (
        <div className={compatibility.canEdit ? "" : "pointer-events-none opacity-70"}>
          <TriggerPicker onSelect={handleTriggerSelect} />
        </div>
      ) : (
        <div className={`relative flex h-full min-h-0 min-w-0 overflow-hidden ${compatibility.canEdit ? "" : "pointer-events-none opacity-70"}`}>
          {/* Step palette */}
          <Sidebar />

          {/* Canvas */}
          {flowInitialized ? (
            <FlowCanvas
              initialNodes={nodes}
              initialEdges={edges}
              templates={templates}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onNodeSelect={handleNodeSelect}
            />
          ) : null}

          {/* Right-side Detail Panel */}
          {selectedNode ? (
            <NodeDetailPanel
              selectedNode={selectedNode}
              templates={templates}
              onClose={handleCloseDetailPanel}
              onUpdateNode={handleUpdateNodeFromPanel}
              flowId={isNew ? undefined : id}
            />
          ) : null}
        </div>
      )}
    </EditorWorkspace>
  );
}
