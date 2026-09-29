"use client";

import { useErmesHost } from "../../../../host";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EditorWorkspace } from "../../../../components/patterns/EditorWorkspace";
import { Button } from "../../../../components/ui/button";
import { EditorCanvas } from "./components/EditorCanvas";
import { HtmlModeEditor } from "./components/HtmlModeEditor";
import { PlacementPreview } from "./components/PlacementPreview";
import { DesignInspector, DisplaySettings } from "./components/Inspector";
import { LeftRail } from "./components/LeftRail";
import { Toolbar, type FormEditorSection } from "./components/Toolbar";
import { adminFetch, jsonBody } from "../../admin-api";
import { useEditorStore } from "../../editor-store";
import {
  useAdminPatch,
  useSignupForm,
  useSignupFormExperiment,
  useSignupFormExperiments,
  useUpdateSignupFormExperimentVariant,
} from "../../use-admin";
import { useMessagingCompatibility } from "../../contract";
import { useUnsavedChangesGuard } from "../../journeys/use-unsaved-changes-guard";

const AUTOSAVE_DELAY_MS = 900;
const EDITOR_SECTIONS = new Set<FormEditorSection>([
  "design",
  "targeting",
  "html",
  "preview",
]);
const ACTIVE_EXPERIMENT_STATUSES = new Set([
  "draft",
  "launching",
  "running",
  "paused",
  "concluding",
  "integration_error",
]);

export default function FormEditorPage() {
  const experimentsEnabled = Boolean(useErmesHost().formExperiments);
  const routeParams = useParams<{
    id: string;
    experimentId?: string;
    variantKey?: string;
  }>();
  const id = routeParams.id;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const experimentId = experimentsEnabled
    ? (routeParams.experimentId ?? searchParams.get("experiment"))
    : null;
  const query = useSignupForm(id);
  const formExperiments = useSignupFormExperiments(
    experimentId || !experimentsEnabled ? null : id,
  );
  const activeExperiment = formExperiments.data?.find((item) =>
    ACTIVE_EXPERIMENT_STATUSES.has(item.status),
  );
  const experiment = useSignupFormExperiment(
    experimentId ?? activeExperiment?.id ?? null,
  );
  const candidate = experimentId
    ? experiment.data?.variants.find(
        (variant) =>
          variant.key ===
          (routeParams.variantKey ??
            experiment.data?.test_variant?.key ??
            "test"),
      )
    : undefined;
  const controlVariant = experiment.data?.variants.find(
    (variant) => variant.key === "control",
  );
  const leakedControl =
    !experimentId &&
    query.data &&
    controlVariant &&
    query.data.published_version_id === controlVariant.id &&
    JSON.stringify(controlVariant.document) !==
      JSON.stringify(query.data.document) &&
    experiment.data?.variants.some(
      (variant) =>
        variant.key !== "control" &&
        JSON.stringify(variant.document) ===
          JSON.stringify(query.data?.document),
    )
      ? controlVariant
      : undefined;
  const variantKey = candidate?.key ?? routeParams.variantKey ?? null;
  const editorKey =
    experimentId && variantKey
      ? `${id}:experiment:${experimentId}:${variantKey}`
      : id;
  const compatibility = useMessagingCompatibility();
  const patch = useAdminPatch<Record<string, unknown> & { id: string }>(
    "signup-forms",
    ["signup-forms"],
  );
  const variantPatch = useUpdateSignupFormExperimentVariant(
    experimentId,
    variantKey,
  );
  // Keep the latest mutations in refs so query-state changes do not repeatedly
  // tear down the autosave subscription/debounce.
  const patchRef = useRef(patch);
  patchRef.current = patch;
  const variantPatchRef = useRef(variantPatch);
  variantPatchRef.current = variantPatch;
  const repairedLegacyDraft = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestedSection = searchParams.get("tab");
  const urlSection = EDITOR_SECTIONS.has(requestedSection as FormEditorSection)
    ? (requestedSection as FormEditorSection)
    : null;
  const [section, setSection] = useState<FormEditorSection>(
    urlSection ?? "design",
  );

  const ready = useEditorStore(
    (s) => s.loaded && s.formId === id && s.editorKey === editorKey,
  );
  const dirty = useEditorStore((s) => s.dirty);
  const mode = useEditorStore((s) => s.document.mode ?? "blocks");
  useUnsavedChangesGuard(dirty);

  useEffect(() => {
    if (!ready) return;
    const next = urlSection ?? (mode === "html" ? "html" : "design");
    setSection(next);
    if (!urlSection) {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("tab", next);
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    }
  }, [mode, pathname, ready, router, searchParams, urlSection]);

  const changeSection = useCallback(
    (nextSection: FormEditorSection) => {
      setSection(nextSection);
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("tab", nextSection);
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
      if (nextSection === "html" || nextSection === "design") {
        const nextMode = nextSection === "html" ? "html" : "blocks";
        if (
          (useEditorStore.getState().document.mode ?? "blocks") !== nextMode
        ) {
          useEditorStore.getState().setMode(nextMode);
        }
      }
    },
    [pathname, router, searchParams],
  );

  // Load once per form; don't clobber the working copy when react-query refetches
  // after an autosave (which would wipe edits + undo history).
  useEffect(() => {
    const state = useEditorStore.getState();
    if (
      query.data &&
      (!experimentId || candidate) &&
      (!experimentsEnabled ||
        experimentId ||
        (!formExperiments.isPending &&
          (!activeExperiment || !experiment.isPending))) &&
      !(
        state.loaded &&
        state.formId === query.data.id &&
        state.editorKey === editorKey
      )
    ) {
      state.load(query.data, {
        document: candidate?.document ?? leakedControl?.document,
        editorKey,
        name: candidate?.name,
        status: experimentId ? "draft" : undefined,
      });
    }
  }, [
    experimentsEnabled,
    activeExperiment,
    candidate,
    editorKey,
    experiment.isPending,
    experimentId,
    formExperiments.isPending,
    leakedControl,
    query.data,
  ]);

  // Earlier experiment editing reused the mutable base form. Repair that exact
  // legacy state once when the base document is byte-for-byte equal to a pinned
  // candidate; unrelated unpublished drafts are left alone.
  useEffect(() => {
    if (
      experimentId ||
      !query.data ||
      !leakedControl ||
      repairedLegacyDraft.current === leakedControl.id
    ) {
      return;
    }
    repairedLegacyDraft.current = leakedControl.id;
    setSaving(true);
    void patchRef.current
      .mutateAsync({
        id: query.data.id,
        name: query.data.name,
        type: query.data.type,
        status: query.data.status,
        document: leakedControl.document,
      })
      .then(() =>
        toast.success("Base form restored from the published Control"),
      )
      .catch((error) => {
        repairedLegacyDraft.current = null;
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not restore the base form",
        );
      })
      .finally(() => setSaving(false));
  }, [experimentId, leakedControl, query.data]);

  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const save = useCallback(
    async (override?: { status?: "draft" | "published" }) => {
      if (!compatibility.canEdit) return false;
      const s = useEditorStore.getState();
      if (!s.formId) return false;
      const preceding = saveQueue.current;
      let release!: () => void;
      saveQueue.current = new Promise<void>((resolve) => {
        release = resolve;
      });
      await preceding;
      setSaving(true);
      try {
        if (experimentId && variantKey) {
          await variantPatchRef.current.mutateAsync({
            document: s.document as unknown as Record<string, unknown>,
            name: s.name,
          });
        } else {
          await patchRef.current.mutateAsync({
            id: s.formId,
            name: s.name,
            type: s.type,
            status: override?.status ?? s.status,
            document: s.document,
          });
        }
        const current = useEditorStore.getState();
        if (
          current.document === s.document &&
          current.name === s.name &&
          current.type === s.type &&
          current.formId === s.formId
        )
          current.markSaved();
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save");
        return false;
      } finally {
        release();
        setSaving(false);
      }
    },
    [compatibility.canEdit, experimentId, variantKey],
  );

  // Debounced autosave on any content change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useEditorStore.subscribe((state) => {
      if (compatibility.canEdit && state.dirty && state.loaded) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (useEditorStore.getState().dirty) void save();
        }, AUTOSAVE_DELAY_MS);
      }
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [compatibility.canEdit, save]);

  if (query.error || (experimentId ? experiment.error : null)) {
    return (
      <div className="p-8 text-sm text-destructive" role="alert">
        {(query.error ?? experiment.error)?.message}
      </div>
    );
  }
  if (experimentId && !experiment.isPending && !candidate) {
    return (
      <div className="p-8 text-sm text-destructive" role="alert">
        This experiment candidate no longer exists.
      </div>
    );
  }
  if (!ready) {
    return (
      <div
        aria-live="polite"
        className="p-8 text-sm text-muted-foreground"
        role="status"
      >
        Loading form…
      </div>
    );
  }

  return (
    <EditorWorkspace
      disabled={!compatibility.canEdit}
      header={
        <>
          <Toolbar
            disabled={!compatibility.canEdit}
            experimentId={experimentId}
            isVariant={Boolean(experimentId)}
            saving={saving}
            section={section}
            onSectionChange={changeSection}
            onPublish={async () => {
              const state = useEditorStore.getState();
              if (
                (state.document.mode ?? "blocks") === "html" &&
                !(state.document.html ?? "").trim()
              ) {
                toast.error("Add HTML before publishing this form.");
                return;
              }
              if (
                !window.confirm(
                  `Publish "${state.name}" to the storefront with its current targeting rules?`,
                )
              ) {
                return;
              }
              if (!(await save())) return;
              setSaving(true);
              try {
                await adminFetch(
                  `v2/signup-forms/${state.formId}/publish`,
                  jsonBody({}),
                );
                const current = useEditorStore.getState();
                current.setStatus("published");
                if (
                  current.document === state.document &&
                  current.name === state.name &&
                  current.type === state.type
                )
                  current.markSaved();
                toast.success("Form published");
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Failed to publish",
                );
              } finally {
                setSaving(false);
              }
            }}
            onUnpublish={() => {
              if (
                !window.confirm(
                  "Unpublish this form? It will stop appearing on the storefront.",
                )
              ) {
                return;
              }
              useEditorStore.getState().setStatus("draft");
              void save({ status: "draft" });
            }}
          />
          {experimentId ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-500/20 bg-blue-500/5 px-4 py-2.5 text-sm">
              <p>
                <span className="font-medium">
                  Editing {candidate?.name ?? "experiment candidate"}.
                </span>{" "}
                Changes autosave only to this candidate. The base form is
                unchanged.
              </p>
              <Button
                disabled={dirty || saving}
                onClick={() => router.push(`/messaging/forms/${id}/experiment`)}
                size="sm"
                variant="outline"
              >
                {saving
                  ? "Saving…"
                  : dirty
                    ? "Waiting for autosave…"
                    : "Return to A/B test"}
              </Button>
            </div>
          ) : null}
        </>
      }
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden lg:flex-row">
        {section === "html" ? (
          <HtmlModeEditor />
        ) : section === "preview" ? (
          <PlacementPreview />
        ) : section === "targeting" ? (
          <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
            <DisplaySettings />
            <EditorCanvas />
          </div>
        ) : (
          <>
            <aside className="max-h-[45%] w-full shrink-0 overflow-y-auto border-r border-border bg-card p-4 lg:max-h-none lg:w-80">
              <div className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Design
              </div>
              <LeftRail />
              <DesignInspector />
            </aside>
            <EditorCanvas />
          </>
        )}
      </div>
    </EditorWorkspace>
  );
}
