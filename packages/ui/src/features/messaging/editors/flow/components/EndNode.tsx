"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Flag } from "lucide-react";

export function EndNode({ selected }: NodeProps) {
  return (
    <div
      className={`min-w-[120px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-primary" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !border-2 !border-background !bg-muted-foreground"
      />

      <div className="flex items-center justify-center gap-2 rounded-md bg-muted px-3 py-2">
        <Flag className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">End</span>
      </div>
    </div>
  );
}

export default EndNode;
