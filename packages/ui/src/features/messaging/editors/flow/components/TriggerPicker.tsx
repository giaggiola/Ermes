"use client";

import { useMemo, useState } from "react";
import { Activity, ArrowRight, Clock, Mail, Package, Search, Share2, ShoppingCart, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  recommendedTriggers,
  TRIGGER_CATALOG,
  TRIGGER_SOURCE_LABELS,
  triggersBySource,
  type TriggerDefinition,
  type TriggerSource,
} from "../../../trigger-catalog";

import { Badge } from "../../../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../../components/ui/card";
import { Input } from "../../../../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../../components/ui/tabs";
import { useTriggerMetrics } from "../../../use-admin";

interface TriggerPickerProps {
  onSelect: (trigger: TriggerDefinition) => void;
}

const iconBySource: Record<TriggerSource, LucideIcon> = {
  customer: UserRound,
  newsletter: Mail,
  order: ShoppingCart,
  product: Package,
  referral: Share2,
};

const recommendedGroups: Array<{ source: TriggerSource; title: string }> = [
  { source: "order", title: "Your store" },
  { source: "newsletter", title: "Your subscribers" },
  { source: "product", title: "Most requested" },
  { source: "customer", title: "Customer lifecycle" },
];

function TriggerCard({ count, trigger, onSelect }: { count?: number; trigger: TriggerDefinition; onSelect: () => void }) {
  const Icon = trigger.timed ? Clock : iconBySource[trigger.source];

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group grid min-h-32 gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-md bg-muted text-primary">
          <Icon className="size-4" />
        </span>
        <span className="flex items-center gap-2">
          {typeof count === "number" && count > 0 ? <Badge variant="secondary">{count}</Badge> : null}
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </span>
      </div>
      <span className="grid gap-1">
        <span className="text-sm font-semibold text-foreground">{trigger.label}</span>
        <span className="text-xs leading-5 text-muted-foreground">{trigger.description}</span>
      </span>
    </button>
  );
}

export function TriggerPicker({ onSelect }: TriggerPickerProps) {
  const [search, setSearch] = useState("");
  const metrics = useTriggerMetrics();

  const metricCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const metric of metrics.data ?? []) {
      map.set(metric.event_type, metric.count);
    }
    return map;
  }, [metrics.data]);

  const groupedBySource = useMemo(() => {
    const grouped = triggersBySource();
    return Object.fromEntries(
      Object.entries(grouped).map(([source, triggers]) => [
        source,
        [...triggers].sort((a, b) => (metricCounts.get(b.value) ?? 0) - (metricCounts.get(a.value) ?? 0)),
      ]),
    ) as Record<TriggerSource, TriggerDefinition[]>;
  }, [metricCounts]);

  const searchedTriggers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return TRIGGER_CATALOG;
    return TRIGGER_CATALOG.filter((trigger) =>
      [trigger.label, trigger.value, trigger.description].some((value) => value.toLowerCase().includes(query)),
    );
  }, [search]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background px-6 py-6">
      <div className="mx-auto grid max-w-6xl gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-normal">Select a trigger</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">Choose the event that starts this flow.</p>
        </div>

        <Tabs defaultValue="recommended" className="gap-4">
          <TabsList>
            <TabsTrigger value="recommended">Recommended</TabsTrigger>
            <TabsTrigger value="metrics">Your metrics</TabsTrigger>
            <TabsTrigger value="all">All triggers</TabsTrigger>
          </TabsList>

          <TabsContent value="recommended" className="grid gap-4">
            {recommendedGroups.map((group) => {
              const triggers = recommendedTriggers().filter((trigger) => trigger.source === group.source);
              if (triggers.length === 0) return null;
              return (
                <section key={group.source} className="grid gap-3">
                  <h3 className="text-sm font-medium text-muted-foreground">{group.title}</h3>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {triggers.map((trigger) => (
                      <TriggerCard key={trigger.value} trigger={trigger} count={metricCounts.get(trigger.value)} onSelect={() => onSelect(trigger)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </TabsContent>

          <TabsContent value="metrics" className="grid gap-4">
            {Object.entries(groupedBySource).map(([source, triggers]) => (
              <Card key={source} className="rounded-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="size-4" />
                    {TRIGGER_SOURCE_LABELS[source as TriggerSource]}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {triggers.map((trigger) => (
                      <TriggerCard key={trigger.value} trigger={trigger} count={metricCounts.get(trigger.value)} onSelect={() => onSelect(trigger)} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="all" className="grid gap-4">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search triggers" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {searchedTriggers.map((trigger) => (
                <TriggerCard key={trigger.value} trigger={trigger} count={metricCounts.get(trigger.value)} onSelect={() => onSelect(trigger)} />
              ))}
            </div>
            {searchedTriggers.length === 0 ? <p className="text-sm text-muted-foreground">No triggers match that search.</p> : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default TriggerPicker;
