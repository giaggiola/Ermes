"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Tag } from "lucide-react";

export interface DiscountNodeData {
  discount_type: "percentage" | "fixed";
  discount_value: number;
  code_prefix: string;
  currency_code?: string;
  usage_limit: number;
  expires_in_days?: number;
  min_purchase?: number;
  onDataChange?: (data: Partial<DiscountNodeData>) => void;
}

export function DiscountNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as DiscountNodeData;

  const valueLabel =
    nodeData.discount_type === "percentage"
      ? `${nodeData.discount_value || 0}% off`
      : `$${nodeData.discount_value || 0} off`;

  const prefixLabel = nodeData.code_prefix
    ? `${nodeData.code_prefix}-XXXXXX`
    : "No prefix set";

  return (
    <div
      className={`min-w-[240px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-primary" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !border-2 !border-background !bg-purple-600"
      />

      <div className="flex items-center gap-2 rounded-t-md border-b border-border bg-muted px-3 py-2">
        <Tag className="size-4 text-purple-600" />
        <span className="text-sm font-medium text-foreground">
          Discount Code
        </span>
      </div>

      <div className="space-y-1 p-3">
        <p className="text-sm font-medium text-foreground">{valueLabel}</p>
        <p className="font-mono text-xs text-muted-foreground">{prefixLabel}</p>
        {nodeData.expires_in_days ? (
          <p className="text-xs text-muted-foreground">
            Expires in {nodeData.expires_in_days} days
          </p>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !border-2 !border-background !bg-purple-600"
      />
    </div>
  );
}

export default DiscountNode;
