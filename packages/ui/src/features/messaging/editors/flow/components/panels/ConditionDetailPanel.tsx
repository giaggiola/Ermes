"use client";

import { Plus, X } from "lucide-react";

import { Button } from "../../../../../../components/ui/button";
import { Input } from "../../../../../../components/ui/input";
import { Label } from "../../../../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../../../components/ui/select";

export interface ConditionClause {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "is_set" | "is_not_set";
  value: string;
}

export interface ConditionDetailData {
  field?: string;
  operator?: ConditionClause["operator"];
  value?: string;
  match?: "all" | "any";
  conditions?: ConditionClause[];
}

interface ConditionDetailPanelProps {
  data: ConditionDetailData;
  onChange: (updates: Partial<ConditionDetailData>) => void;
}

const fieldOptions = [
  { value: "customer.email", label: "Customer Email", category: "Customer" },
  { value: "customer.first_name", label: "Customer First Name", category: "Customer" },
  { value: "customer.last_name", label: "Customer Last Name", category: "Customer" },
  { value: "customer.orders_count", label: "Total Orders", category: "Customer" },
  { value: "customer.total_spent", label: "Total Spent", category: "Customer" },
  { value: "customer.days_since_last_order", label: "Days Since Last Order", category: "Customer" },
  { value: "customer.avg_order_value", label: "Avg Order Value", category: "Customer" },
  { value: "order.total", label: "Order Total", category: "Order" },
  { value: "order.items_count", label: "Items in Order", category: "Order" },
  { value: "order.currency_code", label: "Currency", category: "Order" },
  { value: "order.shipping_country", label: "Shipping Country", category: "Order" },
  { value: "cart.total", label: "Cart Total", category: "Cart" },
  { value: "cart.items_count", label: "Items in Cart", category: "Cart" },
  { value: "product.title", label: "Product Title", category: "Product" },
  { value: "product.collection", label: "Product Collection", category: "Product" },
  { value: "custom", label: "Custom Field", category: "Custom" },
];

const operatorOptions = [
  { value: "equals", label: "equals", description: "Exact match" },
  { value: "not_equals", label: "does not equal", description: "Not an exact match" },
  { value: "contains", label: "contains", description: "Includes this text" },
  { value: "greater_than", label: "is greater than", description: "Numeric comparison" },
  { value: "less_than", label: "is less than", description: "Numeric comparison" },
  { value: "is_set", label: "is set", description: "Has any value" },
  { value: "is_not_set", label: "is not set", description: "Has no value" },
] as const;

function normalizeConditions(data: ConditionDetailData): { match: "all" | "any"; conditions: ConditionClause[] } {
  if (Array.isArray(data.conditions) && data.conditions.length > 0) {
    return { match: data.match === "any" ? "any" : "all", conditions: data.conditions };
  }

  return {
    match: data.match === "any" ? "any" : "all",
    conditions: [
      {
        field: data.field || "",
        operator: data.operator || "equals",
        value: data.value || "",
      },
    ],
  };
}

function updatePayload(match: "all" | "any", conditions: ConditionClause[]): Partial<ConditionDetailData> {
  const first = conditions[0] ?? { field: "", operator: "equals" as const, value: "" };
  return {
    conditions,
    field: first.field,
    match,
    operator: first.operator,
    value: first.value,
  };
}

export function ConditionDetailPanel({ data, onChange }: ConditionDetailPanelProps) {
  const group = normalizeConditions(data);

  const groupedFields = fieldOptions.reduce(
    (acc, field) => {
      if (!acc[field.category]) {
        acc[field.category] = [];
      }
      acc[field.category].push(field);
      return acc;
    },
    {} as Record<string, typeof fieldOptions>,
  );

  const updateMatch = (match: "all" | "any") => {
    onChange(updatePayload(match, group.conditions));
  };

  const addCondition = () => {
    onChange(updatePayload(group.match, [...group.conditions, { field: "", operator: "equals", value: "" }]));
  };

  const updateCondition = (index: number, updates: Partial<ConditionClause>) => {
    const conditions = group.conditions.map((condition, i) => (i === index ? { ...condition, ...updates } : condition));
    onChange(updatePayload(group.match, conditions));
  };

  const removeCondition = (index: number) => {
    const conditions = group.conditions.filter((_, i) => i !== index);
    onChange(updatePayload(group.match, conditions.length > 0 ? conditions : [{ field: "", operator: "equals", value: "" }]));
  };

  return (
    <div className="divide-y divide-border">
      {/* Condition Explanation */}
      <div className="space-y-3 p-4">
        <div>
          <Label className="text-sm font-medium">Conditional split</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Split the flow based on conditions. Profiles that match go to &quot;Yes&quot;, others go to &quot;No&quot;.
          </p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm font-medium">Conditions</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Choose whether every clause or any clause can match.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addCondition}>
            <Plus className="size-3" />
            Add
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Match</span>
          <Select value={group.match} onValueChange={(value) => updateMatch(value as "all" | "any")}>
            <SelectTrigger className="h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="any">Any</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {group.conditions.map((condition, index) => {
          const selectedField = fieldOptions.find((field) => field.value === condition.field);
          const selectedOperator = operatorOptions.find((operator) => operator.value === condition.operator);
          const requiresValue = !["is_set", "is_not_set"].includes(condition.operator);

          return (
            <div key={index} className="space-y-2 rounded-lg border border-border bg-muted p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{index === 0 ? "If" : group.match.toUpperCase()}</span>
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeCondition(index)}>
                  <X className="size-3" />
                </Button>
              </div>

              <Select value={condition.field || ""} onValueChange={(value) => updateCondition(index, { field: value })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select field..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(groupedFields).map(([category, fields]) => (
                    <div key={category}>
                      <div className="bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground">{category}</div>
                      {fields.map((field) => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>

              {condition.field === "custom" ? (
                <div>
                  <Label className="text-xs">Custom field name</Label>
                  <Input onChange={(e) => updateCondition(index, { field: e.target.value })} placeholder="e.g., context.custom_field" className="mt-1" />
                </div>
              ) : null}

              <Select
                value={condition.operator || "equals"}
                onValueChange={(value) => updateCondition(index, { operator: value as ConditionClause["operator"] })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operatorOptions.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedOperator ? <p className="text-xs text-muted-foreground">{selectedOperator.description}</p> : null}

              {requiresValue ? (
                <Input value={condition.value || ""} onChange={(e) => updateCondition(index, { value: e.target.value })} placeholder="Enter value..." />
              ) : null}

              <div className="rounded-lg bg-background p-3">
                <p className="text-xs text-muted-foreground">Condition preview:</p>
                <p className="mt-1 font-mono text-sm">
                  {selectedField?.label || condition.field || "[field]"} <span className="text-primary">{selectedOperator?.label || condition.operator}</span>
                  {requiresValue ? <> &quot;{condition.value || "[value]"}&quot;</> : null}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center dark:border-green-900 dark:bg-green-950/40">
            <p className="text-xs font-medium text-green-700 dark:text-green-300">Yes</p>
            <p className="mt-1 text-xs text-muted-foreground">Condition group is true</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center dark:border-red-900 dark:bg-red-950/40">
            <p className="text-xs font-medium text-red-700 dark:text-red-300">No</p>
            <p className="mt-1 text-xs text-muted-foreground">Condition group is false</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConditionDetailPanel;
