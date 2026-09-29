"use client";

import type { FormBlock } from "../../../contracts/signup-form-schema";
import { Copy, Monitor, Smartphone, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { FormRenderer } from "../../../components/forms/form-renderer";
import { Button } from "../../../../../components/ui/button";
import { useEditorStore } from "../../../editor-store";

function SelectableBlock({
  block,
  node,
}: {
  block: FormBlock;
  node: ReactNode;
}) {
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const duplicateBlock = useEditorStore((s) => s.duplicateBlock);
  const removeBlock = useEditorStore((s) => s.removeBlock);
  const selected = selectedBlockId === block.id;

  return (
    <div
      onClick={(event) => {
        event.stopPropagation();
        selectBlock(block.id);
      }}
      style={{
        position: "relative",
        cursor: "pointer",
        outline: selected ? "2px solid #2563eb" : "1px dashed transparent",
        outlineOffset: 2,
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.outline = "1px dashed #93c5fd";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.outline = "1px dashed transparent";
      }}
    >
      {selected ? (
        <div
          style={{
            position: "absolute",
            top: -12,
            right: 0,
            zIndex: 10,
            display: "flex",
            gap: 2,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => duplicateBlock(block.id)}
            title="Duplicate"
            style={{
              background: "#2563eb",
              color: "#fff",
              borderRadius: 4,
              padding: 3,
              lineHeight: 0,
            }}
          >
            <Copy className="size-3" />
          </button>
          <button
            onClick={() => removeBlock(block.id)}
            title="Delete"
            style={{
              background: "#ef4444",
              color: "#fff",
              borderRadius: 4,
              padding: 3,
              lineHeight: 0,
            }}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ) : null}
      {node}
    </div>
  );
}

export function EditorCanvas() {
  const document = useEditorStore((s) => s.document);
  const type = useEditorStore((s) => s.type);
  const step = useEditorStore((s) => s.step);
  const device = useEditorStore((s) => s.device);
  const setDevice = useEditorStore((s) => s.setDevice);
  const selectBlock = useEditorStore((s) => s.selectBlock);

  const renderedStep = step;
  const teaser = renderedStep === "teaser";
  const flyout = type === "flyout";
  const alignToEdge = teaser || flyout;
  const stepHasBlocks = document.steps.some(
    (candidate) =>
      candidate.kind === renderedStep && candidate.blocks.length > 0,
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-muted/40">
      <div className="flex items-center justify-center gap-2 border-b border-border bg-card py-2">
        <Button
          size="icon-sm"
          variant={device === "desktop" ? "default" : "ghost"}
          onClick={() => setDevice("desktop")}
          title="Desktop"
        >
          <Monitor className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          variant={device === "mobile" ? "default" : "ghost"}
          onClick={() => setDevice("mobile")}
          title="Mobile"
        >
          <Smartphone className="size-4" />
        </Button>
      </div>
      <div
        className={`flex flex-1 p-4 sm:p-8 ${alignToEdge ? "items-end justify-end" : "items-center justify-center"}`}
        onClick={() => selectBlock(null)}
      >
        <div
          className={`flex w-full ${alignToEdge ? "justify-end" : "justify-center"}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={`w-full ${teaser ? "max-w-72" : flyout ? "max-w-sm" : ""}`}
          >
            {teaser && !stepHasBlocks ? (
              <div className="rounded-md border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                Add blocks to create the minimized teaser visitors can use to
                open this form.
              </div>
            ) : (
              <FormRenderer
                document={document}
                step={step}
                device={device}
                renderBlock={(block, node) => (
                  <SelectableBlock block={block} node={node} />
                )}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
