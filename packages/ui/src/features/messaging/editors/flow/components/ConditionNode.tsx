"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Split } from "lucide-react";

import { Input } from "../../../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../../components/ui/select";

export interface ConditionClause {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
  value: string;
}

export interface ConditionNodeData {
  field: string;
  operator: ConditionClause["operator"];
  value: string;
  match?: "all" | "any";
  conditions?: ConditionClause[];
  onDataChange?: (data: Partial<ConditionNodeData>) => void;
}

const fieldOptions = [
  { value: "order.total", label: "Order Total" },
  { value: "order.items_count", label: "Items Count" },
  { value: "customer.orders_count", label: "Customer Orders" },
  { value: "customer.email", label: "Customer Email" },
  { value: "product.title", label: "Product Title" },
];

const operatorOptions = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
] as const;

function normalizedConditions(data: ConditionNodeData): ConditionClause[] {
  if (Array.isArray(data.conditions) && data.conditions.length > 0) return data.conditions;
  return [{ field: data.field || "", operator: data.operator || "equals", value: data.value || "" }];
}

export function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ConditionNodeData;
  const conditions = normalizedConditions(nodeData);
  const first = conditions[0] ?? { field: "", operator: "equals", value: "" };
  const match = nodeData.match === "any" ? "any" : "all";

  const updateFirst = (updates: Partial<ConditionClause>) => {
    const nextFirst = { ...first, ...updates };
    nodeData.onDataChange?.({
      conditions: [nextFirst, ...conditions.slice(1)],
      field: nextFirst.field,
      match,
      operator: nextFirst.operator,
      value: nextFirst.value,
    });
  };

  return (
    <div className={`relative min-w-[280px] rounded-lg border-2 bg-card shadow-sm ${selected ? "border-primary" : "border-border"}`}>
      <Handle type="target" position={Position.Top} className="!size-3 !border-2 !border-background !bg-green-600" />

      <div className="flex items-center gap-2 rounded-t-md border-b border-border bg-muted px-3 py-2">
        <Split className="size-4 text-green-600" />
        <span className="text-sm font-medium text-foreground">Condition</span>
      </div>

      <div className="space-y-2 p-3">
        {conditions.length > 1 ? (
          <Select value={match} onValueChange={(value) => nodeData.onDataChange?.({ match: value as "all" | "any" })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Match All</SelectItem>
              <SelectItem value="any">Match Any</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        <Select value={first.field || ""} onValueChange={(value) => updateFirst({ field: value })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select field..." />
          </SelectTrigger>
          <SelectContent>
            {fieldOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={first.operator || "equals"} onValueChange={(value) => updateFirst({ operator: value as ConditionClause["operator"] })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operatorOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input value={first.value || ""} onChange={(e) => updateFirst({ value: e.target.value })} placeholder="Value..." />

        {conditions.length > 1 ? <p className="text-xs text-muted-foreground">{conditions.length} clauses</p> : null}
      </div>

      {/* True path (right) */}
      <Handle type="source" position={Position.Right} id="true" className="!size-3 !border-2 !border-background !bg-green-600" style={{ top: "70%" }} />

      {/* False path (bottom) */}
      <Handle type="source" position={Position.Bottom} id="false" className="!size-3 !border-2 !border-background !bg-red-600" />

      <div className="absolute right-[-30px] top-[65%] text-xs text-green-700">Yes</div>
      <div className="absolute bottom-[-18px] left-[45%] text-xs text-red-700">No</div>
    </div>
  );
}

export default ConditionNode;
