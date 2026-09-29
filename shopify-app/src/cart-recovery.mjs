// Identify only consented, known shoppers. Cart contents arrive through Shopify webhooks.
export function createCartRecovery({ window, document, fetch }) {
  const storageKey = "ermes-messaging:recovery-identity";
  let pendingIdentity = null;
  const allowed = () =>
    window.Shopify?.customerPrivacy?.marketingAllowed?.() === true;
  const read = () => {
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };
  const remember = (token) => {
    pendingIdentity = token || null;
    try {
      if (token && allowed()) window.localStorage.setItem(storageKey, token);
      else window.localStorage.removeItem(storageKey);
    } catch {
      /* Storage is optional. */
    }
    // Consent can change while a signup/identity request is in flight. Keep the
    // returned capability only in memory until its server-side binding is revoked.
    if (token && !allowed()) queueMicrotask(() => void identify());
  };
  const cart = async () => {
    const root = window.Shopify?.routes?.root || "/";
    const result = await fetch(`${root}cart.js`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!result.ok) return null;
    return result.json();
  };
  let busy = false;
  let rerun = false;
  let lastToken = null;
  let lastIdentity = null;
  async function identify() {
    const identity = pendingIdentity || read();
    const loggedIn = document.querySelector('[data-customer-logged-in="true"]');
    if (busy) {
      rerun = true;
      return;
    }
    if (document.visibilityState === "hidden" || (!identity && !loggedIn))
      return;
    busy = true;
    try {
      const current = await cart();
      if (!current?.token) return;
      const consent = allowed();
      if (consent && lastToken === current.token && lastIdentity === identity)
        return;
      const response = await fetch("/apps/ermes/recovery/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cart_token: current.token,
          identity_token: identity,
          marketing_allowed: consent,
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (!consent) {
        if (response.ok) remember(null);
        lastToken = null;
        return;
      }
      if (!response.ok) return;
      const result = await response.json();
      if (result.identified) {
        remember(result.identity_token);
        lastToken = current.token;
        lastIdentity = result.identity_token;
      }
    } catch {
      /* Recovery cannot interrupt shopping or signup. */
    } finally {
      busy = false;
      if (rerun) {
        rerun = false;
        void identify();
      }
    }
  }
  return {
    remember,
    async signupContext() {
      if (!allowed()) return {};
      try {
        const current = await cart();
        return current?.token
          ? { recovery_allowed: true, recovery_cart_token: current.token }
          : {};
      } catch {
        return {};
      }
    },
    start() {
      void identify();
      window.setInterval(() => void identify(), 30000);
      document.addEventListener("visitorConsentCollected", () => {
        lastToken = null;
        if (!allowed()) {
          pendingIdentity ||= read();
          try {
            window.localStorage.removeItem(storageKey);
          } catch {
            /* Storage is optional. */
          }
        }
        void identify();
      });
      document.addEventListener("visibilitychange", () => void identify());
      document.addEventListener("cart:updated", () => void identify());
    },
  };
}
