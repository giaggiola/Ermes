"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { TRIGGER_CATALOG, triggerLabel } from "../../../trigger-catalog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../../components/ui/select";

export interface TriggerNodeData {
  trigger_event: string;
  onDataChange?: (data: Partial<TriggerNodeData>) => void;
}

export function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TriggerNodeData;

  return (
    <div
      className={`min-w-[240px] rounded-lg border-2 bg-card shadow-sm ${selected ? "border-primary" : "border-border"}`}
    >
      <div className="flex items-center gap-2 rounded-t-md border-b border-border bg-muted px-3 py-2">
        <Zap className="size-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Trigger</span>
      </div>

      <div className="p-3">
        <Select
          value={nodeData.trigger_event}
          onValueChange={(value) =>
            nodeData.onDataChange?.({ trigger_event: value })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select trigger...">
              {triggerLabel(nodeData.trigger_event)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_CATALOG.map((trigger) => (
              <SelectItem key={trigger.value} value={trigger.value}>
                {trigger.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}

export default TriggerNode;
