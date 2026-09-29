"use client";

import { useState } from "react";

export type ShopifySetupInfo = {
  origin: string;
  httpsConfigured: boolean;
  appUrl: string;
  scopes: string;
  apiVersion: string;
};

export function ShopifySetupGuide({
  info,
  clientId,
}: {
  info: ShopifySetupInfo;
  clientId: string;
}) {
  const [message, setMessage] = useState("");
  const [downloading, setDownloading] = useState(false);
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage("Select the value below and copy it from your browser.");
    }
  }
  async function download() {
    setDownloading(true);
    setMessage("");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "shopify-app-config",
          value: { clientId },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      const url = URL.createObjectURL(
        new Blob([result.configuration], { type: "text/plain" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "shopify.app.toml";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        "Downloaded. Save this file in the shopify-app folder, then follow the publishing guide.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not download the configuration.",
      );
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className="shopify-guide">
      <ol>
        <li>
          <strong>Create an app for your store</strong>
          <p>
            Open the Dev Dashboard in the organisation that owns your store.
            Choose <b>Create app → Start from Dev Dashboard</b> and name it
            Ermes.
          </p>
          <a href="https://dev.shopify.com/" target="_blank" rel="noreferrer">
            Open Shopify Dev Dashboard ↗
          </a>
        </li>
        <li>
          <strong>Configure and release a version</strong>
          <p>
            Open <b>Versions</b>, add the settings below, turn off embedding in
            Shopify admin, then select <b>Release</b>.
          </p>
          <details className="shopify-settings">
            <summary>App settings and configuration</summary>
            <div className="setup-copy-field">
              <label htmlFor="shopify-app-url">App URL</label>
              <button
                type="button"
                onClick={() => void copy(info.appUrl, "App URL")}
              >
                Copy URL
              </button>
              <input
                id="shopify-app-url"
                value={info.appUrl}
                readOnly
                onFocus={(event) => event.target.select()}
              />
            </div>
            <div className="setup-copy-field">
              <label htmlFor="shopify-app-scopes">Access scopes</label>
              <button
                type="button"
                onClick={() => void copy(info.scopes, "Scopes")}
              >
                Copy scopes
              </button>
              <textarea
                id="shopify-app-scopes"
                value={info.scopes}
                rows={4}
                readOnly
                onFocus={(event) => event.target.select()}
              />
            </div>
            <p>
              Webhooks API version: <code>{info.apiVersion}</code>. Enable
              protected customer data access if Shopify requests it.
            </p>
            <p>
              To receive live events and add storefront forms, publish the
              supplied app configuration and theme extension with Shopify CLI.
            </p>
            <button
              className="secondary"
              type="button"
              disabled={downloading}
              onClick={() => void download()}
            >
              {downloading ? "Preparing…" : "Download app configuration"}
            </button>
            <p>
              The download uses the client ID entered below, or a placeholder to
              replace. It contains no secret.
            </p>
            {!info.httpsConfigured && (
              <p>
                Your installation uses a local address. The download includes an
                example URL to replace with your public HTTPS Ermes address
                before publishing. You can connect and import over your SSH
                tunnel.
              </p>
            )}
            <a
              href="https://github.com/giaggiola/Ermes/blob/main/docs/shopify.md#3-publish-the-app-configuration-and-extension"
              target="_blank"
              rel="noreferrer"
            >
              Configuration and extension publishing guide ↗
            </a>
            {message && <p role="status">{message}</p>}
          </details>
        </li>
        <li>
          <strong>Install the app and copy its credentials</strong>
          <p>
            Choose <b>Install app</b>, select your store and approve access. In
            the app’s <b>Settings</b>, copy the client ID and client secret into
            the fields below.
          </p>
        </li>
      </ol>
    </div>
  );
}

export function ShopifyStorefrontSetup({ shopDomain }: { shopDomain: string }) {
  return (
    <div className="info-box">
      <strong>Next: enable your storefront forms</strong>
      <p>
        Publish the app configuration and theme extension using the{" "}
        <a
          href="https://github.com/giaggiola/Ermes/blob/main/docs/shopify.md#3-publish-the-app-configuration-and-extension"
          target="_blank"
          rel="noreferrer"
        >
          publishing guide ↗
        </a>
        . Live events and forms need a public HTTPS Ermes address.
      </p>
      <p>
        In Shopify’s theme editor, open <b>App embeds</b>, enable{" "}
        <b>Ermes signup forms</b>, and click <b>Save</b>. Then publish a popup
        or flyout in Ermes.
      </p>
      <a
        className="secondary"
        href={`https://${shopDomain}/admin/themes/current/editor?context=apps`}
        target="_blank"
        rel="noreferrer"
      >
        Open Shopify theme editor ↗
      </a>
    </div>
  );
}
