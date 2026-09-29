"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock } from "lucide-react";

import { Input } from "../../../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../../components/ui/select";

export interface DelayNodeData {
  duration: number;
  unit: "minutes" | "hours" | "days";
  onDataChange?: (data: Partial<DelayNodeData>) => void;
}

export function DelayNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as DelayNodeData;

  return (
    <div
      className={`min-w-[240px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-primary" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !border-2 !border-background !bg-orange-500"
      />

      <div className="flex items-center gap-2 rounded-t-md border-b border-border bg-muted px-3 py-2">
        <Clock className="size-4 text-orange-500" />
        <span className="text-sm font-medium text-foreground">Wait</span>
      </div>

      <div className="p-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={nodeData.duration || 1}
            onChange={(e) =>
              nodeData.onDataChange?.({
                duration: parseInt(e.target.value) || 1,
              })
            }
            className="w-20"
            min={1}
          />
          <Select
            value={nodeData.unit || "days"}
            onValueChange={(value) =>
              nodeData.onDataChange?.({
                unit: value as "minutes" | "hours" | "days",
              })
            }
          >
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutes</SelectItem>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !border-2 !border-background !bg-orange-500"
      />
    </div>
  );
}

export default DelayNode;
