"use client";

import { Box, Clock, Flag, Mail, Split, Tag, X, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type Node } from "@xyflow/react";

import { Button } from "../../../../../components/ui/button";

import { TriggerDetailPanel } from "./panels/TriggerDetailPanel";
import { EmailDetailPanel } from "./panels/EmailDetailPanel";
import { DelayDetailPanel } from "./panels/DelayDetailPanel";
import { ConditionDetailPanel } from "./panels/ConditionDetailPanel";
import { DiscountDetailPanel } from "./panels/DiscountDetailPanel";

interface NodeDetailPanelProps {
  selectedNode: Node | null;
  templates: Array<{ id: string; name: string }>;
  onClose: () => void;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  flowId?: string;
}

const NODE_ICONS: Record<string, LucideIcon> = {
  condition: Split,
  delay: Clock,
  discount: Tag,
  email: Mail,
  end: Flag,
  trigger: Zap,
};

export function NodeDetailPanel({
  selectedNode,
  templates,
  onClose,
  onUpdateNode,
  flowId,
}: NodeDetailPanelProps) {
  if (!selectedNode) {
    return null;
  }

  const handleDataChange = (updates: Record<string, unknown>) => {
    onUpdateNode(selectedNode.id, updates);
  };

  const renderPanelContent = () => {
    switch (selectedNode.type) {
      case "trigger":
        return (
          <TriggerDetailPanel
            data={selectedNode.data as never}
            onChange={handleDataChange}
          />
        );
      case "email":
        return (
          <EmailDetailPanel
            data={selectedNode.data as never}
            templates={templates}
            onChange={handleDataChange}
            flowId={flowId}
          />
        );
      case "delay":
        return (
          <DelayDetailPanel
            data={selectedNode.data as never}
            onChange={handleDataChange}
          />
        );
      case "condition":
        return (
          <ConditionDetailPanel
            data={selectedNode.data as never}
            onChange={handleDataChange}
          />
        );
      case "discount":
        return (
          <DiscountDetailPanel
            data={selectedNode.data as never}
            onChange={handleDataChange}
          />
        );
      case "end":
        return (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              This marks the end of the flow. No configuration needed.
            </p>
          </div>
        );
      default:
        return (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              Select a node to configure it.
            </p>
          </div>
        );
    }
  };

  const getNodeTitle = () => {
    switch (selectedNode.type) {
      case "trigger":
        return "Trigger";
      case "email":
        return "Email details";
      case "delay":
        return "Time delay details";
      case "condition":
        return "Conditional split";
      case "discount":
        return "Discount code";
      case "end":
        return "End";
      default:
        return "Node details";
    }
  };

  const NodeIcon = NODE_ICONS[selectedNode.type ?? ""] ?? Box;

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex h-full w-full max-w-80 flex-col overflow-hidden border-l border-border bg-card shadow-xl min-[1600px]:relative min-[1600px]:shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <NodeIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">
            {getNodeTitle()}
          </h3>
        </div>
        <Button
          aria-label="Close inspector"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">{renderPanelContent()}</div>
    </aside>
  );
}

export default NodeDetailPanel;
