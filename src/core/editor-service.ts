import { execa } from "execa";
import type { EditorConfig } from "../project/config-schema.js";
import type { ResolvedSafePath } from "./path-guard.js";

export type EditorCandidate = {
  command: string;
  displayName: string;
  description: string;
  /** True when `command --version` succeeds. */
  available: boolean;
};

const KNOWN_EDITORS: Array<{
  command: string;
  displayName: string;
  description: string;
}> = [
  {
    command: "code",
    displayName: "VS Code",
    description: "Visual Studio Code (uses `code --goto path:line:column`).",
  },
  {
    command: "code-insiders",
    displayName: "VS Code Insiders",
    description: "VS Code Insiders.",
  },
  {
    command: "cursor",
    displayName: "Cursor",
    description: "Cursor (same `--goto` style as VS Code in supported builds).",
  },
];

const VERSION_TIMEOUT_MS = 3_000;
const OPEN_TIMEOUT_MS = 10_000;

/**
 * Probe each known editor command for availability. Probes are best-effort
 * and bounded; one slow editor never delays the others.
 */
export async function detectEditors(): Promise<EditorCandidate[]> {
  return Promise.all(
    KNOWN_EDITORS.map(async (e): Promise<EditorCandidate> => {
      const ok = await isCommandAvailable(e.command);
      return { ...e, available: ok };
    }),
  );
}

async function isCommandAvailable(command: string): Promise<boolean> {
  if (!isSafeCommandName(command)) return false;
  try {
    const r = await execa(command, ["--version"], {
      reject: false,
      timeout: VERSION_TIMEOUT_MS,
      stdin: "ignore",
    });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Validates an editor config without launching anything. Used by the doctor /
 * settings UI to show "ready" vs "command not found".
 */
export type EditorValidation = {
  ok: boolean;
  reason?: string;
  resolvedPlaceholders: string[];
};

export function validateEditorConfig(
  config: EditorConfig,
): EditorValidation {
  if (!config.enabled) {
    return { ok: false, reason: "Editor handoff is disabled.", resolvedPlaceholders: [] };
  }
  if (!isSafeCommandName(config.command)) {
    return {
      ok: false,
      reason:
        'Editor command must be a single token (no spaces, no "/", no ".."). Configure via `amaco editor set`.',
      resolvedPlaceholders: [],
    };
  }
  if (!Array.isArray(config.args) || config.args.length === 0) {
    return {
      ok: false,
      reason: "Editor args must include at least the file placeholder.",
      resolvedPlaceholders: [],
    };
  }
  const seenPlaceholders = new Set<string>();
  for (const a of config.args) {
    for (const p of a.matchAll(/\{(file|line|column)\}/g)) {
      seenPlaceholders.add(p[1]!);
    }
  }
  if (!seenPlaceholders.has("file")) {
    return {
      ok: false,
      reason: "Editor args must reference the {file} placeholder.",
      resolvedPlaceholders: [...seenPlaceholders],
    };
  }
  return { ok: true, resolvedPlaceholders: [...seenPlaceholders] };
}

export type OpenInEditorInput = {
  config: EditorConfig;
  resolved: ResolvedSafePath;
  line?: number | null;
  column?: number | null;
};

export type OpenInEditorResult = {
  ok: boolean;
  command: string;
  args: string[];
  exitCode: number | null;
  errorMessage: string | null;
};

export class EditorOpenError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "EditorOpenError";
  }
}

/**
 * Launches the configured editor with safe placeholder substitution. The
 * command is fixed argv — no shell, no env-derived strings, no body-supplied
 * command. Path-guard enforcement is the caller's job; this function refuses
 * to open secret-like files defensively.
 */
export async function openInEditor(
  input: OpenInEditorInput,
): Promise<OpenInEditorResult> {
  const validation = validateEditorConfig(input.config);
  if (!validation.ok) {
    throw new EditorOpenError(400, validation.reason ?? "Editor not configured.");
  }
  if (input.resolved.isSecretLike) {
    throw new EditorOpenError(
      403,
      "Refusing to open a secret-like file (.env, *.key, etc.).",
    );
  }
  const args = input.config.args.map((a) =>
    substitute(a, {
      file: input.resolved.absolutePath,
      line: input.line,
      column: input.column,
    }),
  );
  try {
    const r = await execa(input.config.command, args, {
      reject: false,
      timeout: OPEN_TIMEOUT_MS,
      stdin: "ignore",
      shell: false,
    });
    return {
      ok: r.exitCode === 0,
      command: input.config.command,
      args,
      exitCode: r.exitCode ?? null,
      errorMessage:
        r.exitCode === 0
          ? null
          : (r.stderr || r.stdout || `editor exited with ${r.exitCode ?? "?"}`)
              .toString()
              .slice(0, 500),
    };
  } catch (err) {
    return {
      ok: false,
      command: input.config.command,
      args,
      exitCode: null,
      errorMessage:
        err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
    };
  }
}

export function substitute(
  arg: string,
  vars: { file: string; line?: number | null; column?: number | null },
): string {
  return arg
    .replace(/\{file\}/g, vars.file)
    .replace(/\{line\}/g, vars.line != null ? String(vars.line) : "1")
    .replace(/\{column\}/g, vars.column != null ? String(vars.column) : "1");
}

/**
 * Editor commands must be a single token: alphanumeric plus dash/underscore.
 * This blocks shell metacharacters, path separators, traversal, and PATH-style
 * tricks like "; rm -rf /". The user can still pick any editor on $PATH whose
 * binary name fits.
 */
export function isSafeCommandName(command: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(command);
}
