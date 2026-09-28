import { adminRequest } from "../../transport";

export class MessagingAdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message);
    this.name = "MessagingAdminError";
  }
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await adminRequest(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = (await response.json()) as {
        detail?: string;
        error?: string;
        message?: string;
      };
      message = body.detail ?? body.message ?? body.error ?? message;
    } catch {
      // Keep the HTTP status message.
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new MessagingAdminError(
      message,
      response.status,
      response.headers.get("x-request-id"),
      Number.isFinite(retryAfter) ? retryAfter : null,
    );
  }

  return (await response.json()) as T;
}

export function jsonBody(body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    method: "POST",
  };
}

export function patchBody(body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    method: "PATCH",
  };
}

export function deleteInit(): RequestInit {
  return {
    method: "DELETE",
  };
}
