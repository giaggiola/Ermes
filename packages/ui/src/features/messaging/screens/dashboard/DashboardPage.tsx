"use client";

import {
  Activity,
  Ban,
  CheckCircle2,
  Download,
  Eye,
  Mail,
  MousePointerClick,
  ShieldAlert,
  UserMinus,
  Users,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../components/ui/table";
import type {
  DeliverabilityAnalytics,
  DeliverabilityCounts,
  EmailEvent,
} from "../../admin-types";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/admin/empty-state";
import { MetricCard } from "../../components/admin/metric-card";
import { PageHeader } from "../../components/admin/page-header";
import { StatusBadge } from "../../components/admin/status-badge";
import { downloadMessagingDesigns } from "../../download-designs";
import {
  useDashboardStats,
  useDeliverabilityAnalytics,
  useEmailEvents,
  useEmailSubscribers,
} from "../../use-admin";

const rangeOptions = [7, 30, 90] as const;
const emptyCounts: DeliverabilityCounts = {
  bounced: 0,
  clicked: 0,
  complained: 0,
  delivered: 0,
  opened: 0,
  sent: 0,
  unsubscribed: 0,
};

export default function DashboardPage() {
  const [rangeDays, setRangeDays] = useState<(typeof rangeOptions)[number]>(30);
  const [isDownloadingDesigns, setIsDownloadingDesigns] = useState(false);
  const analytics = useDeliverabilityAnalytics(rangeDays);
  const stats = useDashboardStats();
  const events = useEmailEvents();
  const subscribers = useEmailSubscribers();

  const totals = analytics.data?.totals;
  const chartData = buildDailyTrend(analytics.data, rangeDays);
  const recentEvents = (events.data ?? []).slice(0, 8);
  const subscriberCount =
    subscribers.data?.length ?? stats.data?.subscribers ?? 0;
  const activeSubscribers = (subscribers.data ?? []).filter(
    (subscriber) => subscriber.subscribed,
  ).length;
  const loadError =
    analytics.error ?? stats.error ?? events.error ?? subscribers.error;

  async function handleDownloadDesigns() {
    setIsDownloadingDesigns(true);
    try {
      const result = await downloadMessagingDesigns();
      toast.success(
        `Downloaded ${result.templateCount} templates and ${result.formCount} forms.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not download the designs.",
      );
    } finally {
      setIsDownloadingDesigns(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Messaging analytics"
        description="Elementary delivery, engagement, complaint, and unsubscribe health. No revenue attribution."
        actions={
          <>
            <Button
              disabled={isDownloadingDesigns}
              onClick={() => void handleDownloadDesigns()}
              variant="outline"
            >
              <Download className="size-4" />
              {isDownloadingDesigns
                ? "Preparing download…"
                : "Download all designs"}
            </Button>
            <div
              aria-label="Analytics date range"
              className="flex items-center rounded-md border p-1"
              role="group"
            >
              {rangeOptions.map((days) => (
                <Button
                  aria-pressed={rangeDays === days}
                  key={days}
                  onClick={() => setRangeDays(days)}
                  size="sm"
                  variant={rangeDays === days ? "secondary" : "ghost"}
                >
                  {days}d
                </Button>
              ))}
            </div>
          </>
        }
      />

      {loadError ? (
        <ErrorState
          error={loadError}
          onRetry={() => {
            void Promise.all([
              analytics.refetch(),
              stats.refetch(),
              events.refetch(),
              subscribers.refetch(),
            ]);
          }}
        />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <MetricCard
          detail="Rate baseline"
          icon={<Mail className="size-4 text-muted-foreground" />}
          label="Sent"
          value={metricValue(analytics.isPending, totals?.sent)}
        />
        <MetricCard
          detail={rateDetail(analytics.isPending, totals?.delivery_rate)}
          icon={<CheckCircle2 className="size-4 text-emerald-600" />}
          label="Delivered"
          value={metricValue(analytics.isPending, totals?.delivered)}
        />
        <MetricCard
          detail={rateDetail(analytics.isPending, totals?.open_rate)}
          icon={<Eye className="size-4 text-blue-600" />}
          label="Opened"
          value={metricValue(analytics.isPending, totals?.opened)}
        />
        <MetricCard
          detail={rateDetail(analytics.isPending, totals?.click_rate)}
          icon={<MousePointerClick className="size-4 text-indigo-600" />}
          label="Clicked"
          value={metricValue(analytics.isPending, totals?.clicked)}
        />
        <MetricCard
          detail={rateDetail(analytics.isPending, totals?.bounce_rate)}
          icon={<Ban className="size-4 text-red-600" />}
          label="Bounced"
          value={metricValue(analytics.isPending, totals?.bounced)}
        />
        <MetricCard
          detail={rateDetail(analytics.isPending, totals?.complaint_rate)}
          icon={<ShieldAlert className="size-4 text-orange-600" />}
          label="Complained"
          value={metricValue(analytics.isPending, totals?.complained)}
        />
        <MetricCard
          detail={rateDetail(analytics.isPending, totals?.unsubscribe_rate)}
          icon={<UserMinus className="size-4 text-muted-foreground" />}
          label="Unsubscribed"
          value={metricValue(analytics.isPending, totals?.unsubscribed)}
        />
      </section>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Daily delivery trend</CardTitle>
          <p className="text-xs text-muted-foreground">
            {analytics.data
              ? `${formatUtcDate(analytics.data.range.from)}–${formatUtcDate(analytics.data.range.to)} · UTC`
              : `Last ${rangeDays} days · UTC`}
            . Counts are unique messages per event type; every rate uses sent as
            its denominator. Opens and clicks are directional because mail
            clients can block or prefetch tracking.
          </p>
        </CardHeader>
        <CardContent>
          {analytics.isPending ? (
            <LoadingState label="Loading delivery trend" />
          ) : totals?.sent ||
            totals?.unsubscribed ||
            totals?.bounced ||
            totals?.complained ? (
            <div className="h-96">
              <ResponsiveContainer height="100%" width="100%">
                <LineChart
                  data={chartData}
                  margin={{ bottom: 4, left: 0, right: 12, top: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="label"
                    interval="preserveStartEnd"
                    minTickGap={24}
                    tickLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip />
                  <Legend />
                  <Line
                    dataKey="sent"
                    dot={false}
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Line
                    dataKey="delivered"
                    dot={false}
                    stroke="var(--chart-4)"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Line
                    dataKey="opened"
                    dot={false}
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Line
                    dataKey="clicked"
                    dot={false}
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Line
                    dataKey="bounced"
                    dot={false}
                    stroke="var(--destructive)"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Line
                    dataKey="complained"
                    dot={false}
                    stroke="#ea580c"
                    strokeDasharray="4 3"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Line
                    dataKey="unsubscribed"
                    dot={false}
                    stroke="#71717a"
                    strokeDasharray="4 3"
                    strokeWidth={2}
                    type="monotone"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              message={`No delivery or unsubscribe activity in the last ${rangeDays} days.`}
            />
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <BreakdownCard
          analytics={analytics.data}
          kind="domain"
          loading={analytics.isPending}
        />
        <BreakdownCard
          analytics={analytics.data}
          kind="provider"
          loading={analytics.isPending}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={<Users className="size-4 text-muted-foreground" />}
          label="Profiles"
          value={subscriberCount}
        />
        <MetricCard
          icon={<Users className="size-4 text-muted-foreground" />}
          label="Active subscribers"
          value={subscribers.isPending ? "…" : activeSubscribers}
        />
        <MetricCard
          icon={<Workflow className="size-4 text-muted-foreground" />}
          label="Flows"
          value={stats.data?.flows ?? "…"}
        />
        <MetricCard
          icon={<Ban className="size-4 text-muted-foreground" />}
          label="Active suppressions"
          value={stats.data?.active_suppressions ?? "…"}
        />
        <MetricCard
          icon={<Activity className="size-4 text-muted-foreground" />}
          label="Recorded events"
          value={stats.data?.email_events ?? "…"}
        />
      </section>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Recent delivery events</CardTitle>
        </CardHeader>
        <CardContent>
          {events.isPending ? (
            <LoadingState label="Loading recent deliveries" />
          ) : recentEvents.length > 0 ? (
            <Table>
              <caption className="sr-only">
                Most recently recorded email delivery events
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <StatusBadge value={event.event_type} />
                    </TableCell>
                    <TableCell className="max-w-64 truncate">
                      {event.subscriber_email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatEventDate(event)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState message="No recent delivery events." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BreakdownCard({
  analytics,
  kind,
  loading,
}: {
  analytics?: DeliverabilityAnalytics;
  kind: "domain" | "provider";
  loading: boolean;
}) {
  const rows =
    kind === "domain"
      ? (analytics?.domains ?? [])
      : (analytics?.providers ?? []);
  const title =
    kind === "domain" ? "Recipient domain health" : "Delivery provider health";

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {kind === "domain"
            ? "Top recipient domains ordered by sent volume."
            : "Unsubscribes are consent actions and are not attributed to a delivery provider."}
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingState label={`Loading ${kind} breakdown`} />
        ) : rows.length > 0 ? (
          <Table>
            <caption className="sr-only">{title}</caption>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {kind === "domain" ? "Domain" : "Provider"}
                </TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Opened</TableHead>
                <TableHead className="text-right">Clicked</TableHead>
                <TableHead className="text-right">Bounced</TableHead>
                <TableHead className="text-right">Complaints</TableHead>
                {kind === "domain" ? (
                  <TableHead className="text-right">Unsubscribed</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const name =
                  kind === "domain"
                    ? "domain" in row
                      ? row.domain
                      : ""
                    : "provider" in row
                      ? row.provider
                      : "";
                return (
                  <TableRow key={name}>
                    <TableCell className="font-medium capitalize">
                      {name}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCount(row.sent)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCountAndRate(row.delivered, row.delivery_rate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCountAndRate(row.opened, row.open_rate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCountAndRate(row.clicked, row.click_rate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCountAndRate(row.bounced, row.bounce_rate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCountAndRate(row.complained, row.complaint_rate)}
                    </TableCell>
                    {kind === "domain" ? (
                      <TableCell className="text-right">
                        {formatCountAndRate(
                          row.unsubscribed,
                          row.unsubscribe_rate,
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <EmptyState message={`No ${kind} activity in this period.`} />
        )}
      </CardContent>
    </Card>
  );
}

function buildDailyTrend(
  analytics: DeliverabilityAnalytics | undefined,
  days: number,
) {
  const byDate = new Map(
    (analytics?.daily ?? []).map((row) => [row.date, row]),
  );
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - index - 1));
    const key = date.toISOString().slice(0, 10);
    return {
      ...(byDate.get(key) ?? emptyCounts),
      date: key,
      label: new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(date),
    };
  });
}

function metricValue(loading: boolean, value: number | undefined) {
  return loading ? "…" : formatCount(value ?? 0);
}

function rateDetail(loading: boolean, rate: number | undefined) {
  return loading ? "Calculating…" : `${formatRate(rate ?? 0)} of sent`;
}

function formatCount(value: number) {
  return value.toLocaleString();
}

function formatRate(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function formatCountAndRate(count: number, rate: number) {
  return `${formatCount(count)} · ${formatRate(rate)}`;
}

function formatUtcDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function formatEventDate(event: EmailEvent) {
  return event.created_at
    ? new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
      }).format(new Date(event.created_at))
    : "unknown";
}
