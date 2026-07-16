// Shared HTTP transport for the dashboard API client: typed fetch
// helpers + ApiError. Used only by the ./api/<domain>.ts slices;
// callers import ApiError via the lib/api.ts barrel.
export class ApiError extends Error {
  /** Server-classified fields from the JSON error body (formatError, via
   *  setErrorHandler in src/server/server.ts): a stable kind slug, a headline,
   *  and a suggested next step. Optional - non-JSON / top-level errors carry
   *  only status. Consumed by lib/error-view describeError() so the dashboard
   *  renders the SAME copy the CLI shows. */
  readonly kind?: string;
  readonly title?: string;
  readonly hint?: string;
  constructor(
    public readonly status: number,
    message: string,
    fields?: { kind?: string; title?: string; hint?: string },
  ) {
    super(message);
    this.kind = fields?.kind;
    this.title = fields?.title;
    this.hint = fields?.hint;
  }
}

export async function jsonGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as T;
}

// Parse a failed Response into an ApiError, RETAINING the server's structured
// { kind, title, hint } (setErrorHandler in src/server/server.ts sends them) so
// the UI can render a headline + a fix + kind-aware recovery instead of a
// flattened string. `message` stays the one-line human string for Error.message
// / logs. Falls back to `error`, then body text, then the status line.
async function apiError(res: Response): Promise<ApiError> {
  let message = "";
  let fields: { kind?: string; title?: string; hint?: string } | undefined;
  try {
    const body = (await res.clone().json()) as {
      error?: string;
      kind?: string;
      title?: string;
      hint?: string;
    };
    const s = (v: unknown) =>
      typeof v === "string" && v.length > 0 ? v : undefined;
    const title = s(body.title);
    const hint = s(body.hint);
    const kind = s(body.kind);
    if (title || hint || kind) fields = { kind, title, hint };
    message = title
      ? hint
        ? `${title} - ${hint}`
        : title
      : s(body.error) ?? "";
  } catch {
    /* fall through to text */
  }
  if (!message) {
    try {
      const text = await res.text();
      if (text.trim().length > 0) message = text.trim();
    } catch {
      /* fall through */
    }
  }
  if (!message) message = `${res.status} ${res.statusText}`;
  return new ApiError(res.status, message, fields);
}

export async function jsonPost<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
    signal,
  });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as T;
}

export async function jsonPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as T;
}

export async function jsonPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as T;
}

export async function jsonDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as T;
}
