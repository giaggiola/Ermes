"use client";

import { format } from "date-fns";
import { Activity } from "lucide-react";
import { useMemo, useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/admin/empty-state";
import { JsonBlock } from "../../components/admin/json-block";
import { PageHeader } from "../../components/admin/page-header";
import { StatusBadge } from "../../components/admin/status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
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
import {
  useEmailEvents,
  useEmailFlowRuns,
  useEmailFlows,
  useEmailTemplates,
} from "../../use-admin";

const eventTypes = [
  "all",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "skipped",
] as const;

export default function EventsPage() {
  const events = useEmailEvents();
  const templates = useEmailTemplates();
  const flows = useEmailFlows();
  const runs = useEmailFlowRuns();
  const [type, setType] = useState<(typeof eventTypes)[number]>("all");
  const [search, setSearch] = useState("");

  const templateById = useMemo(
    () =>
      new Map(
        (templates.data ?? []).map((template) => [template.id, template.name]),
      ),
    [templates.data],
  );
  const flowById = useMemo(
    () => new Map((flows.data ?? []).map((flow) => [flow.id, flow.name])),
    [flows.data],
  );
  const runLabelById = useMemo(
    () =>
      new Map(
        (runs.data ?? []).map((run) => [
          run.id,
          flowById.get(run.flow_id) ?? run.flow_id,
        ]),
      ),
    [flowById, runs.data],
  );
  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return (events.data ?? []).filter((event) => {
      const matchesType = type === "all" || event.event_type === type;
      const matchesSearch =
        !term ||
        [
          event.subscriber_email,
          event.message_id,
          event.template_id,
          event.flow_run_id,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      return matchesType && matchesSearch;
    });
  }, [events.data, search, type]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Deliveries / Events"
        description="Timeline of Resend webhook events and messaging-owned delivery state."
      />

      {events.error ? (
        <ErrorState
          error={events.error}
          onRetry={() => void events.refetch()}
        />
      ) : null}

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4" />
            Event Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
            <Select
              value={type}
              onValueChange={(value) =>
                setType(value as (typeof eventTypes)[number])
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eventTypes.map((eventType) => (
                  <SelectItem key={eventType} value={eventType}>
                    {eventType === "all" ? "All events" : eventType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search recipient, message, template, or flow run"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {events.isPending ? (
            <LoadingState label="Loading delivery events" />
          ) : events.error ? null : filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Flow run</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Metadata</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <StatusBadge value={event.event_type} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {event.subscriber_email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.template_id
                        ? (templateById.get(event.template_id) ??
                          event.template_id)
                        : "none"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.flow_run_id
                        ? (runLabelById.get(event.flow_run_id) ??
                          event.flow_run_id)
                        : "none"}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">
                      {event.message_id ?? "none"}
                    </TableCell>
                    <TableCell className="min-w-80">
                      <JsonBlock value={event.metadata ?? {}} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.created_at
                        ? format(new Date(event.created_at), "MMM d, HH:mm:ss")
                        : "unknown"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState message="No delivery events match these filters." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
