"use client";

import type {
  BlockType,
  StepKind,
} from "../../../contracts/signup-form-schema";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "../../../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../../components/ui/dropdown-menu";
import { Label } from "../../../../../components/ui/label";
import { STEP_ORDER, useEditorStore } from "../../../editor-store";

const STEP_LABELS: Record<StepKind, string> = {
  teaser: "Teaser",
  opt_in: "Email Opt-In",
  success: "Success",
  already_subscribed: "Already subscribed",
};
const ADDABLE: { type: BlockType; label: string }[] = [
  { type: "heading", label: "Heading" },
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "email_input", label: "Email field" },
  { type: "name_field", label: "Name field" },
  { type: "consent", label: "Consent" },
  { type: "button", label: "Button" },
  { type: "divider", label: "Divider" },
  { type: "spacer", label: "Spacer" },
  { type: "html", label: "HTML" },
];

function blockLabel(type: string): string {
  return type.replace("_", " ");
}

function BlockRow({
  id,
  type,
  text,
}: {
  id: string;
  type: string;
  text?: string;
}) {
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const removeBlock = useEditorStore((s) => s.removeBlock);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const selected = selectedBlockId === id;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-1 rounded-md border bg-card px-1.5 py-1.5 text-sm ${selected ? "border-primary ring-1 ring-primary/30" : ""} ${isDragging ? "opacity-60" : ""}`}
    >
      <button
        className="cursor-grab text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <button
        className="flex-1 truncate text-left capitalize"
        onClick={() => selectBlock(id)}
      >
        {blockLabel(type)}
        {text ? (
          <span className="ml-2 text-xs text-muted-foreground">
            {text.slice(0, 18)}
          </span>
        ) : null}
      </button>
      <button
        className="text-red-600 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        onClick={() => removeBlock(id)}
        title="Delete"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export function LeftRail() {
  const document = useEditorStore((s) => s.document);
  const step = useEditorStore((s) => s.step);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const setStep = useEditorStore((s) => s.setStep);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const addStep = useEditorStore((s) => s.addStep);
  const removeStep = useEditorStore((s) => s.removeStep);
  const addBlock = useEditorStore((s) => s.addBlock);
  const reorderBlocks = useEditorStore((s) => s.reorderBlocks);

  const existingKinds = new Set(document.steps.map((s) => s.kind));
  const blocks = document.steps.find((s) => s.kind === step)?.blocks ?? [];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id)
      reorderBlocks(String(active.id), String(over.id));
  }

  return (
    <div className="space-y-5">
      <button
        className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
          selectedBlockId === null
            ? "border-primary bg-primary/5 text-foreground"
            : "text-muted-foreground"
        }`}
        onClick={() => selectBlock(null)}
      >
        Form layout &amp; theme
      </button>

      <div>
        <Label className="text-xs uppercase text-muted-foreground">Steps</Label>
        <div className="mt-2 flex flex-wrap gap-1">
          {STEP_ORDER.filter((kind) => existingKinds.has(kind)).map((kind) => (
            <button
              key={kind}
              onClick={() => setStep(kind)}
              className={`rounded-md px-2.5 py-1 text-xs ${step === kind ? "bg-primary text-primary-foreground" : "border text-muted-foreground"}`}
            >
              {STEP_LABELS[kind]}
            </button>
          ))}
          {STEP_ORDER.filter((kind) => !existingKinds.has(kind)).map((kind) => (
            <button
              key={kind}
              onClick={() => addStep(kind)}
              className="rounded-md border border-dashed px-2.5 py-1 text-xs text-muted-foreground"
            >
              + {STEP_LABELS[kind]}
            </button>
          ))}
        </div>
        {step === "opt_in" || step === "already_subscribed" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {STEP_LABELS[step]} is required and cannot be removed.
          </p>
        ) : existingKinds.has(step) ? (
          <button
            className="mt-2 flex items-center gap-1 text-xs text-red-600 hover:underline"
            onClick={() => {
              if (window.confirm(`Remove the ${STEP_LABELS[step]} step?`)) {
                removeStep(step);
              }
            }}
          >
            <Trash2 className="size-3.5" />
            Remove {STEP_LABELS[step]} step
          </button>
        ) : null}
      </div>

      <div>
        <Label className="text-xs uppercase text-muted-foreground">
          Blocks
        </Label>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="mt-2 space-y-1">
              {blocks.map((block) => (
                <BlockRow
                  key={block.id}
                  id={block.id}
                  type={block.type}
                  text={block.text}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {blocks.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No blocks yet — add one below.
          </p>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="mt-3 w-full border-dashed"
              size="sm"
              variant="outline"
            >
              <Plus className="size-4" />
              Add block
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {ADDABLE.map((item) => (
              <DropdownMenuItem
                key={item.type}
                onSelect={() => addBlock(item.type)}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
