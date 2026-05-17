// Pure error → human-friendly shape mapper. Used by the CLI top-level
// handler, the server route error handler, the panel toasts, and the
// UI's issue/toast surfaces so every failure reads the same way:
//
//   kind     stable filter slug (ENOENT, fastify-http, spawn-enoent, …)
//   title    one-line headline ("File not found", "Port already in use")
//   detail   technical message (path, port, syscall) — safe to show
//   hint     suggested next step the user can copy or follow
//
// No I/O, no logging. Callers decide what to do with the shape (print
// it, toast it, record it into the issues stream, etc).

export type FormattedError = {
  kind: string;
  title: string;
  detail: string;
  hint?: string;
};

type LooseError = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  syscall?: unknown;
  path?: unknown;
  port?: unknown;
  statusCode?: unknown;
  errno?: unknown;
};

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function formatError(err: unknown): FormattedError {
  // Already-formatted — pass through unchanged so callers can layer.
  if (
    err !== null &&
    typeof err === "object" &&
    "kind" in err &&
    "title" in err &&
    "detail" in err
  ) {
    return err as FormattedError;
  }

  const raw = (err ?? {}) as LooseError;
  const message = pickString(raw.message) ?? String(err ?? "Unknown error");
  const code = pickString(raw.code);
  const syscall = pickString(raw.syscall);
  const targetPath = pickString(raw.path);

  // --- Filesystem / spawn errors ---------------------------------------
  if (code === "ENOENT") {
    // spawn ENOENT — argv0 missing from PATH (no PATH echo for security)
    if (syscall === "spawn" || /spawn /i.test(message)) {
      const cmd = message.match(/spawn (\S+)/)?.[1] ?? "command";
      return {
        kind: "spawn-enoent",
        title: `Command not found: ${cmd}`,
        detail: message,
        hint: `Install \`${cmd}\` and make sure it is on your PATH, or set the matching provider override in .amaco/project.yml.`,
      };
    }
    return {
      kind: "fs-enoent",
      title: "File not found",
      detail: targetPath ? `${targetPath} (${message})` : message,
      hint: "Check the path and re-run. If amaco generated this path, it may have been deleted while a run was in flight.",
    };
  }
  if (code === "EACCES" || code === "EPERM") {
    return {
      kind: "fs-perm",
      title: "Permission denied",
      detail: targetPath ? `${targetPath} (${message})` : message,
      hint: "Check file permissions or rerun from a directory you own. amaco never escalates privileges automatically.",
    };
  }
  if (code === "EADDRINUSE") {
    const port = pickNumber(raw.port);
    return {
      kind: "port-in-use",
      title: port ? `Port ${port} is already in use` : "Port already in use",
      detail: message,
      hint: "Stop the other process or pass --port to amaco ui to pick a different one.",
    };
  }
  if (code === "ECONNREFUSED") {
    return {
      kind: "net-refused",
      title: "Connection refused",
      detail: message,
      hint: "The target service isn't accepting connections. Check it's running and reachable.",
    };
  }

  // --- HTTP / Fastify --------------------------------------------------
  const statusCode = pickNumber(raw.statusCode);
  if (statusCode !== undefined && statusCode >= 400) {
    // Title prefers the server's own message when it sent a meaningful
    // one (Fastify HttpError.message). 409 has many causes (worktree
    // missing, approval state conflict, queue already held) — the
    // original assumption "another action in flight" was misleading
    // for most of them. Only fall back to the generic title when the
    // server didn't bother to explain.
    const serverSentMessage = message && message !== "Internal Server Error";
    return {
      kind: `http-${statusCode}`,
      title: serverSentMessage
        ? firstLine(message)
        : statusCode >= 500
          ? `Server error ${statusCode}`
          : `Request rejected (${statusCode})`,
      detail: message,
      hint:
        statusCode === 404
          ? "The resource no longer exists. It may have been deleted, cancelled, or never existed."
          : statusCode >= 500
            ? "amaco logged this into .amaco/issues.ndjson — check the Issues panel for context."
            : undefined,
    };
  }

  // --- Zod -------------------------------------------------------------
  if (pickString(raw.name) === "ZodError" || /ZodError/i.test(message)) {
    return {
      kind: "validation",
      title: "Input failed validation",
      detail: message,
      hint: "Fix the highlighted fields and resubmit. The validator never partially applies a change.",
    };
  }

  // --- Generic fallback ------------------------------------------------
  return {
    kind: code ? `err-${code.toLowerCase()}` : "error",
    title: firstLine(message) || "Unexpected error",
    detail: message,
  };
}

function firstLine(s: string): string {
  const idx = s.indexOf("\n");
  return idx === -1 ? s : s.slice(0, idx);
}

/**
 * Render a formatted error as a single human-readable string. Used by
 * panel toasts and CLI prints where we don't have a multi-field UI.
 */
export function formatErrorLine(err: unknown): string {
  const f = formatError(err);
  return f.hint ? `${f.title} — ${f.hint}` : f.title;
}

/**
 * Convert a formatted error into the shape `recordIssue()` expects, so
 * route/scheduler handlers can write a structured entry into the
 * issues stream with one call.
 */
export function toIssueInput(
  err: unknown,
  context?: Record<string, unknown>,
): {
  kind: string;
  message: string;
  detail?: string;
  fix?: string;
  context?: Record<string, unknown>;
} {
  const f = formatError(err);
  return {
    kind: f.kind,
    message: f.title,
    ...(f.detail && f.detail !== f.title ? { detail: f.detail } : {}),
    ...(f.hint ? { fix: f.hint } : {}),
    ...(context ? { context } : {}),
  };
}
