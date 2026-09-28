"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function AuthForm({
  setup = false,
  requireSetupKey = false,
}: {
  setup?: boolean;
  requireSetupKey?: boolean;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(`/api/auth/${setup ? "setup" : "login"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      router.push(setup ? "/onboarding" : "/messaging");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-card">
        <a className="wordmark" href="/">
          ermes<span>↗</span>
        </a>
        <p className="eyebrow">YOUR STORE. YOUR MESSAGES.</p>
        <h1>{setup ? "Make yourself at home." : "Welcome back."}</h1>
        <p className="muted">
          {setup
            ? "Create the owner account for this Ermes installation."
            : "Sign in to your messaging workspace."}
        </p>
        <form onSubmit={submit}>
          {setup && requireSetupKey && (
            <label>
              Setup key
              <input
                name="setupToken"
                type="password"
                autoComplete="off"
                required
              />
              <small>
                This installation requires a setup key. Use ERMES_SETUP_TOKEN
                from your server’s .env file.
              </small>
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@yourstore.com"
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={setup ? "new-password" : "current-password"}
              minLength={12}
              maxLength={128}
              required
            />
            <small>At least 12 characters.</small>
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : setup
                ? "Create your workspace"
                : "Sign in"}
            <span>→</span>
          </button>
        </form>
        <a className="source-link" href="https://github.com/giaggiola/Ermes">
          Ermes source code · AGPLv3
        </a>
      </div>
    </main>
  );
}
