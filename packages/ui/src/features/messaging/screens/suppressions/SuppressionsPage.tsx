"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Ban, Plus, Trash2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { EmptyState, ErrorState, LoadingState } from "../../components/admin/empty-state";
import { PageHeader } from "../../components/admin/page-header";
import { StatusBadge } from "../../components/admin/status-badge";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table";
import type { MessageSuppression } from "../../admin-types";
import { useMessagingCompatibility } from "../../contract";
import { useAdminCreate, useAdminDelete, useMessageSuppressions } from "../../use-admin";

const suppressionSchema = z.object({
  email: z.string().email(),
  reason: z.enum(["bounce", "complaint", "manual", "unsubscribe"]),
});

type SuppressionForm = z.infer<typeof suppressionSchema>;

export default function SuppressionsPage() {
  const compatibility = useMessagingCompatibility();
  const suppressions = useMessageSuppressions();
  const addSuppression = useAdminCreate<SuppressionForm & { source: string }>("message-suppressions", [
    "message-suppressions",
    "dashboard",
  ]);
  const removeSuppression = useAdminDelete("message-suppressions", ["message-suppressions", "dashboard"]);
  const form = useForm<SuppressionForm>({
    defaultValues: { email: "", reason: "manual" },
    resolver: zodResolver(suppressionSchema),
  });
  const selectedReason = useWatch({
    control: form.control,
    name: "reason",
  });

  async function onSubmit(values: SuppressionForm) {
    if (!compatibility.canEdit) return;
    try {
      await addSuppression.mutateAsync({ ...values, source: "admin" });
      form.reset({ email: "", reason: "manual" });
      toast.success("Suppression added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression add failed");
    }
  }

  async function clear(suppression: MessageSuppression) {
    if (!compatibility.canEdit) return;
    if (
      !window.confirm(
        `Clear the ${suppression.reason} suppression for ${suppression.email}? Future eligible email may resume.`,
      )
    ) {
      return;
    }
    try {
      await removeSuppression.mutateAsync(suppression.id);
      toast.success("Suppression cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Clear failed");
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Suppressions" description="Review hard bounces, complaints, manual blocks, and unsubscribe suppressions." />

      {suppressions.error ? (
        <ErrorState
          error={suppressions.error}
          onRetry={() => void suppressions.refetch()}
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ban className="size-4" />
              Manual Add
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
              <label className="grid gap-2 text-sm font-medium">
                Email
                <Input type="email" {...form.register("email")} />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Reason
                <Select value={selectedReason} onValueChange={(value) => form.setValue("reason", value as SuppressionForm["reason"])}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="bounce">Bounce</SelectItem>
                    <SelectItem value="complaint">Complaint</SelectItem>
                    <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <Button
                disabled={!compatibility.canEdit || addSuppression.isPending}
                type="submit"
              >
                <Plus className="size-4" />
                Add
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Active Suppressions</CardTitle>
          </CardHeader>
          <CardContent>
            {suppressions.isPending ? (
              <LoadingState label="Loading suppressions" />
            ) : suppressions.error ? null : (suppressions.data ?? []).length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(suppressions.data ?? []).map((suppression) => (
                    <TableRow key={suppression.id}>
                      <TableCell className="font-medium">{suppression.email}</TableCell>
                      <TableCell>
                        <StatusBadge value={suppression.reason} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{suppression.source}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {suppression.created_at ? format(new Date(suppression.created_at), "MMM d, yyyy HH:mm") : "unknown"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          disabled={
                            !compatibility.canEdit ||
                            removeSuppression.isPending
                          }
                          size="sm"
                          variant="outline"
                          onClick={() => clear(suppression)}
                        >
                          <Trash2 className="size-4" />
                          Clear
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState message="No active suppressions." />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
