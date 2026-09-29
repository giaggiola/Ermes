"use client";

import { type DragEvent, type ReactNode, useState } from "react";
import {
  Mail,
  Clock,
  Split,
  Tag,
  Flag,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { Button } from "../../../../../components/ui/button";

interface StepItemProps {
  collapsed: boolean;
  type: string;
  label: string;
  icon: ReactNode;
}

function StepItem({ collapsed, type, label, icon }: StepItemProps) {
  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData("application/reactflow", type);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      className="flex cursor-grab items-center gap-3 rounded-lg border border-border bg-muted p-3 transition-all hover:border-foreground/20 hover:bg-accent active:cursor-grabbing"
      draggable
      onDragStart={onDragStart}
      title={collapsed ? `Drag ${label} onto the canvas` : undefined}
    >
      {icon}
      <span
        className={
          collapsed ? "sr-only" : "text-sm font-medium text-foreground"
        }
      >
        {label}
      </span>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const stepTypes = [
    {
      type: "email",
      label: "Send Email",
      icon: <Mail className="size-5 text-primary" />,
    },
    {
      type: "delay",
      label: "Wait / Delay",
      icon: <Clock className="size-5 text-orange-500" />,
    },
    {
      type: "condition",
      label: "Condition",
      icon: <Split className="size-5 text-green-600" />,
    },
    {
      type: "discount",
      label: "Discount Code",
      icon: <Tag className="size-5 text-purple-600" />,
    },
    {
      type: "end",
      label: "End Flow",
      icon: <Flag className="size-5 text-muted-foreground" />,
    },
  ];

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-border bg-card transition-[width] ${collapsed ? "w-16 p-2" : "w-64 p-4 max-md:w-56"}`}
    >
      <div
        className={`mb-4 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}
      >
        {!collapsed ? (
          <div>
            <p className="font-semibold text-foreground">Add steps</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Drag a step onto the canvas
            </p>
          </div>
        ) : null}
        <Button
          aria-label={
            collapsed ? "Expand step palette" : "Collapse step palette"
          }
          onClick={() => setCollapsed((value) => !value)}
          size="icon-sm"
          title={collapsed ? "Expand step palette" : "Collapse step palette"}
          variant="ghost"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>
      </div>

      <div className={collapsed ? "space-y-2" : "space-y-3"}>
        {stepTypes.map((step) => (
          <StepItem collapsed={collapsed} key={step.type} {...step} />
        ))}
      </div>

      {!collapsed ? (
        <div className="mt-auto border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            <strong>Tip:</strong> Connect nodes by dragging from one handle to
            another.
          </p>
        </div>
      ) : null}
    </aside>
  );
}

export default Sidebar;
