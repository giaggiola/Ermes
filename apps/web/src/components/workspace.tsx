"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { MessagingContractProvider } from "@ermes/ui";
import { StandaloneErmesProvider } from "./image-picker";
const links = [
  ["", "Overview"],
  ["templates", "Templates"],
  ["campaigns", "Campaigns"],
  ["flows", "Flows"],
  ["forms", "Signup forms"],
  ["profiles", "Subscribers"],
  ["segments", "Segments"],
  ["events", "Activity"],
  ["suppressions", "Suppressions"],
  ["runtime", "Sender settings"],
];
export function Workspace({
  children,
  email,
}: {
  children: ReactNode;
  email: string;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  const path = usePathname(),
    router = useRouter();
  const editor = /\/messaging\/(flows|templates|forms)\/[^/]+$/.test(path);
  return (
    <QueryClientProvider client={client}>
      <StandaloneErmesProvider>
        <MessagingContractProvider>
          <div className="workspace">
            <aside className="workspace-nav">
              <Link className="wordmark" href="/messaging">
                ermes<span>↗</span>
              </Link>
              <p className="eyebrow">MESSAGING WORKSPACE</p>
              <nav>
                {links.map(([route, label]) => (
                  <Link
                    key={route}
                    href={`/messaging${route ? "/" + route : ""}`}
                    aria-current={
                      path === `/messaging${route ? "/" + route : ""}`
                        ? "page"
                        : undefined
                    }
                  >
                    {label}
                  </Link>
                ))}
              </nav>
              <div className="nav-bottom">
                <Link href="/onboarding">Connections & setup ↗</Link>
                <a href="https://github.com/giaggiola/Ermes">
                  Source code · AGPLv3
                </a>
                <small>{email}</small>
                <button
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    router.push("/login");
                    router.refresh();
                  }}
                >
                  Sign out
                </button>
              </div>
            </aside>
            <main
              className={
                editor
                  ? "workspace-content editor-content"
                  : "workspace-content"
              }
            >
              <div className="workspace-top">
                <span>ERMES / PRIVATE WORKSPACE</span>
                <Link href="/onboarding">Installation settings ↗</Link>
              </div>
              {children}
            </main>
          </div>
          <Toaster richColors />
        </MessagingContractProvider>
      </StandaloneErmesProvider>
    </QueryClientProvider>
  );
}
