import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";

import { Button } from "../../../../components/ui/button";
import { MessagingAdminError } from "../../admin-api";

export function EmptyState({ message = "No records yet." }: { message?: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function LoadingState({ label = "Loading messaging data" }: { label?: string }) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-32 items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground"
      role="status"
    >
      <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorState({
  error,
  message,
  onRetry,
}: {
  error?: Error | null;
  message?: string;
  onRetry?: () => void;
}) {
  const adminError =
    error instanceof MessagingAdminError ? error : null;
  const description =
    message ??
    error?.message ??
    "Messaging data could not be loaded.";
  const title =
    adminError?.status === 429
      ? "Messaging is rate limited"
      : adminError?.status === 503 || adminError?.status === 502
        ? "Messaging is temporarily unavailable"
        : "Messaging request failed";

  return (
    <div
      className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-destructive"
        />
        <div className="grid gap-1">
          <p className="font-medium text-destructive">{title}</p>
          <p className="text-muted-foreground">{description}</p>
          {adminError?.requestId ? (
            <p className="font-mono text-xs text-muted-foreground">
              Request {adminError.requestId}
            </p>
          ) : null}
        </div>
      </div>
      {onRetry ? (
        <Button className="w-fit" onClick={onRetry} size="sm" variant="outline">
          <RefreshCw aria-hidden="true" className="size-4" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
