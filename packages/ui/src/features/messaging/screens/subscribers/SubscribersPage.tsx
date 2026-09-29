"use client";

import { format } from "date-fns";
import {
  Activity,
  Download,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/admin/empty-state";
import { PageHeader } from "../../components/admin/page-header";
import { StatusBadge } from "../../components/admin/status-badge";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Switch } from "../../../../components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../components/ui/table";
import type { EmailSubscriber } from "../../admin-types";
import { adminFetch } from "../../admin-api";
import { useMessagingCompatibility } from "../../contract";
import {
  useAdminCreate,
  useAdminDelete,
  useAdminPatch,
  useEmailSubscribers,
} from "../../use-admin";

const PAGE_SIZE = 25;

interface SubscriberForm {
  email: string;
  first_name: string;
  last_name: string;
  subscription_source: string;
  subscribed: boolean;
}

const emptyForm: SubscriberForm = {
  email: "",
  first_name: "",
  last_name: "",
  subscription_source: "",
  subscribed: true,
};

// date-fns `format` throws on an invalid Date, which would crash the whole page
// render. Guard so a single malformed timestamp degrades to "—" instead.
function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "MMM d, yyyy");
}

// Header-aware CSV parser: first row is the header, supports quoted values.
function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].match(/("([^"]*(?:""[^"]*)*)"|[^,]*)/g) || [];
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      let value = values[index]?.trim() || "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/""/g, '"');
      }
      row[header] = value;
    });
    if (row.email) rows.push(row);
  }

  return rows;
}

export default function SubscribersPage() {
  const compatibility = useMessagingCompatibility();
  const subscribers = useEmailSubscribers();
  const createSubscriber = useAdminCreate<Record<string, unknown>>(
    "email-subscribers",
    ["email-subscribers", "dashboard"],
  );
  const updateSubscriber = useAdminPatch<
    Record<string, unknown> & { id: string }
  >("email-subscribers", ["email-subscribers", "dashboard"]);
  const deleteSubscriber = useAdminDelete("email-subscribers", [
    "email-subscribers",
    "dashboard",
  ]);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmailSubscriber | null>(null);
  const [form, setForm] = useState<SubscriberForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [profile, setProfile] = useState<EmailSubscriber | null>(null);
  const timeline = useQuery({
    enabled: Boolean(profile),
    queryFn: () =>
      adminFetch<{
        subscriber: EmailSubscriber;
        timeline: Array<{
          at?: string | null;
          data: Record<string, unknown>;
          kind: "consent" | "email_event" | "flow_run" | "suppression";
        }>;
      }>(`v2/profiles/${profile?.id}/timeline`),
    queryKey: ["messaging", "profiles", profile?.id, "timeline"],
  });

  const all = useMemo(() => subscribers.data ?? [], [subscribers.data]);

  const stats = useMemo(() => {
    let subscribed = 0;
    for (const subscriber of all) {
      if (subscriber.subscribed) subscribed += 1;
    }
    return {
      total: all.length,
      subscribed,
      unsubscribed: all.length - subscribed,
    };
  }, [all]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return all;
    return all.filter((subscriber) =>
      [
        subscriber.email,
        subscriber.first_name,
        subscriber.last_name,
        subscriber.subscription_source,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [all, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(subscriber: EmailSubscriber) {
    setEditing(subscriber);
    setForm({
      email: subscriber.email,
      first_name: subscriber.first_name ?? "",
      last_name: subscriber.last_name ?? "",
      subscription_source: subscriber.subscription_source ?? "",
      subscribed: subscriber.subscribed,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function save() {
    if (!compatibility.canEdit) return;
    const email = form.email.trim();
    if (!email || !email.includes("@")) {
      setFormError("A valid email is required");
      return;
    }

    const payload = {
      email,
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      subscription_source: form.subscription_source.trim() || null,
      subscribed: form.subscribed,
    };

    try {
      if (editing) {
        await updateSubscriber.mutateAsync({
          ...payload,
          id: editing.id,
          unsubscribed_at: form.subscribed
            ? null
            : (editing.unsubscribed_at ?? new Date().toISOString()),
        });
        toast.success("Subscriber updated");
      } else {
        await createSubscriber.mutateAsync({
          ...payload,
          subscribed_at: form.subscribed ? new Date().toISOString() : null,
        });
        toast.success("Subscriber added");
      }
      setModalOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to save subscriber",
      );
    }
  }

  async function remove(subscriber: EmailSubscriber) {
    if (!compatibility.canEdit) return;
    if (!window.confirm(`Delete ${subscriber.email}? This cannot be undone.`))
      return;
    try {
      await deleteSubscriber.mutateAsync(subscriber.id);
      toast.success("Subscriber deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete subscriber",
      );
    }
  }

  async function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    if (!compatibility.canEdit) return;
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length === 0) {
        toast.error("No valid rows found. The CSV needs an 'email' column.");
        return;
      }
      if (
        !window.confirm(
          `Import ${rows.length} profile${rows.length === 1 ? "" : "s"} and mark them subscribed?`,
        )
      ) {
        return;
      }

      const mapped = rows.map((row) => ({
        email: (row.email || row.e_mail || row["e-mail"] || "").trim(),
        first_name:
          row.first_name ||
          row.firstname ||
          row["first name"] ||
          row.name?.split(" ")[0] ||
          null,
        last_name:
          row.last_name ||
          row.lastname ||
          row["last name"] ||
          row.name?.split(" ").slice(1).join(" ") ||
          null,
        subscription_source:
          row.source || row.subscription_source || "admin_import",
        subscribed: true,
        subscribed_at: new Date().toISOString(),
      }));

      const results = await Promise.allSettled(
        mapped
          .filter((row) => row.email)
          .map((row) => createSubscriber.mutateAsync(row)),
      );
      const imported = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const failed = results.length - imported;
      toast.success(
        `Imported ${imported}${failed ? `, ${failed} failed (likely duplicates)` : ""}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to import CSV",
      );
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function exportCsv() {
    const headers = [
      "email",
      "first_name",
      "last_name",
      "subscribed",
      "subscription_source",
      "subscribed_at",
    ];
    const csv = [
      headers.join(","),
      ...all.map((s) =>
        [
          `"${s.email}"`,
          `"${s.first_name || ""}"`,
          `"${s.last_name || ""}"`,
          s.subscribed ? "true" : "false",
          `"${s.subscription_source || ""}"`,
          s.subscribed_at || "",
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Profiles"
        description="Search customer profiles, inspect consent and messaging activity, and manage audience data."
        actions={
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={importCsv}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={!compatibility.canEdit || importing}
            >
              <Upload className="size-4" />
              {importing ? "Importing…" : "Import CSV"}
            </Button>
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={all.length === 0}
            >
              <Download className="size-4" />
              Export CSV
            </Button>
            <Button disabled={!compatibility.canEdit} onClick={openAdd}>
              <Plus className="size-4" />
              Add profile
            </Button>
          </div>
        }
      />

      {subscribers.error ? (
        <ErrorState
          error={subscribers.error}
          onRetry={() => void subscribers.refetch()}
        />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-emerald-600">
              {stats.subscribed}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unsubscribed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-muted-foreground">
              {stats.unsubscribed}
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" />
            Profiles
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Input
            placeholder="Search by email, name, or source"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />

          {subscribers.isPending ? (
            <LoadingState label="Loading profiles" />
          ) : subscribers.error ? null : pageRows.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Subscribed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((subscriber) => {
                    const name = [subscriber.first_name, subscriber.last_name]
                      .filter(Boolean)
                      .join(" ");
                    const rawTags = subscriber.properties?.tags;
                    const tags = Array.isArray(rawTags)
                      ? (rawTags as string[])
                      : [];
                    return (
                      <TableRow key={subscriber.id}>
                        <TableCell className="font-medium">
                          {subscriber.email}
                        </TableCell>
                        <TableCell>{name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {subscriber.subscription_source ?? "—"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            value={
                              subscriber.subscribed ? "active" : "unsubscribed"
                            }
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {tags.length ? tags.join(", ") : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(subscriber.subscribed_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              title="Activity"
                              onClick={() => setProfile(subscriber)}
                            >
                              <Activity className="size-4" />
                            </Button>
                            <Button
                              aria-label={`Edit ${subscriber.email}`}
                              disabled={!compatibility.canEdit}
                              size="icon-sm"
                              variant="ghost"
                              title="Edit"
                              onClick={() => openEdit(subscriber)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              aria-label={`Delete ${subscriber.email}`}
                              disabled={!compatibility.canEdit}
                              size="icon-sm"
                              variant="ghost"
                              title="Delete"
                              onClick={() => remove(subscriber)}
                            >
                              <Trash2 className="size-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {filtered.length} subscriber{filtered.length === 1 ? "" : "s"}
                  {search ? " (filtered)" : ""}
                </span>
                <div className="flex items-center gap-2">
                  <span>
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage <= 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              message={
                search
                  ? "No subscribers match this search."
                  : "No subscribers yet."
              }
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(profile)}
        onOpenChange={(open) => {
          if (!open) setProfile(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{profile?.email ?? "Profile activity"}</DialogTitle>
            <DialogDescription>
              Consent changes, deliveries, flow entries, and suppressions in
              chronological order.
            </DialogDescription>
          </DialogHeader>
          {timeline.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading timeline…
            </p>
          ) : timeline.error ? (
            <ErrorState message={timeline.error.message} />
          ) : (
            <div className="grid gap-3">
              {(timeline.data?.timeline ?? []).length ? (
                (timeline.data?.timeline ?? []).map((item, index) => (
                  <div
                    className="grid gap-1 rounded-md border p-3"
                    key={`${item.kind}-${item.at}-${index}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge value={item.kind} />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(item.at)}
                      </span>
                    </div>
                    <p className="text-sm">
                      {timelineLabel(item.kind, item.data)}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState message="No activity has been recorded for this profile." />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit subscriber" : "Add subscriber"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update this contact's details and consent state."
                : "Manually add a contact to the subscriber list."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            {formError ? (
              <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {formError}
              </p>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="sub-email">Email *</Label>
              <Input
                id="sub-email"
                type="email"
                placeholder="subscriber@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="sub-first">First name</Label>
                <Input
                  id="sub-first"
                  placeholder="Jane"
                  value={form.first_name}
                  onChange={(e) =>
                    setForm({ ...form, first_name: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sub-last">Last name</Label>
                <Input
                  id="sub-last"
                  placeholder="Doe"
                  value={form.last_name}
                  onChange={(e) =>
                    setForm({ ...form, last_name: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sub-source">Source</Label>
              <Input
                id="sub-source"
                placeholder="e.g. popup, checkout, footer, manual"
                value={form.subscription_source}
                onChange={(e) =>
                  setForm({ ...form, subscription_source: e.target.value })
                }
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="sub-consent"
                checked={form.subscribed}
                onCheckedChange={(checked) =>
                  setForm({ ...form, subscribed: checked })
                }
              />
              <Label htmlFor="sub-consent" className="cursor-pointer">
                {form.subscribed ? "Subscribed" : "Unsubscribed"}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={
                !compatibility.canEdit ||
                createSubscriber.isPending ||
                updateSubscriber.isPending
              }
            >
              {editing ? "Save changes" : "Add profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function timelineLabel(
  kind: "consent" | "email_event" | "flow_run" | "suppression",
  data: Record<string, unknown>,
) {
  if (kind === "consent") {
    return `${String(data.action ?? "Consent changed")} · ${String(data.source ?? "unknown source")}`;
  }
  if (kind === "email_event") {
    return `Email ${String(data.event_type ?? "event")} · ${String(data.template_id ?? "unknown template")}`;
  }
  if (kind === "flow_run") {
    return `Flow ${String(data.flow_id ?? "unknown")} · ${String(data.status ?? "unknown status")}`;
  }
  return `${String(data.reason ?? "Suppressed")} · ${String(data.source ?? "unknown source")}`;
}
