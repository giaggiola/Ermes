"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Code2,
  Eye,
  FlaskConical,
  Monitor,
  MoreHorizontal,
  Palette,
  RefreshCw,
  Rocket,
  Save,
  Smartphone,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { EditorWorkspace } from "../../../../components/patterns/EditorWorkspace";
import { RichTextEditor } from "../../../../components/patterns/RichTextEditor";
import { Button } from "../../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../components/ui/dropdown-menu";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../../../components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../components/ui/tabs";
import { Textarea } from "../../../../components/ui/textarea";
import { EmptyState, ErrorState, LoadingState } from "../../components/admin/empty-state";
import {
  HtmlPreview,
  type PreviewDevice,
} from "../../components/admin/html-preview";
import { adminFetch, jsonBody } from "../../admin-api";
import type {
  EmailTemplate,
  TemplatePreview,
} from "../../admin-types";
import { useMessagingCompatibility } from "../../contract";
import {
  useAdminPatch,
  useEmailTemplates,
} from "../../use-admin";
import { displayTemplateName } from "./template-labels";

const templateSchema = z.object({
  category: z.string().optional(),
  document: z.unknown().optional(),
  editor_kind: z.enum(["legacy_html", "visual_v1"]),
  html_content: z.string().min(1, "HTML content is required"),
  is_active: z.boolean(),
  name: z.string().min(1, "Name is required"),
  preview_text: z.string().max(180).optional(),
  subject: z.string().min(1, "Subject is required"),
  text_content: z.string().optional(),
});

type TemplateForm = z.infer<typeof templateSchema>;

const blankTemplate: TemplateForm = {
  category: "marketing",
  document: {
    kind: "tiptap",
    root: {
      content: [
        {
          content: [{ text: "Hello {{first_name}},", type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    },
    schema_version: 1,
  },
  editor_kind: "visual_v1",
  html_content: "<p>Hello {{first_name}},</p>",
  is_active: true,
  name: "",
  preview_text: "",
  subject: "",
  text_content: "",
};

function valuesForTemplate(template: EmailTemplate): TemplateForm {
  return {
    category: template.category ?? "",
    document: template.document ?? undefined,
    editor_kind: template.editor_kind ?? "legacy_html",
    html_content: template.html_content,
    is_active: template.is_active,
    name: displayTemplateName(template.name),
    preview_text: template.preview_text ?? "",
    subject: template.subject,
    text_content: template.text_content ?? "",
  };
}

export default function TemplatesPage() {
  const router = useRouter();
  const selectedId = useParams<{ id: string }>().id;
  const compatibility = useMessagingCompatibility();
  const templates = useEmailTemplates();
  const [testEmail, setTestEmail] = useState("");
  const [editorTab, setEditorTab] = useState<"design" | "source">("design");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [previewMode, setPreviewMode] = useState<"draft" | "rendered">(
    "rendered",
  );
  const [renderedPreview, setRenderedPreview] = useState<TemplatePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [testPending, setTestPending] = useState(false);
  const [previewPanelOpen, setPreviewPanelOpen] = useState(false);
  const previewRequest = useRef(0);
  const testRequestInFlight = useRef(false);

  const selected = useMemo(
    () =>
      (templates.data ?? []).find((template) => template.id === selectedId) ??
      null,
    [selectedId, templates.data],
  );

  const form = useForm<TemplateForm>({
    defaultValues: blankTemplate,
    resolver: zodResolver(templateSchema),
  });
  const html = useWatch({ control: form.control, name: "html_content" });
  const subject = useWatch({ control: form.control, name: "subject" });
  const previewText = useWatch({ control: form.control, name: "preview_text" });
  const editorKind = useWatch({ control: form.control, name: "editor_kind" });
  const updateTemplate = useAdminPatch<TemplateForm & { id: string }>(
    "email-templates",
    ["email-templates"],
  );
  const isSaving = updateTemplate.isPending;
  const isDirty = form.formState.isDirty;

  useEffect(() => {
    if (isDirty) setPreviewMode("draft");
  }, [isDirty]);

  const loadRenderedPreview = useCallback(
    async (templateId: string, announce = false) => {
      const requestId = ++previewRequest.current;
      setPreviewPending(true);
      setPreviewError(null);
      try {
        const result = await adminFetch<TemplatePreview>(
          `email-templates/${encodeURIComponent(templateId)}/preview`,
          jsonBody({ context: {} }),
        );
        if (requestId !== previewRequest.current) return;
        setRenderedPreview(result);
        setPreviewMode("rendered");
        if (announce) toast.success("Preview rendered with sample data");
      } catch (error) {
        if (requestId !== previewRequest.current) return;
        setPreviewError(
          error instanceof Error ? error.message : "Preview failed",
        );
        if (announce) {
          toast.error(error instanceof Error ? error.message : "Preview failed");
        }
      } finally {
        if (requestId === previewRequest.current) setPreviewPending(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selected) return;
    form.reset(valuesForTemplate(selected));
    setEditorTab(selected.editor_kind === "visual_v1" ? "design" : "source");
  }, [form, selected]);

  // A selected saved template gets a real Handlebars render automatically.
  useEffect(() => {
    previewRequest.current += 1;
    setRenderedPreview(null);
    setPreviewError(null);
    setPreviewMode("rendered");
    setPreviewPending(false);
    if (selected?.id) void loadRenderedPreview(selected.id);
  }, [loadRenderedPreview, selected?.id]);

  function confirmDiscard() {
    return (
      !form.formState.isDirty ||
      window.confirm("Discard the unsaved changes to this template?")
    );
  }

  function exitEditor() {
    if (!confirmDiscard()) return;
    router.push("/messaging/templates");
  }

  async function persistTemplate(
    values: TemplateForm,
    announce = true,
  ): Promise<string | null> {
    if (!selected) return null;
    try {
      const templateId = selected.id;
      await updateTemplate.mutateAsync({ ...values, id: templateId });

      form.reset(values);
      await templates.refetch();
      if (announce) toast.success("Template saved");
      return templateId;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template save failed");
      return null;
    }
  }

  async function onSubmit(values: TemplateForm) {
    await persistTemplate(values);
  }

  async function saveWorkingCopy(announce = false) {
    if (!(await form.trigger())) {
      toast.error("Add a template name, subject, and email content first");
      return null;
    }
    if (selected?.id && !form.formState.isDirty) return selected.id;
    return persistTemplate(form.getValues(), announce);
  }

  async function publishTemplate() {
    const templateId = await saveWorkingCopy(false);
    if (!templateId) return;
    try {
      await adminFetch(
        `v2/email-templates/${encodeURIComponent(templateId)}/publish`,
        jsonBody({}),
      );
      await templates.refetch();
      toast.success("Template published");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Template publish failed",
      );
    }
  }

  async function renderPreview() {
    const templateId = await saveWorkingCopy(false);
    if (!templateId) return;
    await loadRenderedPreview(templateId, true);
  }

  async function sendTest() {
    if (testRequestInFlight.current) return;
    testRequestInFlight.current = true;
    setTestPending(true);
    try {
      const templateId = await saveWorkingCopy(false);
      if (!templateId) return;
      const result = await adminFetch<{
        dry_run?: boolean;
        message?: string;
      }>(
        `email-templates/${encodeURIComponent(templateId)}/send-test`,
        jsonBody({ email: testEmail, request_id: crypto.randomUUID() }),
      );
      toast.success(
        result.message ??
          (result.dry_run ? "Dry-run test rendered" : "Test sent"),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test send failed");
    } finally {
      testRequestInFlight.current = false;
      setTestPending(false);
    }
  }

  const previewHtml =
    previewMode === "rendered"
      ? (renderedPreview?.preview.html ?? "")
      : html;
  const previewSubject =
    previewMode === "rendered" && renderedPreview
      ? renderedPreview.preview.subject
      : subject;
  const hasUnpublishedChanges = Boolean(
    selected && selected.draft_version_id !== selected.published_version_id,
  );

  if (templates.isPending && !selected) {
    return (
      <div className="p-6">
        <LoadingState label="Loading template" />
      </div>
    );
  }

  if (templates.error) {
    return (
      <div className="p-6">
        <ErrorState
          error={templates.error}
          onRetry={() => void templates.refetch()}
        />
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="grid gap-4 p-6">
        <EmptyState message="This email template could not be found." />
        <Button className="w-fit" onClick={() => router.push("/messaging/templates")}>
          <ArrowLeft className="size-4" />
          Back to templates
        </Button>
      </div>
    );
  }

  return (
    <form
      className="h-full"
      onSubmit={form.handleSubmit(onSubmit, () =>
        toast.error("Add a template name, subject, and email content first"),
      )}
    >
      <EditorWorkspace
        header={
          <div className="flex min-w-0 items-center gap-3 border-b border-border bg-card px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Button
                aria-label="Back to email templates"
                onClick={exitEditor}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <Input
                aria-label="Template name"
                aria-invalid={Boolean(form.formState.errors.name)}
                className="h-8 min-w-0 max-w-72 flex-1 font-medium"
                disabled={!compatibility.canEdit}
                placeholder="Untitled template"
                {...form.register("name")}
              />
              <span className="hidden rounded-full border px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex">
                {selected?.published_version_id ? "Published" : "Draft"}
              </span>
            </div>
            <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
              <span
                aria-live="polite"
                className={`hidden text-xs md:inline ${isDirty || hasUnpublishedChanges ? "text-amber-600" : "text-muted-foreground"}`}
              >
                {isSaving
                  ? "Saving…"
                  : isDirty
                    ? "Unsaved"
                    : hasUnpublishedChanges
                      ? "Changes not published"
                      : "Saved"}
              </span>
              <Button
                aria-label="Save template draft"
                disabled={!compatibility.canEdit || isSaving}
                size="sm"
                type="submit"
                variant="outline"
              >
                <Save className="size-4" />
                <span className="hidden md:inline">Save draft</span>
              </Button>
              <Button
                disabled={!compatibility.canEdit || isSaving}
                onClick={() => void publishTemplate()}
                size="sm"
                type="button"
              >
                <Rocket className="size-4" />
                <span className="hidden md:inline">
                  {selected?.published_version_id ? "Publish changes" : "Publish"}
                </span>
                <span className="md:hidden">Publish</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button aria-label="More template actions" size="icon-sm" type="button" variant="outline">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setPreviewPanelOpen(true)}>
                    <Eye className="size-4" />
                    Preview &amp; test
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Sheet onOpenChange={setPreviewPanelOpen} open={previewPanelOpen}>
                <SheetContent className="w-full gap-0 sm:max-w-md">
                  <SheetHeader className="border-b pr-12">
                    <SheetTitle>Preview &amp; test</SheetTitle>
                    <SheetDescription>
                      Render this template with sample data or send it to an inbox.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="grid gap-6 overflow-y-auto p-4">
                    <section className="grid gap-3">
                      <div>
                        <h2 className="text-sm font-medium">Personalized preview</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Saves the working draft, then refreshes variables with sample data.
                        </p>
                      </div>
                      <Button
                        disabled={previewPending || isSaving || (!compatibility.canEdit && (!selected || isDirty))}
                        onClick={() => void renderPreview()}
                        type="button"
                        variant="outline"
                      >
                        {previewPending ? <RefreshCw className="size-4 animate-spin" /> : <Eye className="size-4" />}
                        {previewPending ? "Rendering…" : "Render sample"}
                      </Button>
                    </section>
                    <section className="grid gap-3 border-t pt-5">
                      <div>
                        <h2 className="text-sm font-medium">Send a test email</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Unsaved changes are saved before the test is sent.
                        </p>
                      </div>
                      <Input
                        aria-label="Test recipient email"
                        onChange={(event) => setTestEmail(event.target.value)}
                        placeholder="test@example.com"
                        type="email"
                        value={testEmail}
                      />
                      <Button
                        disabled={!compatibility.canEdit || testPending || !testEmail}
                        onClick={() => void sendTest()}
                        type="button"
                      >
                        <FlaskConical className="size-4" />
                        {testPending ? "Sending…" : "Send test"}
                      </Button>
                    </section>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        }
      >
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
            <section className="flex w-full shrink-0 flex-col border-r border-border bg-background xl:h-full xl:w-[420px]">
              <div className="grid gap-6 overflow-y-auto p-4">
                <section className="grid gap-4">
                  <div>
                    <h2 className="text-sm font-semibold">Message details</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The subject and preview text appear above the email canvas.
                    </p>
                  </div>
                  <label className="grid gap-2 text-sm font-medium">
                    Subject
                    <Input
                      disabled={!compatibility.canEdit}
                      placeholder="Welcome to Your store"
                      {...form.register("subject")}
                    />
                    {form.formState.errors.subject ? (
                      <span className="text-xs text-destructive">
                        {form.formState.errors.subject.message}
                      </span>
                    ) : null}
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Preview text
                    <Input
                      disabled={!compatibility.canEdit}
                      maxLength={180}
                      placeholder="A short inbox preview shown after the subject"
                      {...form.register("preview_text")}
                    />
                  </label>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                    <label className="grid gap-2 text-sm font-medium">
                      Category
                      <Input
                        disabled={!compatibility.canEdit}
                        placeholder="marketing"
                        {...form.register("category")}
                      />
                    </label>
                    <Label className="h-9 px-2">
                      <input
                        className="size-4 accent-foreground"
                        disabled={!compatibility.canEdit}
                        type="checkbox"
                        {...form.register("is_active")}
                      />
                      Active
                    </Label>
                  </div>
                </section>

                <section className="grid gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Content</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Changes appear immediately in the draft preview.
                    </p>
                  </div>
                  <Tabs
                    onValueChange={(value) =>
                      setEditorTab(value as "design" | "source")
                    }
                    value={editorTab}
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger
                        disabled={editorKind !== "visual_v1"}
                        value="design"
                      >
                        <Palette className="size-4" />
                        Design
                      </TabsTrigger>
                      <TabsTrigger value="source">
                        <Code2 className="size-4" />
                        HTML
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent className="mt-3" value="design">
                      <RichTextEditor
                        content={html}
                        onChange={(value) =>
                          form.setValue("html_content", value, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                        onDocumentChange={(root) =>
                          form.setValue(
                            "document",
                            { kind: "tiptap", root, schema_version: 1 },
                            { shouldDirty: true },
                          )
                        }
                        placeholder="Write the email…"
                      />
                    </TabsContent>
                    <TabsContent className="mt-3" value="source">
                      {editorKind === "visual_v1" ? (
                        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                          HTML is compiled from the visual document when you save.
                          Edit the Design tab to preserve round-trip safety.
                        </div>
                      ) : null}
                      <Textarea
                        className="min-h-80 resize-y font-mono text-xs"
                        disabled={
                          !compatibility.canEdit || editorKind === "visual_v1"
                        }
                        {...form.register("html_content")}
                      />
                      {form.formState.errors.html_content ? (
                        <span className="mt-2 block text-xs text-destructive">
                          {form.formState.errors.html_content.message}
                        </span>
                      ) : null}
                    </TabsContent>
                  </Tabs>
                </section>

                <label className="grid gap-2 text-sm font-medium">
                  Plain-text fallback
                  <Textarea
                    className="min-h-32 resize-y font-mono text-xs"
                    disabled={!compatibility.canEdit || editorKind === "visual_v1"}
                    {...form.register("text_content")}
                  />
                </label>

              </div>
            </section>

            <section className="flex min-h-[640px] min-w-0 flex-1 flex-col bg-muted/40 xl:min-h-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
                <div className="flex items-center gap-1">
                  <Button
                    aria-label="Desktop preview"
                    onClick={() => setPreviewDevice("desktop")}
                    size="icon-sm"
                    type="button"
                    variant={previewDevice === "desktop" ? "default" : "ghost"}
                  >
                    <Monitor className="size-4" />
                  </Button>
                  <Button
                    aria-label="Mobile preview"
                    onClick={() => setPreviewDevice("mobile")}
                    size="icon-sm"
                    type="button"
                    variant={previewDevice === "mobile" ? "default" : "ghost"}
                  >
                    <Smartphone className="size-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-1 rounded-md border p-0.5 text-xs">
                  <button
                    className={`rounded px-2 py-1 ${
                      previewMode === "draft"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                    onClick={() => setPreviewMode("draft")}
                    type="button"
                  >
                    Working HTML
                  </button>
                  <button
                    className={`rounded px-2 py-1 ${
                      previewMode === "rendered"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                    disabled={!renderedPreview}
                    onClick={() => setPreviewMode("rendered")}
                    type="button"
                  >
                    Rendered sample
                  </button>
                </div>
              </div>

              <div className="border-b border-border bg-card px-4 py-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Subject
                  </span>
                  <p className="truncate text-sm font-medium">
                    {previewSubject || "Untitled email"}
                  </p>
                </div>
                {previewText ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {previewText}
                  </p>
                ) : null}
                {previewMode === "rendered" ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Sample preview: names, products, images, prices, discounts,
                    and tracking details are illustrative. Live flow emails use
                    the Shopify event data for that customer and order.
                  </p>
                ) : null}
              </div>

              <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4 sm:p-8">
                {previewMode === "rendered" && previewPending ? (
                  <LoadingState label="Rendering template with sample data" />
                ) : previewMode === "rendered" && previewError ? (
                  <div className="grid max-w-md gap-3 rounded-lg border bg-card p-5 text-sm">
                    <p className="font-medium">The rendered preview is unavailable</p>
                    <p className="text-muted-foreground">{previewError}</p>
                    <Button
                      className="w-fit"
                      onClick={() => void loadRenderedPreview(selected.id)}
                      type="button"
                      variant="outline"
                    >
                      <RefreshCw className="size-4" />
                      Try again
                    </Button>
                  </div>
                ) : (
                  <HtmlPreview
                    device={previewDevice}
                    html={previewHtml}
                    title={`${previewSubject || "Untitled email"} preview`}
                  />
                )}
              </div>
            </section>
        </div>
      </EditorWorkspace>
    </form>
  );
}
