"use client";

import {
  ArrowLeft,
  Code2,
  Eye,
  FlaskConical,
  MoreHorizontal,
  Palette,
  Redo2,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { useErmesHost } from "../../../../../host";
import { useRouter } from "next/navigation";

import { Button } from "../../../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../../../components/ui/dropdown-menu";
import { Input } from "../../../../../components/ui/input";
import { StatusBadge } from "../../../components/admin/status-badge";
import { useEditorStore } from "../../../editor-store";

export type FormEditorSection = "design" | "targeting" | "html" | "preview";

export function Toolbar({
  disabled = false,
  experimentId,
  isVariant = false,
  onPublish,
  onSectionChange,
  onUnpublish,
  saving,
  section,
}: {
  disabled?: boolean;
  experimentId?: string | null;
  isVariant?: boolean;
  onPublish: () => void;
  onSectionChange: (section: FormEditorSection) => void;
  onUnpublish: () => void;
  saving: boolean;
  section: FormEditorSection;
}) {
  const router = useRouter();
  const experimentsEnabled = Boolean(useErmesHost().formExperiments);
  const name = useEditorStore((s) => s.name);
  const formId = useEditorStore((s) => s.formId);
  const status = useEditorStore((s) => s.status);
  const dirty = useEditorStore((s) => s.dirty);
  const type = useEditorStore((s) => s.type);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const setName = useEditorStore((s) => s.setName);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const saveLabel = saving ? "Saving…" : dirty ? "Unsaved" : "Saved";

  return (
    <div className="border-b border-border bg-card">
      <h1 className="sr-only">Sign-up form editor</h1>
      <div className="flex min-w-0 items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button
            aria-label={experimentId ? "Back to A/B test" : "Back to forms"}
            disabled={Boolean(experimentId && (dirty || saving))}
            onClick={() =>
              router.push(
                experimentId && formId
                  ? `/messaging/forms/${formId}/experiment`
                  : "/messaging/forms",
              )
            }
            size="icon-sm"
            title={experimentId ? "Back to A/B test" : "Back to forms"}
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <Input
            aria-label="Form name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 min-w-0 max-w-72 flex-1 font-medium"
          />
          <span className="hidden sm:inline-flex">
            <StatusBadge
              label={
                isVariant
                  ? "Candidate"
                  : status === "published"
                    ? "Published"
                    : "Draft"
              }
              value={isVariant || status !== "published" ? "draft" : "active"}
            />
          </span>
        </div>

        <div className="hidden items-center gap-1 sm:flex">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={undo}
            disabled={!canUndo}
            title="Undo"
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={redo}
            disabled={!canRedo}
            title="Redo"
          >
            <Redo2 className="size-4" />
          </Button>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span
            aria-live="polite"
            className={`hidden min-w-14 text-right text-xs md:block ${dirty ? "text-amber-600" : "text-muted-foreground"}`}
          >
            {saveLabel}
          </span>
          {isVariant ? null : (
            <Button disabled={disabled || saving} onClick={onPublish}>
              {status === "published" ? "Publish changes" : "Publish"}
            </Button>
          )}
          {!isVariant ? (
            <span className={status === "published" ? "" : "sm:hidden"}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="More form actions"
                    disabled={disabled || saving}
                    size="icon"
                    title="More actions"
                    variant="outline"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="sm:hidden"
                    disabled={!canUndo}
                    onSelect={undo}
                  >
                    <Undo2 className="size-4" />
                    Undo
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="sm:hidden"
                    disabled={!canRedo}
                    onSelect={redo}
                  >
                    <Redo2 className="size-4" />
                    Redo
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="sm:hidden" />
                  {experimentsEnabled &&
                  status === "published" &&
                  formId &&
                  (type === "popup" || type === "flyout") ? (
                    <DropdownMenuItem
                      disabled={dirty || saving}
                      onSelect={() =>
                        router.push(`/messaging/forms/${formId}/experiment`)
                      }
                    >
                      <FlaskConical className="size-4" />
                      Manage experiment
                    </DropdownMenuItem>
                  ) : null}
                  {status === "published" ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={onUnpublish}
                        variant="destructive"
                      >
                        Unpublish form
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          ) : null}
        </div>
      </div>
      <nav
        aria-label="Form editor sections"
        className="flex h-10 items-end gap-5 border-t px-4"
      >
        {(
          [
            { icon: Palette, label: "Design", value: "design" },
            { icon: SlidersHorizontal, label: "Targeting", value: "targeting" },
            { icon: Code2, label: "HTML", value: "html" },
            { icon: Eye, label: "Preview", value: "preview" },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = section === item.value;
          return (
            <button
              aria-current={active ? "page" : undefined}
              className={`flex h-10 items-center gap-2 border-b-2 px-1 text-sm font-medium transition-colors ${
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              key={item.value}
              onClick={() => onSectionChange(item.value)}
              type="button"
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
