"use client";

import { cn } from "../../../../lib/utils";

export type PreviewDevice = "desktop" | "mobile";

interface HtmlPreviewProps {
  className?: string;
  device?: PreviewDevice;
  html: string;
  title?: string;
}

const emptyDocument = `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="font-family: Arial, sans-serif; margin: 0; padding: 32px; color: #6b7280;">
    Nothing to preview yet.
  </body>
</html>`;

/**
 * Render email markup in an isolated browser document.
 *
 * A read-only Tiptap instance is useful for rich-text content, but it normalizes
 * email markup and drops document-level styles. The sandboxed iframe preserves
 * the template's tables, inline CSS, media queries, and complete HTML document
 * while preventing scripts and top-level navigation from running.
 */
export function HtmlPreview({
  className,
  device = "desktop",
  html,
  title = "Email preview",
}: HtmlPreviewProps) {
  return (
    <div
      className={cn(
        "h-full min-h-[560px] w-full overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/10 transition-[max-width] duration-200",
        device === "mobile" ? "max-w-[390px]" : "max-w-[720px]",
        className,
      )}
    >
      <iframe
        className="h-full min-h-[560px] w-full border-0 bg-white"
        referrerPolicy="no-referrer"
        sandbox=""
        srcDoc={html.trim() ? html : emptyDocument}
        title={title}
      />
    </div>
  );
}
