"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  ImageIcon,
  KeyRound,
  MailCheck,
  PlugZap,
  Settings,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "../../components/admin/empty-state";
import { JsonBlock } from "../../components/admin/json-block";
import { MetricCard } from "../../components/admin/metric-card";
import { PageHeader } from "../../components/admin/page-header";
import { StatusBadge } from "../../components/admin/status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { useErmesHost } from "../../../../host";
import { useSettings, useUpdateSettings } from "../../use-admin";

export default function RuntimePage() {
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const data = settings.data;
  const lastEvent = data?.commerce_handshake.last_event;
  const runtime = data?.runtime;
  const runtimeDraft = {
    email_from: runtime?.email_from ?? "",
    email_logo_url: runtime?.email_logo_url ?? "",
    email_sender_name: runtime?.email_sender_name ?? "",
  };
  const [draftOverride, setDraftOverride] = useState<
    typeof runtimeDraft | null
  >(null);
  const host = useErmesHost();
  const [logoPending, setLogoPending] = useState(false);
  const draft = draftOverride ?? runtimeDraft;

  const save = async () => {
    try {
      await updateSettings.mutateAsync(draft);
      setDraftOverride(null);
      toast.success("Messaging settings saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save settings.",
      );
    }
  };

  const chooseLogo = async () => {
    setLogoPending(true);
    try {
      const url = await host.pickImage?.();
      if (url)
        setDraftOverride((current) => ({
          ...(current ?? runtimeDraft),
          email_logo_url: url,
        }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not select an image",
      );
    } finally {
      setLogoPending(false);
    }
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Runtime"
        description="Operator readiness for delivery, Resend, and commerce events."
      />

      {settings.error ? (
        <ErrorState
          error={settings.error}
          onRetry={() => void settings.refetch()}
        />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<MailCheck className="size-4 text-muted-foreground" />}
          label="Resend API"
          value={
            <StatusBadge value={data?.env.resend_api_key_configured ?? false} />
          }
        />
        <MetricCard
          icon={<KeyRound className="size-4 text-muted-foreground" />}
          label="Webhook Secret"
          value={
            <StatusBadge
              value={data?.env.resend_webhook_secret_configured ?? false}
            />
          }
        />
        <MetricCard
          icon={<PlugZap className="size-4 text-muted-foreground" />}
          label="Delivery"
          value="Published items"
        />
        <MetricCard
          icon={<Settings className="size-4 text-muted-foreground" />}
          label="Mode"
          value={data?.env.commerce_mode ?? "unset"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Email Identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <p className="text-xs text-muted-foreground">
              Active flows and scheduled campaigns deliver automatically. Pause
              the flow or cancel the campaign to stop delivery.
            </p>
            <RuntimeField
              label="From address"
              onChange={(value) =>
                setDraftOverride((current) => ({
                  ...(current ?? runtimeDraft),
                  email_from: value,
                }))
              }
              value={draft.email_from}
            />
            <RuntimeField
              label="Sender name"
              onChange={(value) =>
                setDraftOverride((current) => ({
                  ...(current ?? runtimeDraft),
                  email_sender_name: value,
                }))
              }
              value={draft.email_sender_name}
            />
            <div className="grid gap-2">
              <div>
                <Label htmlFor="messaging-email-logo-url">Email logo</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use a public HTTPS PNG. It is displayed at 142 px wide with
                  the sender name as its fallback text.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="messaging-email-logo-url"
                  onChange={(event) =>
                    setDraftOverride((current) => ({
                      ...(current ?? runtimeDraft),
                      email_logo_url: event.target.value,
                    }))
                  }
                  placeholder="https://cdn.example.com/logo.png"
                  type="url"
                  value={draft.email_logo_url}
                />
                <Button
                  disabled={logoPending || !host.pickImage}
                  onClick={() => void chooseLogo()}
                  type="button"
                  variant="outline"
                >
                  <ImageIcon className="size-4" />
                  {logoPending ? "Uploading…" : "Choose asset"}
                </Button>
                {draft.email_logo_url ? (
                  <Button
                    onClick={() =>
                      setDraftOverride((current) => ({
                        ...(current ?? runtimeDraft),
                        email_logo_url: "",
                      }))
                    }
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              {draft.email_logo_url ? (
                <div className="flex min-h-24 items-center justify-center rounded-md border bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={`${draft.email_sender_name || "Email"} logo preview`}
                    className="h-auto max-h-16 w-auto max-w-full"
                    src={draft.email_logo_url}
                  />
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Emails will use the sender name when no logo is configured.
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Source: {runtime?.source ?? "loading"}
              </p>
              <Button
                disabled={updateSettings.isPending}
                onClick={() => void save()}
                size="sm"
              >
                {updateSettings.isPending ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Commerce Integration</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <SettingRow
              label="Mode"
              value={data?.env.commerce_mode ?? "unset"}
            />
            <SettingRow
              label="Incoming events"
              value={
                data?.env.commerce_event_secret_configured
                  ? "configured"
                  : "not configured"
              }
            />
            <SettingRow
              label="Commerce commands"
              value={
                data?.env.commerce_command_configured
                  ? "configured"
                  : "not configured"
              }
            />
            <SettingRow label="App URL" value={data?.env.app_url ?? "unset"} />
            <SettingRow
              label="Last event"
              value={formatRecordDate(lastEvent?.received_at)}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Last Commerce Event</CardTitle>
          </CardHeader>
          <CardContent>
            {lastEvent ? (
              <JsonBlock value={lastEvent} />
            ) : (
              <EmptyState message="No commerce events recorded." />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function RuntimeField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = `messaging-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-96 truncate font-medium">{value}</span>
    </div>
  );
}

function formatRecordDate(value: unknown) {
  return typeof value === "string" || value instanceof Date
    ? format(new Date(value), "MMM d, yyyy HH:mm:ss")
    : "none";
}
