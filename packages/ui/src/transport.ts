export interface AdminTransport {
  apiBase: string;
  fetch?: typeof globalThis.fetch;
}

export function createAdminTransport(host: AdminTransport) {
  if (!host.apiBase.startsWith("/") || host.apiBase.startsWith("//")) {
    throw new Error("The admin transport must use a same-origin API path");
  }
  return (path: string, init?: RequestInit) => {
    if (path.startsWith("/") || path.split("?")[0].split("/").includes("..")) {
      throw new Error("Invalid admin path");
    }
    return (host.fetch ?? globalThis.fetch)(
      `${host.apiBase.replace(/\/$/, "")}/${path}`,
      {
        ...init,
        credentials: "same-origin",
        headers: { "content-type": "application/json", ...init?.headers },
      },
    );
  };
}

let transport = createAdminTransport({ apiBase: "/api/admin" });
export function configureTransport(host: AdminTransport) {
  transport = createAdminTransport(host);
}
export function adminRequest(path: string, init?: RequestInit) {
  return transport(path, init);
}
