"use client";

import { Eye, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Textarea } from "../../../../components/ui/textarea";
import { adminFetch, jsonBody } from "../../admin-api";
import type {
  EmailSegment,
  SegmentCondition,
  SegmentOperator,
  SegmentRuleGroup,
} from "../../admin-types";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/admin/empty-state";
import { PageHeader } from "../../components/admin/page-header";
import { StatusBadge } from "../../components/admin/status-badge";
import { useMessagingCompatibility } from "../../contract";
import {
  useAdminCreate,
  useAdminDelete,
  useAdminPatch,
  useEmailSegments,
} from "../../use-admin";

const fields = [
  ["subscribed", "Subscription status"],
  ["subscription_source", "Subscription source"],
  ["tags", "Tag"],
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["properties.order_count", "Order count"],
  ["properties.total_spent", "Total spent"],
] as const;

const operators: Array<[SegmentOperator, string]> = [
  ["equals", "equals"],
  ["not_equals", "does not equal"],
  ["contains", "contains"],
  ["not_contains", "does not contain"],
  ["greater_than", "is greater than"],
  ["less_than", "is less than"],
  ["exists", "is known"],
];

const blankCondition: SegmentCondition = {
  field: "tags",
  operator: "contains",
  value: "",
};

export default function SegmentsPage() {
  const compatibility = useMessagingCompatibility();
  const segments = useEmailSegments();
  const create = useAdminCreate<{
    description: string | null;
    name: string;
    rules: SegmentRuleGroup;
    status: "active";
  }>("email-segments", ["email-segments"]);
  const update = useAdminPatch<{
    description: string | null;
    id: string;
    name: string;
    rules: SegmentRuleGroup;
    status: "active";
  }>("email-segments", ["email-segments"]);
  const remove = useAdminDelete("email-segments", ["email-segments"]);

  const [selected, setSelected] = useState<EmailSegment | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [match, setMatch] = useState<"all" | "any">("all");
  const [conditions, setConditions] = useState<SegmentCondition[]>([
    blankCondition,
  ]);
  const [preview, setPreview] = useState<{
    count: number;
    sample: Array<{ email: string; id: string }>;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setDescription(selected.description ?? "");
    setMatch(selected.rules.match);
    setConditions(
      selected.rules.conditions.length
        ? selected.rules.conditions
        : [blankCondition],
    );
    setPreview(null);
  }, [selected]);

  const rules: SegmentRuleGroup = { conditions, match };

  function reset() {
    setSelected(null);
    setName("");
    setDescription("");
    setMatch("all");
    setConditions([blankCondition]);
    setPreview(null);
  }

  async function previewRules() {
    setPreviewing(true);
    try {
      const result = await adminFetch<{
        count: number;
        sample: Array<{ email: string; id: string }>;
      }>("email-segments/preview", jsonBody({ rules }));
      setPreview(result);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not preview segment",
      );
    } finally {
      setPreviewing(false);
    }
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Segment name is required");
      return;
    }
    if (
      conditions.some(
        (condition) =>
          !condition.field ||
          (condition.operator !== "exists" &&
            String(condition.value ?? "").trim() === ""),
      )
    ) {
      toast.error("Complete every segment condition");
      return;
    }
    try {
      const input = {
        description: description.trim() || null,
        name: name.trim(),
        rules,
        status: "active" as const,
      };
      if (selected) {
        await update.mutateAsync({ ...input, id: selected.id });
      } else {
        await create.mutateAsync(input);
      }
      toast.success(selected ? "Segment updated" : "Segment created");
      reset();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Segment save failed",
      );
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <Button onClick={reset} variant="outline">
            <Plus className="size-4" />
            New segment
          </Button>
        }
        description="Build reusable audiences from live profile properties and tags."
        title="Segments"
      />

      {segments.error ? (
        <ErrorState
          error={segments.error}
          onRetry={() => void segments.refetch()}
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Saved audiences</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {segments.isPending ? (
              <LoadingState label="Loading segments" />
            ) : segments.error ? null : (segments.data ?? []).length ? (
              (segments.data ?? []).map((segment) => (
                <button
                  className={`grid gap-1 rounded-md border p-3 text-left transition-colors hover:bg-accent ${
                    selected?.id === segment.id ? "bg-accent" : ""
                  }`}
                  key={segment.id}
                  onClick={() => setSelected(segment)}
                  type="button"
                >
                  <span className="font-medium">{segment.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {segment.estimated_count.toLocaleString()} profiles
                  </span>
                  <StatusBadge value={segment.status} />
                </button>
              ))
            ) : (
              <EmptyState message="No segments yet." />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{selected ? "Edit segment" : "New segment"}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  Name
                  <Input
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Engaged customers"
                    value={name}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Match
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    onChange={(event) =>
                      setMatch(event.target.value as "all" | "any")
                    }
                    value={match}
                  >
                    <option value="all">All conditions</option>
                    <option value="any">Any condition</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">
                Description
                <Textarea
                  onChange={(event) => setDescription(event.target.value)}
                  value={description}
                />
              </label>

              <div className="grid gap-2">
                {conditions.map((condition, index) => (
                  <div
                    className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
                    key={`${index}-${condition.field}`}
                  >
                    <select
                      className="h-9 rounded-md border bg-background px-3 text-sm"
                      onChange={(event) =>
                        setConditions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, field: event.target.value }
                              : item,
                          ),
                        )
                      }
                      value={condition.field}
                    >
                      {fields.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-9 rounded-md border bg-background px-3 text-sm"
                      onChange={(event) =>
                        setConditions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  operator: event.target
                                    .value as SegmentOperator,
                                }
                              : item,
                          ),
                        )
                      }
                      value={condition.operator}
                    >
                      {operators.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Input
                      disabled={condition.operator === "exists"}
                      onChange={(event) =>
                        setConditions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Value"
                      value={String(condition.value ?? "")}
                    />
                    <Button
                      aria-label="Remove condition"
                      disabled={conditions.length === 1}
                      onClick={() =>
                        setConditions((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  className="w-fit"
                  onClick={() =>
                    setConditions((current) => [
                      ...current,
                      { ...blankCondition },
                    ])
                  }
                  type="button"
                  variant="outline"
                >
                  <Plus className="size-4" />
                  Add condition
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!compatibility.canEdit || previewing}
                  onClick={previewRules}
                  type="button"
                  variant="outline"
                >
                  <Eye className="size-4" />
                  Preview audience
                </Button>
                <Button
                  disabled={
                    !compatibility.canEdit ||
                    create.isPending ||
                    update.isPending
                  }
                  onClick={save}
                  type="button"
                >
                  <Save className="size-4" />
                  Save segment
                </Button>
                {selected ? (
                  <Button
                    disabled={!compatibility.canEdit || remove.isPending}
                    onClick={async () => {
                      await remove.mutateAsync(selected.id);
                      toast.success("Segment archived");
                      reset();
                    }}
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 className="size-4" />
                    Archive
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {preview ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {preview.count.toLocaleString()} matching profiles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-1 text-sm text-muted-foreground">
                  {preview.sample.length
                    ? preview.sample.map((profile) => (
                        <span key={profile.id}>{profile.email}</span>
                      ))
                    : "No sample profiles match these rules."}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>
    </div>
  );
}
