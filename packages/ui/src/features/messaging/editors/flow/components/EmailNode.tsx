"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Mail } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../../components/ui/select";

export interface EmailNodeData {
  template_id: string;
  templates: Array<{ id: string; name: string }>;
  onDataChange?: (data: Partial<EmailNodeData>) => void;
}

export function EmailNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as EmailNodeData;
  const templateName = nodeData.templates?.find(
    (t) => t.id === nodeData.template_id,
  )?.name;

  return (
    <div
      className={`min-w-[240px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-primary" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !border-2 !border-background !bg-primary"
      />

      <div className="flex items-center gap-2 rounded-t-md border-b border-border bg-muted px-3 py-2">
        <Mail className="size-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Send Email</span>
      </div>

      <div className="p-3">
        <Select
          value={nodeData.template_id || ""}
          onValueChange={(value) =>
            nodeData.onDataChange?.({ template_id: value })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select template..." />
          </SelectTrigger>
          <SelectContent>
            {(nodeData.templates || []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {templateName ? (
          <p className="mt-2 truncate text-xs text-muted-foreground">
            {templateName}
          </p>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}

export default EmailNode;
