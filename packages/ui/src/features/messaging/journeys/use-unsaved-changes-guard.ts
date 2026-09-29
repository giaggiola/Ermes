"use client";

import { useEffect } from "react";

const WARNING =
  "You have unsaved Messaging changes. Leave this page and discard them?";

/**
 * Guards both hard refreshes and links handled by the Next.js app shell.
 * Imperative router navigation still needs to call confirmUnsavedChanges.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const beforeLinkNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      const anchor =
        target instanceof Element
          ? target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.download ||
        new URL(anchor.href, window.location.href).href === window.location.href
      ) {
        return;
      }
      if (!window.confirm(WARNING)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeLinkNavigation, true);
    };
  }, [dirty]);
}

export function confirmUnsavedChanges(dirty: boolean) {
  return !dirty || window.confirm(WARNING);
}
