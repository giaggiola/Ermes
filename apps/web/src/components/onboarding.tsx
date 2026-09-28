"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { InstallationStatus } from "@ermes/core/installation";

const steps = ["Your store", "Email delivery", "Shopify", "Ready to explore"];
export function Onboarding({ initial }: { initial: InstallationStatus }) {
  const [status, setStatus] = useState(initial),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function action(name: string, value?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: name, value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      const refreshed = await fetch("/api/onboarding");
      setStatus(await refreshed.json());
      setNotice(
        name === "verify-shopify"
          ? `Connected to ${result.shopName}. Store syncing is not active in this preview.`
          : "Settings saved.",
      );
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(
    event: FormEvent<HTMLFormElement>,
    name: string,
    next?: number,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = Object.fromEntries(
      [...new FormData(form)].filter(
        ([, v]) => name === "merchant" || v !== "",
      ),
    );
    if (await action(name, value)) {
      if (name === "integrations") form.reset();
      if (next !== undefined) setStep(next);
    }
  }
  return (
    <div className="setup-shell">
      <aside className="setup-aside">
        <Link className="wordmark" href="/messaging">
          ermes<span>↗</span>
        </Link>
        <div>
          <p className="eyebrow">LET’S GET YOU SET UP</p>
          <h1>
            A home for every
            <br />
            customer conversation.
          </h1>
          <p>Your store, your audience, your infrastructure.</p>
        </div>
        <nav aria-label="Setup steps">
          {steps.map((name, index) => (
            <button
              key={name}
              aria-current={step === index ? "step" : undefined}
              onClick={() => {
                setStep(index);
                setError("");
                setNotice("");
              }}
            >
              <span>{index + 1}</span>
              {name}
            </button>
          ))}
        </nav>
        <small>You can return to these settings at any time.</small>
      </aside>
      <main className="setup-main">
        <div className="setup-top">
          <span>SETUP / {String(step + 1).padStart(2, "0")}</span>
          <Link href="/messaging">Explore workspace ↗</Link>
        </div>
        {step === 0 && (
          <section>
            <p className="eyebrow">MAKE IT YOURS</p>
            <h2>Tell us about your store.</h2>
            <p className="muted">
              These details personalise your emails. You can change them later.
            </p>
            <form onSubmit={(event) => void submit(event, "merchant", 1)}>
              <label>
                Store name
                <input
                  name="storeName"
                  defaultValue={status.merchant?.storeName}
                  placeholder="Acme Studio"
                  required
                  maxLength={100}
                />
              </label>
              <label>
                Storefront URL
                <input
                  name="storefrontUrl"
                  type="url"
                  defaultValue={status.merchant?.storefrontUrl}
                  placeholder="https://yourstore.com"
                  required
                />
              </label>
              <div className="form-grid">
                <label>
                  Sender name
                  <input
                    name="senderName"
                    defaultValue={status.merchant?.senderName}
                    placeholder="The Acme team"
                    required
                  />
                </label>
                <label>
                  Sender email
                  <input
                    name="senderEmail"
                    type="email"
                    defaultValue={status.merchant?.senderEmail}
                    placeholder="hello@yourstore.com"
                    required
                  />
                </label>
              </div>
              <label>
                Timezone
                <input
                  name="timezone"
                  defaultValue={
                    status.merchant?.timezone ??
                    Intl.DateTimeFormat().resolvedOptions().timeZone
                  }
                  placeholder="Europe/Rome"
                  required
                />
                <small>For example, Europe/Rome or America/New_York.</small>
              </label>
              <label>
                Logo URL <span className="optional">optional</span>
                <input
                  name="logoUrl"
                  type="url"
                  defaultValue={status.merchant?.logoUrl}
                  placeholder="https://yourstore.com/logo.png"
                />
              </label>
              <button className="primary" disabled={busy}>
                Save and continue <span>→</span>
              </button>
            </form>
          </section>
        )}
        {step === 1 && (
          <section>
            <p className="eyebrow">DELIVER WITH CONFIDENCE</p>
            <h2>Connect your email provider.</h2>
            <p className="muted">
              Ermes uses your Resend account. Verify your sending domain in
              Resend before enabling delivery.
            </p>
            <div className="info-box">
              <strong>
                {status.deliveryEnabled
                  ? "Email delivery is enabled"
                  : "Email delivery is paused"}
              </strong>
              <p>Saving credentials does not enable sending.</p>
            </div>
            <form onSubmit={(event) => void submit(event, "integrations", 2)}>
              <label>
                Resend API key{" "}
                <span className="optional">
                  {status.credentials.resendApiKey ? "saved" : ""}
                </span>
                <input
                  name="resendApiKey"
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    status.credentials.resendApiKey
                      ? "Leave blank to keep the saved key"
                      : "re_…"
                  }
                />
              </label>
              <label>
                Resend webhook signing secret{" "}
                <span className="optional">
                  {status.credentials.resendWebhookSecret
                    ? "saved"
                    : "optional during setup"}
                </span>
                <input
                  name="resendWebhookSecret"
                  type="password"
                  autoComplete="new-password"
                  placeholder="whsec_…"
                />
                <small>
                  Configure Resend to send delivery events to{" "}
                  <code>
                    {typeof window !== "undefined"
                      ? window.location.origin
                      : ""}
                    /api/resend/webhook
                  </code>
                  .
                </small>
              </label>
              <p className="muted small">
                Credentials are encrypted before storage and never shown again.
              </p>
              <button className="primary" disabled={busy}>
                Save and continue <span>→</span>
              </button>
            </form>
          </section>
        )}
        {step === 2 && (
          <section>
            <p className="eyebrow">CONNECT YOUR COMMERCE</p>
            <h2>Bring your Shopify app.</h2>
            <p className="muted">
              Use an app created in your Shopify organisation’s Dev Dashboard
              and installed on your store.
            </p>
            <div className="info-box">
              <strong>Connection setup is available in this preview.</strong>
              <p>
                Shopify event syncing and the storefront extension are the next
                milestone. Credentials can be verified now; automations will not
                receive Shopify activity yet.
              </p>
            </div>
            <form onSubmit={(event) => void submit(event, "integrations")}>
              <label>
                Shopify domain
                <input
                  name="shopDomain"
                  placeholder="your-store.myshopify.com"
                  defaultValue={status.shopDomain ?? ""}
                  pattern="[a-z0-9][a-z0-9-]*\.myshopify\.com"
                />
              </label>
              <label>
                Client ID
                <input
                  name="shopifyClientId"
                  autoComplete="off"
                  placeholder={
                    status.credentials.shopifyClientId
                      ? "Saved — leave blank to keep"
                      : "App client ID"
                  }
                />
              </label>
              <label>
                Client secret
                <input
                  name="shopifyClientSecret"
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    status.credentials.shopifyClientSecret
                      ? "Saved — leave blank to keep"
                      : "App client secret"
                  }
                />
              </label>
              <small>
                Connection verification checks read_orders, read_customers and
                read_products permissions. The app and store must belong to the
                same organisation.
              </small>
              <div className="button-row">
                <button className="primary" disabled={busy}>
                  Save credentials
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={busy || !status.credentials.shopifyClientSecret}
                  onClick={() => void action("verify-shopify")}
                >
                  Verify connection
                </button>
              </div>
            </form>
            {status.shopifyVerifiedAt && (
              <p className="success">
                Credentials verified. Store syncing is not active yet.
              </p>
            )}
            <button className="text-button" onClick={() => setStep(3)}>
              Continue to workspace →
            </button>
          </section>
        )}
        {step === 3 && (
          <section>
            <p className="eyebrow">YOUR NEXT CHAPTER</p>
            <h2>Your workspace is ready to explore.</h2>
            <p className="muted">
              Build templates, organise subscribers and design your first flow.
              Everything starts as a draft.
            </p>
            <div className="checklist">
              <p>
                <span>{status.merchant ? "✓" : "○"}</span> Store and sender
                details
              </p>
              <p>
                <span>{status.credentials.resendApiKey ? "✓" : "○"}</span> Email
                provider credentials
              </p>
              <p>
                <span>{status.shopifyVerifiedAt ? "✓" : "○"}</span> Shopify
                credentials verified
              </p>
              <p>
                <span>○</span> Shopify event syncing — coming next
              </p>
            </div>
            <div className="info-box">
              <strong>
                {status.deliveryEnabled
                  ? "Live sending enabled"
                  : "Sending is paused"}
              </strong>
              <p>
                Enable only after your Resend sender domain is verified.
                Published flows and scheduled campaigns can then send real
                emails.
              </p>
              <label className="checkbox-label">
                <input id="confirmed-sender" type="checkbox" /> I have verified
                my sender domain in Resend.
              </label>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void action("delivery", {
                    enabled: !status.deliveryEnabled,
                    confirmedSender: (
                      document.getElementById(
                        "confirmed-sender",
                      ) as HTMLInputElement
                    ).checked,
                  })
                }
              >
                {status.deliveryEnabled
                  ? "Pause email delivery"
                  : "Enable email delivery"}
              </button>
            </div>
            <Link className="primary" href="/messaging">
              Open your workspace <span>↗</span>
            </Link>
          </section>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="success">
            {notice}
          </p>
        )}
      </main>
    </div>
  );
}
