"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { configureTransport } from "./transport";

export interface ErmesHost {
  /** Same-origin base path; no service credentials belong in browser code. */
  apiBase: string;
  fetch?: typeof globalThis.fetch;
  pickImage?: () => Promise<string | undefined>;
}
const Host = createContext<ErmesHost>({ apiBase: "/api/admin" });

export function ErmesProvider({
  host,
  children,
}: {
  host: ErmesHost;
  children: ReactNode;
}) {
  // Each application installs one transport. Host functions contain no user/session
  // data: cookies are attached by the application's fetch implementation at call time.
  useLayoutEffect(() => configureTransport(host), [host]);
  return <Host.Provider value={host}>{children}</Host.Provider>;
}

export const useErmesHost = () => useContext(Host);
