"use client";

import { Plus, X } from "lucide-react";
import type {
  TriggerCondition,
  TriggerConditionInput,
} from "../../../../contracts/flow-types";
import { TRIGGER_CATALOG, triggerByValue } from "../../../../trigger-catalog";

import { Button } from "../../../../../../components/ui/button";
import { Input } from "../../../../../../components/ui/input";
import { Label } from "../../../../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../../../components/ui/select";

export interface TriggerDetailData {
  trigger_event: string;
  // Re-entry criteria
  reentry_mode?: "never" | "after_duration" | "always";
  reentry_duration?: number;
  reentry_unit?: "hours" | "days";
  // Trigger delay (for time-based triggers like abandoned cart)
  trigger_delay_hours?: number;
  // Trigger filters (segmentation conditions)
  trigger_conditions?: TriggerConditionInput | null;
}

interface TriggerDetailPanelProps {
  data: TriggerDetailData;
  onChange: (updates: Partial<TriggerDetailData>) => void;
}

const filterFieldOptions = [
  {
    value: "customer.orders_count",
    label: "Total Orders",
    category: "Customer",
  },
  { value: "customer.total_spent", label: "Total Spent", category: "Customer" },
  {
    value: "customer.days_since_last_order",
    label: "Days Since Last Order",
    category: "Customer",
  },
  {
    value: "customer.avg_order_value",
    label: "Avg Order Value",
    category: "Customer",
  },
  {
    value: "subscriber.subscription_source",
    label: "Subscription Source",
    category: "Subscriber",
  },
  { value: "subscriber.tags", label: "Has Tag", category: "Subscriber" },
];

const filterOperatorOptions = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "greater_than", label: "is greater than" },
  { value: "less_than", label: "is less than" },
  { value: "contains", label: "contains" },
  { value: "has_tag", label: "has tag" },
  { value: "not_has_tag", label: "does not have tag" },
];

function conditionGroup(input: TriggerConditionInput | null | undefined): {
  match: "all" | "any";
  conditions: TriggerCondition[];
} {
  if (Array.isArray(input)) {
    return { match: "all", conditions: input };
  }

  if (input && typeof input === "object" && Array.isArray(input.conditions)) {
    return {
      match: input.match === "any" ? "any" : "all",
      conditions: input.conditions,
    };
  }

  return { match: "all", conditions: [] };
}

function nextTriggerConditions(
  match: "all" | "any",
  conditions: TriggerCondition[],
): TriggerConditionInput {
  return conditions.length > 0 ? { match, conditions } : [];
}

export function TriggerDetailPanel({
  data,
  onChange,
}: TriggerDetailPanelProps) {
  const selectedTrigger = triggerByValue(data.trigger_event);
  const isTimedTrigger = selectedTrigger?.timed ?? false;
  const group = conditionGroup(data.trigger_conditions);
  const conditions = group.conditions;

  const addCondition = () => {
    onChange({
      trigger_conditions: nextTriggerConditions(group.match, [
        ...conditions,
        { field: "customer.orders_count", operator: "greater_than", value: "" },
      ]),
    });
  };

  const updateMatch = (match: "all" | "any") => {
    onChange({ trigger_conditions: nextTriggerConditions(match, conditions) });
  };

  const updateCondition = (
    index: number,
    updates: Partial<TriggerCondition>,
  ) => {
    const updated = conditions.map((condition, i) =>
      i === index ? { ...condition, ...updates } : condition,
    );
    onChange({
      trigger_conditions: nextTriggerConditions(group.match, updated),
    });
  };

  const removeCondition = (index: number) => {
    onChange({
      trigger_conditions: nextTriggerConditions(
        group.match,
        conditions.filter((_, i) => i !== index),
      ),
    });
  };

  // Group filter fields by category
  const groupedFilterFields = filterFieldOptions.reduce(
    (acc, field) => {
      if (!acc[field.category]) {
        acc[field.category] = [];
      }
      acc[field.category].push(field);
      return acc;
    },
    {} as Record<string, typeof filterFieldOptions>,
  );

  return (
    <div className="divide-y divide-border">
      {/* Trigger Selection */}
      <div className="space-y-3 p-4">
        <div>
          <Label className="text-sm font-medium">Trigger</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What event starts this flow?
          </p>
        </div>

        <Select
          value={data.trigger_event}
          onValueChange={(value) => onChange({ trigger_event: value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select trigger..." />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_CATALOG.map((trigger) => (
              <SelectItem key={trigger.value} value={trigger.value}>
                {trigger.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedTrigger ? (
          <p className="text-xs text-muted-foreground">
            {selectedTrigger.description}
          </p>
        ) : null}
      </div>

      {/* Trigger Delay (for timed triggers like abandoned cart) */}
      {isTimedTrigger ? (
        <div className="space-y-3 p-4">
          <div>
            <Label className="text-sm font-medium">Trigger Timing</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add a delay after Messaging receives the event.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm">Trigger after</span>
            <Input
              type="number"
              value={data.trigger_delay_hours ?? 1}
              onChange={(e) =>
                onChange({
                  trigger_delay_hours: Math.max(
                    0,
                    parseInt(e.target.value) || 0,
                  ),
                })
              }
              className="w-20"
              min={0}
            />
            <span className="text-sm">hours</span>
          </div>

          <p className="text-xs text-muted-foreground">
            Shopify recovery waits for one hour of cart or checkout inactivity.
            This adds an extra delay; use 0 to start when the recovery event
            arrives.
          </p>
        </div>
      ) : null}

      {/* Re-entry Criteria */}
      <div className="space-y-3 p-4">
        <div>
          <Label className="text-sm font-medium">Re-entry criteria</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Can someone re-enter this flow after completing it?
          </p>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="reentry_mode"
              checked={data.reentry_mode === "always"}
              onChange={() => onChange({ reentry_mode: "always" })}
            />
            Every unique event
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="reentry_mode"
              checked={(data.reentry_mode || "never") === "never"}
              onChange={() => onChange({ reentry_mode: "never" })}
            />
            No re-entry (once per person)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="reentry_mode"
              checked={data.reentry_mode === "after_duration"}
              onChange={() => onChange({ reentry_mode: "after_duration" })}
            />
            Allow re-entry after a time period
          </label>
        </div>

        {data.reentry_mode === "always" ? (
          <p className="pl-6 text-xs text-muted-foreground">
            Use for order- and cart-based flows. Duplicate source event IDs are
            still ignored.
          </p>
        ) : null}

        {data.reentry_mode === "after_duration" ? (
          <div className="mt-2 flex items-center gap-2 pl-6">
            <span className="text-sm">Re-enter after</span>
            <Input
              type="number"
              value={data.reentry_duration ?? 7}
              onChange={(e) =>
                onChange({ reentry_duration: parseInt(e.target.value) || 7 })
              }
              className="w-20"
              min={1}
            />
            <Select
              value={data.reentry_unit || "days"}
              onValueChange={(value) =>
                onChange({ reentry_unit: value as "hours" | "days" })
              }
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {/* Trigger Filters */}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm font-medium">Trigger filters</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add conditions to filter who enters this flow
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={addCondition}>
            <Plus className="size-3" />
            Add
          </Button>
        </div>

        {conditions.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Match</span>
            <Select
              value={group.match}
              onValueChange={(value) => updateMatch(value as "all" | "any")}
            >
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="any">Any</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            No filters. All matching subscribers will enter this flow.
          </p>
        )}

        {conditions.map((condition, index) => (
          <div
            key={index}
            className="space-y-2 rounded-lg border border-border bg-muted p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {index === 0 ? "If" : group.match.toUpperCase()}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => removeCondition(index)}
              >
                <X className="size-3" />
              </Button>
            </div>

            {/* Field */}
            <Select
              value={condition.field}
              onValueChange={(value) =>
                updateCondition(index, { field: value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select field..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(groupedFilterFields).map(
                  ([category, fields]) => (
                    <div key={category}>
                      <div className="bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        {category}
                      </div>
                      {fields.map((field) => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </div>
                  ),
                )}
              </SelectContent>
            </Select>

            {/* Operator */}
            <Select
              value={condition.operator}
              onValueChange={(value) =>
                updateCondition(index, {
                  operator: value as TriggerCondition["operator"],
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filterOperatorOptions.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Value */}
            <Input
              value={
                Array.isArray(condition.value)
                  ? condition.value.join(", ")
                  : String(condition.value ?? "")
              }
              onChange={(e) =>
                updateCondition(index, { value: e.target.value })
              }
              placeholder="Enter value..."
            />
          </div>
        ))}

        {conditions.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {group.match === "any"
              ? "Any condition can match (OR logic)."
              : "All conditions must match (AND logic)."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default TriggerDetailPanel;
