"use client";
import Link from "next/link";
import { useState, useEffect, type FormEvent } from "react";
import type {
  InstallationStatus,
  MerchantSettings,
} from "@ermes/core/installation";

const steps = [
  "Your store",
  "Email delivery",
  "Shopify",
  "Image storage",
  "Ready to explore",
];
export function Onboarding({
  initial,
  initialStep = 0,
}: {
  initial: InstallationStatus;
  initialStep?: number;
}) {
  const [status, setStatus] = useState(initial),
    [step, setStep] = useState(initialStep),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [importRequested, setImportRequested] = useState(false),
    [merchant, setMerchant] = useState<MerchantSettings>(
      initial.merchant ?? {
        storeName: "",
        storefrontUrl: "",
        senderName: "",
        senderEmail: "",
        logoUrl: "",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    );
  useEffect(() => {
    if (step !== 2 || !status.shopifyConnectorActive) return;
    const timer = setInterval(() => {
      void fetch("/api/onboarding")
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => {
          if (s) setStatus(s);
        })
        .catch(() => undefined);
    }, 10000);
    return () => clearInterval(timer);
  }, [step, status.shopifyConnectorActive]);
  const field = (name: keyof MerchantSettings) => ({
    value: merchant[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setMerchant((current) => ({ ...current, [name]: event.target.value })),
  });
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
      if (name === "import-shopify-store") {
        setMerchant((current) => ({
          ...current,
          ...result.profile,
          senderName: current.senderName || result.profile.senderName,
          senderEmail: current.senderEmail || result.profile.senderEmail,
        }));
        setStep(0);
        setNotice(
          "Store details imported. Review them below, then save to continue. Your sender and logo choices are kept.",
        );
      } else
        setNotice(
          name === "verify-shopify"
            ? `Connected to ${result.shopName}.`
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
      if (name === "integrations" && importRequested && step === 2) {
        if (await action("import-shopify-store")) setImportRequested(false);
      } else if (next !== undefined) setStep(next);
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
              disabled={busy}
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
            <div className="info-box">
              <strong>Already on Shopify?</strong>
              <p>
                Import your store name, URL, timezone and a suggested sender.
                Review everything before saving.
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    status.credentials.shopifyClientId &&
                    status.credentials.shopifyClientSecret &&
                    status.shopDomain
                  )
                    void action("import-shopify-store");
                  else {
                    setImportRequested(true);
                    setStep(2);
                    setError("");
                    setNotice("");
                  }
                }}
              >
                Import from Shopify <span>→</span>
              </button>
            </div>
            <p className="small">Or enter your details manually below.</p>
            <form onSubmit={(event) => void submit(event, "merchant", 1)}>
              <label>
                Store name
                <input
                  name="storeName"
                  {...field("storeName")}
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
                  {...field("storefrontUrl")}
                  placeholder="https://yourstore.com"
                  required
                />
              </label>
              <div className="form-grid">
                <label>
                  Sender name
                  <input
                    name="senderName"
                    {...field("senderName")}
                    placeholder="The Acme team"
                    required
                  />
                </label>
                <label>
                  Sender email
                  <input
                    name="senderEmail"
                    type="email"
                    {...field("senderEmail")}
                    placeholder="hello@yourstore.com"
                    required
                  />
                  <small>
                    Confirm an address on your verified sending domain.
                    Shopify’s contact email is a suggestion.
                  </small>
                </label>
              </div>
              <label>
                Timezone
                <input
                  name="timezone"
                  {...field("timezone")}
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
                  {...field("logoUrl")}
                  placeholder="https://yourstore.com/logo.png"
                />
                <small>
                  Add your email logo if needed; it is not imported from
                  Shopify.
                </small>
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
            <form
              onSubmit={(event) =>
                void submit(
                  event,
                  "integrations",
                  status.shopifyVerifiedAt ? 3 : 2,
                )
              }
            >
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
            <h2>
              {importRequested
                ? "Connect Shopify to import your store."
                : "Connect your Shopify store."}
            </h2>
            <p className="muted">
              Use an app created in your Shopify organisation’s Dev Dashboard
              and installed on your store.
            </p>
            <div className="info-box">
              <strong>
                {status.shopifyConnectorActive
                  ? "Shopify syncing is active"
                  : "Connect, then start syncing"}
              </strong>
              <p>
                Import customers, products and the last 60 days of orders. New
                activity can start published flows. Historical imports never
                send emails.
              </p>
              <p>
                <a
                  href="https://github.com/giaggiola/Ermes/blob/main/docs/shopify.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Shopify app and storefront setup guide ↗
                </a>
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
                  {importRequested
                    ? "Save and import store details"
                    : "Save credentials"}
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
              <div className="info-box">
                <strong>
                  {status.shopifyConnectorActive
                    ? "Syncing your store"
                    : "Ready to sync"}
                </strong>
                <p>
                  For live order and cart events, publish the app configuration
                  with a public HTTPS Ermes address. Enable the Ermes theme
                  embed to show published signup forms and identify consenting
                  shoppers.
                </p>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void action("shopify-sync", {
                      enabled: !status.shopifyConnectorActive,
                    })
                  }
                >
                  {status.shopifyConnectorActive
                    ? "Pause Shopify sync"
                    : "Start Shopify sync"}
                </button>
                {status.shopifySync && (
                  <div className="small">
                    <p>
                      {status.shopifySync.counts.customer ?? 0} customers ·{" "}
                      {status.shopifySync.counts.product ?? 0} products ·{" "}
                      {status.shopifySync.counts.order ?? 0} orders
                    </p>
                    <p>
                      Initial import:{" "}
                      {status.shopifySync.completed.length === 3
                        ? "complete"
                        : status.shopifySync.completed.join(", ") ||
                          "waiting for worker"}
                    </p>
                    <p>
                      Last webhook:{" "}
                      {status.shopifySync.lastWebhookAt
                        ? new Date(
                            status.shopifySync.lastWebhookAt,
                          ).toLocaleString()
                        : "not received yet"}
                    </p>
                    <p>
                      Checkout scan:{" "}
                      {status.shopifySync.lastRecoveryAt
                        ? new Date(
                            status.shopifySync.lastRecoveryAt,
                          ).toLocaleString()
                        : "not run yet"}
                    </p>
                    {status.shopifySync.failedJobs > 0 && (
                      <p className="error">
                        {status.shopifySync.failedJobs} jobs are waiting to
                        retry. Check your Shopify app permissions.
                      </p>
                    )}
                    {status.shopifySync.error && (
                      <p className="error">{status.shopifySync.error}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setStep(importRequested ? 0 : 3);
                setImportRequested(false);
                setError("");
                setNotice("");
              }}
            >
              {importRequested
                ? "Enter store details manually →"
                : "Continue to image storage →"}
            </button>
          </section>
        )}
        {step === 3 && (
          <section>
            <p className="eyebrow">YOUR IMAGE LIBRARY</p>
            <h2>Connect image storage.</h2>
            <p className="muted">
              Use your Cloudinary account to upload images for signup forms and
              your email logo. Images stay available when Ermes is updated or
              restarted.
            </p>
            <div className="info-box">
              <strong>
                {[
                  "cloudinaryCloudName",
                  "cloudinaryApiKey",
                  "cloudinaryApiSecret",
                ].every((key) => status.credentials[key])
                  ? "Cloudinary credentials saved"
                  : "Image uploads are not configured yet"}
              </strong>
              <p>
                Find your cloud name, API key and API secret in your Cloudinary
                console. Uploaded images will be publicly accessible.
              </p>
              <a
                href="https://console.cloudinary.com/"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Open Cloudinary console ↗
              </a>
            </div>
            <form onSubmit={(event) => void submit(event, "integrations", 4)}>
              <label>
                Cloud name{" "}
                <span className="optional">
                  {status.credentials.cloudinaryCloudName ? "saved" : ""}
                </span>
                <input
                  name="cloudinaryCloudName"
                  autoComplete="off"
                  pattern="[a-z0-9_-]{1,128}"
                  placeholder={
                    status.credentials.cloudinaryCloudName
                      ? "Leave blank to keep the saved cloud name"
                      : "Your Cloudinary cloud name"
                  }
                />
              </label>
              <label>
                API key{" "}
                <span className="optional">
                  {status.credentials.cloudinaryApiKey ? "saved" : ""}
                </span>
                <input
                  name="cloudinaryApiKey"
                  type="password"
                  autoComplete="new-password"
                  pattern="[0-9]{5,64}"
                  placeholder={
                    status.credentials.cloudinaryApiKey
                      ? "Leave blank to keep the saved key"
                      : "Cloudinary API key"
                  }
                />
              </label>
              <label>
                API secret{" "}
                <span className="optional">
                  {status.credentials.cloudinaryApiSecret ? "saved" : ""}
                </span>
                <input
                  name="cloudinaryApiSecret"
                  type="password"
                  autoComplete="new-password"
                  minLength={16}
                  maxLength={512}
                  placeholder={
                    status.credentials.cloudinaryApiSecret
                      ? "Leave blank to keep the saved secret"
                      : "Cloudinary API secret"
                  }
                />
              </label>
              <p className="muted small">
                Credentials are encrypted before storage. Blank fields keep
                saved values. Your first upload checks the connection.
              </p>
              <button className="primary" disabled={busy}>
                Save and continue <span>→</span>
              </button>
            </form>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setStep(4);
                setError("");
                setNotice("");
              }}
            >
              Skip for now — use existing image URLs →
            </button>
          </section>
        )}
        {step === 4 && (
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
                <span>{status.shopifyConnectorActive ? "✓" : "○"}</span> Shopify
                syncing {status.shopifyConnectorActive ? "active" : "paused"}
              </p>
              <p>
                <span>
                  {[
                    "cloudinaryCloudName",
                    "cloudinaryApiKey",
                    "cloudinaryApiSecret",
                  ].every((key) => status.credentials[key])
                    ? "✓"
                    : "○"}
                </span>{" "}
                Image storage credentials
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
