"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "../../../../components/ui/button";
import { Card, CardContent } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { adminFetch, jsonBody } from "../../admin-api";
import type {
  EmailTemplate,
  TemplatePreview,
} from "../../admin-types";
import { EmptyState, ErrorState, LoadingState } from "../../components/admin/empty-state";
import { PageHeader } from "../../components/admin/page-header";
import { StatusBadge } from "../../components/admin/status-badge";
import { useMessagingCompatibility } from "../../contract";
import {
  useAdminCreate,
  useEmailTemplates,
} from "../../use-admin";
import { displayTemplateName } from "./template-labels";

const newTemplate = {
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
  is_active: false,
  name: "Untitled template",
  preview_text: "",
  subject: "Untitled email",
  text_content: "Hello {{first_name}},",
};

function TemplateThumbnail({ template }: { template: EmailTemplate }) {
  const preview = useQuery({
    queryFn: () =>
      adminFetch<TemplatePreview>(
        `email-templates/${encodeURIComponent(template.id)}/preview`,
        jsonBody({ context: {} }),
      ),
    queryKey: ["messaging", "email-template-preview", template.id],
    staleTime: 60_000,
  });

  if (preview.isPending) {
    return (
      <div className="grid h-56 place-items-center bg-[#efefef] text-xs text-muted-foreground">
        Rendering preview…
      </div>
    );
  }

  if (!preview.data?.preview.html) {
    return (
      <div className="grid h-56 place-items-center bg-muted/40 px-6 text-center text-xs text-muted-foreground">
        Preview unavailable
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative h-56 overflow-hidden bg-[#efefef]"
    >
      <iframe
        className="absolute left-1/2 top-0 h-[540px] w-[640px] origin-top -translate-x-1/2 scale-[0.42] border-0 bg-white"
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox=""
        srcDoc={preview.data.preview.html}
        tabIndex={-1}
        title={`${displayTemplateName(template.name)} thumbnail`}
      />
    </div>
  );
}

export default function TemplateLibraryPage() {
  const router = useRouter();
  const compatibility = useMessagingCompatibility();
  const templates = useEmailTemplates();
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const createTemplate = useAdminCreate<Record<string, unknown>>(
    "email-templates",
    ["email-templates", "dashboard"],
  );

  async function create() {
    if (!compatibility.canEdit || createTemplate.isPending) return;
    try {
      const result = (await createTemplate.mutateAsync(newTemplate)) as {
        email_template?: EmailTemplate;
      };
      const id = result.email_template?.id;
      if (!id) throw new Error("The template was created without an id");
      router.push(`/messaging/templates/${encodeURIComponent(id)}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Template creation failed",
      );
    }
  }

  const categories = useMemo(
    () => Array.from(new Set((templates.data ?? []).map((template) => template.category).filter((value): value is string => Boolean(value)))).sort(),
    [templates.data],
  );
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (templates.data ?? []).filter((template) => {
      if (category !== "all" && template.category !== category) return false;
      if (!query) return true;
      return [displayTemplateName(template.name), template.subject, template.category ?? ""].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [category, search, templates.data]);

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <Button
            disabled={!compatibility.canEdit || createTemplate.isPending}
            onClick={() => void create()}
          >
            <Plus className="size-4" />
            New template
          </Button>
        }
        description="Browse emails rendered with clearly labelled sample commerce data, then open one to edit its content, delivery details, and published version."
        title="Email templates"
      />

      {templates.error ? (
        <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
      ) : templates.isPending ? (
        <LoadingState label="Loading email templates" />
      ) : (templates.data ?? []).length > 0 ? (
        <div className="grid gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search templates"
                value={search}
              />
            </div>
            <Select onValueChange={setCategory} value={category}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {rows.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((template) => (
            <Link
              className="group rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={`/messaging/templates/${encodeURIComponent(template.id)}`}
              key={template.id}
            >
              <Card className="h-full cursor-pointer overflow-hidden rounded-lg py-0 transition-colors group-hover:border-foreground/30">
                <TemplateThumbnail template={template} />
                <CardContent className="grid gap-3 border-t p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold group-hover:underline">
                        {displayTemplateName(template.name)}
                      </h2>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {template.subject}
                      </p>
                    </div>
                    <StatusBadge
                      label={!template.is_active ? "Disabled" : template.published_version_id ? "Published" : "Draft"}
                      value={!template.is_active ? "paused" : template.published_version_id ? "active" : "draft"}
                    />
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="capitalize">
                      {template.category ?? "uncategorized"}
                    </span>
                    {template.draft_version_id !== template.published_version_id ? (
                      <span className="text-amber-600">Changes not published</span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
            </div>
          ) : (
            <Card className="rounded-lg">
              <CardContent className="grid min-h-56 place-items-center">
                <EmptyState message="No templates match the current filters." />
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="rounded-lg">
          <CardContent className="grid min-h-72 place-items-center">
            <EmptyState
              message="No email templates yet. Create a blank template to get started."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
