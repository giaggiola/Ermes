"use client";

import { useErmesHost } from "../../../../host";
import { createDefaultSignupForm } from "../../contracts/signup-form-schema";
import { MoreHorizontal, Plus, Pencil, ChartNoAxesCombined } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState } from "../../components/admin/empty-state";
import { PageHeader } from "../../components/admin/page-header";
import { StatusBadge } from "../../components/admin/status-badge";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent } from "../../../../components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table";
import type { SignupForm } from "../../admin-types";
import {
  useAdminCreate,
  useAdminDelete,
  useSignupForms,
} from "../../use-admin";
import { useMessagingCompatibility } from "../../contract";

export default function FormsPage() {
  const router = useRouter();
  const experimentsEnabled = Boolean(useErmesHost().formExperiments);
  const compatibility = useMessagingCompatibility();
  const forms = useSignupForms();
  const createForm = useAdminCreate<Record<string, unknown>>("signup-forms", ["signup-forms"]);
  const deleteForm = useAdminDelete("signup-forms", ["signup-forms"]);

  const rows = forms.data ?? [];

  async function create() {
    if (!compatibility.canEdit) return;
    try {
      const created = (await createForm.mutateAsync({
        name: "Untitled form",
        type: "popup",
        status: "draft",
        document: createDefaultSignupForm(),
      })) as { signup_form?: SignupForm };
      const id = created.signup_form?.id;
      if (id) router.push(`/messaging/forms/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create form");
    }
  }

  async function remove(form: SignupForm) {
    if (!compatibility.canEdit) return;
    if (!window.confirm(`Delete "${form.name}"? This cannot be undone.`)) return;
    try {
      await deleteForm.mutateAsync(form.id);
      toast.success("Form deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete form");
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Sign-up forms"
        description="Build the pop-ups and flyouts that collect newsletter subscribers on the storefront."
        actions={
          <Button onClick={create} disabled={!compatibility.canEdit || createForm.isPending}>
            <Plus className="size-4" />
            Create form
          </Button>
        }
      />

      {forms.error ? (
        <ErrorState error={forms.error} onRetry={() => void forms.refetch()} />
      ) : null}
      <Card className="gap-0 rounded-lg py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <span className="text-sm text-muted-foreground">Manage form content, targeting, and publishing.</span>
        </div>
        <CardContent className="px-0 py-2">
          {forms.isPending ? (
            <LoadingState label="Loading sign-up forms" />
          ) : forms.error ? null : rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Edit</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((form) => {
                  return (
                    <TableRow key={form.id} className="cursor-pointer" onClick={() => router.push(`/messaging/forms/${form.id}`)}>
                      <TableCell>
                        <div className="grid gap-1">
                          <span className="font-medium">{form.name}</span>
                          <span className="text-xs capitalize text-muted-foreground">{form.type}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={form.status === "published" ? "active" : "draft"} />
                      </TableCell>
                      <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                        <Button asChild size="sm" variant="outline"><Link href={`/messaging/forms/${form.id}`}><Pencil className="size-4" />Edit form</Link></Button>
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button aria-label={`Actions for ${form.name}`} size="icon-sm" variant="ghost">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => router.push(`/messaging/forms/${form.id}`)}>
                              Edit form
                            </DropdownMenuItem>
                            {experimentsEnabled && <DropdownMenuItem onSelect={() => router.push(`/messaging/forms/${form.id}/experiment`)}>
                              A/B tests and results
                            </DropdownMenuItem>}
                            <DropdownMenuItem
                              disabled={!compatibility.canEdit}
                              onSelect={() => void remove(form)}
                              variant="destructive"
                            >
                              Delete form
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState message="No sign-up forms yet. Create one to replace the storefront pop-up." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
