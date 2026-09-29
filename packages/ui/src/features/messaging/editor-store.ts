"use client";

import {
  type BlockStyles,
  type BlockType,
  type FormBlock,
  type SignupFormDocument,
  type StepKind,
  makeBlock,
  makeStep,
  serializeBlocksToHtml,
} from "./contracts/signup-form-schema";
import { create } from "zustand";

import type { SignupForm } from "./admin-types";

export const STEP_ORDER: StepKind[] = [
  "teaser",
  "opt_in",
  "success",
  "already_subscribed",
];

// The slice of state we snapshot for undo/redo (the persisted content, not UI state).
interface Snapshot {
  name: string;
  type: SignupForm["type"];
  document: SignupFormDocument;
}

interface EditorState extends Snapshot {
  formId: string | null;
  editorKey: string | null;
  status: "draft" | "published";
  // UI state (not part of history)
  step: StepKind;
  selectedBlockId: string | null;
  device: "desktop" | "mobile";
  // history
  past: Snapshot[];
  future: Snapshot[];
  dirty: boolean;
  loaded: boolean;

  load: (
    form: SignupForm,
    options?: {
      document?: SignupFormDocument;
      editorKey?: string;
      name?: string;
      status?: "draft" | "published";
    },
  ) => void;
  // content mutations (history-tracked)
  setName: (name: string) => void;
  setType: (type: SignupForm["type"]) => void;
  setStyles: (patch: Partial<SignupFormDocument["styles"]>) => void;
  setTargeting: (patch: Partial<SignupFormDocument["targeting"]>) => void;
  setMode: (mode: "blocks" | "html") => void;
  setHtml: (html: string) => void;
  setCss: (css: string) => void;
  regenerateHtml: () => void;
  addBlock: (type: BlockType) => void;
  updateBlock: (id: string, patch: Partial<FormBlock>) => void;
  updateBlockStyle: (id: string, patch: Partial<BlockStyles>) => void;
  // Non-history block text setter for the html block's code editor (it has its own undo).
  setBlockCode: (id: string, text: string) => void;
  duplicateBlock: (id: string) => void;
  removeBlock: (id: string) => void;
  reorderBlocks: (activeId: string, overId: string) => void;
  addStep: (kind: StepKind) => void;
  removeStep: (kind: StepKind) => void;
  // UI
  setStep: (kind: StepKind) => void;
  selectBlock: (id: string | null) => void;
  setDevice: (device: "desktop" | "mobile") => void;
  setStatus: (status: "draft" | "published") => void;
  markSaved: () => void;
  // history
  undo: () => void;
  redo: () => void;
}

const HISTORY_LIMIT = 50;

function snapshot(state: EditorState): Snapshot {
  return { name: state.name, type: state.type, document: state.document };
}

function currentStepBlocks(state: EditorState): FormBlock[] {
  return (
    state.document.steps.find((candidate) => candidate.kind === state.step)
      ?.blocks ?? []
  );
}

function alreadySubscribedBlocks(): FormBlock[] {
  return [
    makeBlock("heading", {
      text: "You're already on the list",
      styles: { align: "center", fontSize: 20, fontWeight: "medium" },
    }),
    makeBlock("text", {
      text: "No need to sign up again — we'll keep you posted.",
      styles: { align: "center", color: "#666666" },
    }),
  ];
}

function withAlreadySubscribedStep(
  document: SignupFormDocument,
): SignupFormDocument {
  if (
    document.steps.some((candidate) => candidate.kind === "already_subscribed")
  ) {
    return document;
  }
  return {
    ...document,
    steps: [
      ...document.steps,
      makeStep("already_subscribed", alreadySubscribedBlocks()),
    ].sort((a, b) => STEP_ORDER.indexOf(a.kind) - STEP_ORDER.indexOf(b.kind)),
  };
}

export const useEditorStore = create<EditorState>()((set, get) => {
  // Wraps a content change: snapshot the current state into `past`, apply the
  // change, clear `future`, and mark dirty.
  function commit(producer: (state: EditorState) => Partial<Snapshot>) {
    set((state) => {
      const past = [...state.past, snapshot(state)].slice(-HISTORY_LIMIT);
      return { ...producer(state), past, future: [], dirty: true };
    });
  }

  function mutateStepBlocks(
    stepKind: StepKind,
    updater: (blocks: FormBlock[]) => FormBlock[],
  ) {
    commit((state) => ({
      document: {
        ...state.document,
        steps: state.document.steps.map((candidate) =>
          candidate.kind === stepKind
            ? { ...candidate, blocks: updater(candidate.blocks) }
            : candidate,
        ),
      },
    }));
  }

  return {
    formId: null,
    editorKey: null,
    name: "",
    type: "popup",
    status: "draft",
    document: {
      schema_version: 1,
      steps: [],
      targeting: {
        delay_ms: 5000,
        cooldown_days: 30,
        devices: ["desktop", "mobile"],
        hide_after_submit: true,
        close_button_devices: ["desktop", "mobile"],
        dismiss_on_outside_devices: ["desktop", "mobile"],
        hide_when_logged_in: true,
        trigger_match: "any",
        triggers: ["time"],
      },
      styles: {},
    },
    step: "opt_in",
    selectedBlockId: null,
    device: "desktop",
    past: [],
    future: [],
    dirty: false,
    loaded: false,

    load: (form, options) => {
      const document = withAlreadySubscribedStep(
        options?.document ?? form.document,
      );
      set({
        formId: form.id,
        editorKey: options?.editorKey ?? form.id,
        name: options?.name ?? form.name,
        type: form.type,
        status: options?.status ?? form.status,
        document,
        step: document.steps.some((s) => s.kind === "opt_in")
          ? "opt_in"
          : (document.steps[0]?.kind ?? "opt_in"),
        selectedBlockId: null,
        past: [],
        future: [],
        dirty: false,
        loaded: true,
      });
    },

    setName: (name) => commit(() => ({ name })),
    setType: (type) => commit(() => ({ type })),
    setStyles: (patch) =>
      commit((state) => ({
        document: {
          ...state.document,
          styles: { ...state.document.styles, ...patch },
        },
      })),
    setTargeting: (patch) =>
      commit((state) => ({
        document: {
          ...state.document,
          targeting: { ...state.document.targeting, ...patch },
        },
      })),
    // Switching to HTML mode for the first time seeds the code from the visual blocks
    // (one-way). Once html exists we never clobber it on toggle.
    setMode: (mode) =>
      commit((state) =>
        mode === "html" && !(state.document.html ?? "").trim()
          ? {
              document: {
                ...state.document,
                mode,
                html: serializeBlocksToHtml(state.document),
              },
            }
          : { document: { ...state.document, mode } },
      ),
    // Code edits don't push history entries (the code editor has its own undo); they
    // just mark dirty so autosave fires.
    setHtml: (html) =>
      set((state) => ({
        document: { ...state.document, html },
        future: [],
        dirty: true,
      })),
    setCss: (css) =>
      set((state) => ({
        document: { ...state.document, css },
        future: [],
        dirty: true,
      })),
    regenerateHtml: () =>
      set((state) => ({
        document: {
          ...state.document,
          html: serializeBlocksToHtml(state.document),
        },
        future: [],
        dirty: true,
      })),

    addBlock: (type) => {
      const defaults: Partial<FormBlock> =
        type === "email_input"
          ? { text: "Email" }
          : type === "name_field"
            ? { text: "First name" }
            : type === "consent"
              ? { text: "I agree to receive marketing emails." }
              : type === "button"
                ? { text: "SUBSCRIBE" }
                : type === "heading"
                  ? { text: "Heading" }
                  : type === "text"
                    ? { text: "Text" }
                    : type === "html"
                      ? {
                          text: '<div style="text-align:center;padding:8px">Custom HTML</div>',
                        }
                      : {};
      const block = makeBlock(type, defaults);
      mutateStepBlocks(get().step, (blocks) => [...blocks, block]);
      set({ selectedBlockId: block.id });
    },

    updateBlock: (id, patch) =>
      mutateStepBlocks(get().step, (blocks) =>
        blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      ),
    setBlockCode: (id, text) =>
      set((state) => ({
        document: {
          ...state.document,
          steps: state.document.steps.map((candidate) =>
            candidate.kind === state.step
              ? {
                  ...candidate,
                  blocks: candidate.blocks.map((b) =>
                    b.id === id ? { ...b, text } : b,
                  ),
                }
              : candidate,
          ),
        },
        future: [],
        dirty: true,
      })),
    updateBlockStyle: (id, patch) =>
      mutateStepBlocks(get().step, (blocks) =>
        blocks.map((b) =>
          b.id === id ? { ...b, styles: { ...b.styles, ...patch } } : b,
        ),
      ),

    duplicateBlock: (id) => {
      const blocks = currentStepBlocks(get());
      const source = blocks.find((b) => b.id === id);
      if (!source) return;
      const copy = makeBlock(source.type, {
        text: source.text,
        src: source.src,
        styles: source.styles ? { ...source.styles } : undefined,
      });
      const index = blocks.findIndex((b) => b.id === id);
      mutateStepBlocks(get().step, (current) => [
        ...current.slice(0, index + 1),
        copy,
        ...current.slice(index + 1),
      ]);
      set({ selectedBlockId: copy.id });
    },

    removeBlock: (id) => {
      mutateStepBlocks(get().step, (blocks) =>
        blocks.filter((b) => b.id !== id),
      );
      if (get().selectedBlockId === id) set({ selectedBlockId: null });
    },

    reorderBlocks: (activeId, overId) => {
      if (activeId === overId) return;
      mutateStepBlocks(get().step, (blocks) => {
        const from = blocks.findIndex((b) => b.id === activeId);
        const to = blocks.findIndex((b) => b.id === overId);
        if (from < 0 || to < 0) return blocks;
        const next = [...blocks];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    },

    addStep: (kind) => {
      if (get().document.steps.some((candidate) => candidate.kind === kind)) {
        return;
      }
      commit((state) => ({
        document: {
          ...state.document,
          steps: [
            ...state.document.steps,
            makeStep(
              kind,
              kind === "already_subscribed" ? alreadySubscribedBlocks() : [],
            ),
          ].sort(
            (a, b) => STEP_ORDER.indexOf(a.kind) - STEP_ORDER.indexOf(b.kind),
          ),
        },
      }));
      set({ step: kind, selectedBlockId: null });
    },

    removeStep: (kind) => {
      // The opt-in step owns the email input and submit action, so a valid
      // signup form must always retain it.
      if (kind === "opt_in" || kind === "already_subscribed") return;
      commit((state) => ({
        document: {
          ...state.document,
          steps: state.document.steps.filter(
            (candidate) => candidate.kind !== kind,
          ),
        },
      }));
      const remaining = get().document.steps;
      set({
        step: remaining.some((candidate) => candidate.kind === "opt_in")
          ? "opt_in"
          : (remaining[0]?.kind ?? "opt_in"),
        selectedBlockId: null,
      });
    },

    setStep: (kind) => set({ step: kind, selectedBlockId: null }),
    selectBlock: (id) => set({ selectedBlockId: id }),
    setDevice: (device) => set({ device }),
    setStatus: (status) => set({ status, dirty: true }),
    markSaved: () => set({ dirty: false }),

    undo: () =>
      set((state) => {
        const prev = state.past[state.past.length - 1];
        if (!prev) return state;
        return {
          ...prev,
          past: state.past.slice(0, -1),
          future: [snapshot(state), ...state.future].slice(0, HISTORY_LIMIT),
          dirty: true,
          selectedBlockId: null,
        };
      }),

    redo: () =>
      set((state) => {
        const next = state.future[0];
        if (!next) return state;
        return {
          ...next,
          past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
          future: state.future.slice(1),
          dirty: true,
          selectedBlockId: null,
        };
      }),
  };
});
