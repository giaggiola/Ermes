import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

interface EditorWorkspaceProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  header?: ReactNode;
}

/**
 * Full-height workspace shared by feature editors.
 *
 * The application shell owns the viewport. Editors own one bounded scrolling
 * region beneath an optional toolbar, which prevents nested document scroll.
 */
export function EditorWorkspace({
  children,
  className,
  disabled = false,
  header,
}: EditorWorkspaceProps) {
  return (
    <section
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      {header ? <div className="shrink-0">{header}</div> : null}
      <div
        aria-disabled={disabled || undefined}
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-hidden",
          disabled && "pointer-events-none opacity-70",
        )}
      >
        {children}
      </div>
    </section>
  );
}
