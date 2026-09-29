export function createPopupSessionState() {
  let dismissedForPage = false;

  return {
    canOpen(persistentlySuppressed = false) {
      return !dismissedForPage && !persistentlySuppressed;
    },
    dismiss() {
      dismissedForPage = true;
    },
  };
}
