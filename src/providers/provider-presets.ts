import type {
  CliProviderConfig,
  ClaudeCodeProviderSchemaConfig,
} from "./provider-schema.js";
import type { KnownProviderId } from "./provider-detection.js";

/** A preset is either a generic CLI config or a Claude Code (structured) one. */
export type PresetConfig = CliProviderConfig | ClaudeCodeProviderSchemaConfig;
import { claudeCodePreset } from "./presets/claude-code.js";
import { codexPreset } from "./presets/codex.js";
import { ollamaPreset } from "./presets/ollama.js";

/**
 * One place that pairs every known provider with:
 *
 *   - `preset`      — the best-known non-interactive invocation (the command
 *                     is overridden with the detected path when applied).
 *   - `loginCommand`— the command the user runs **outside Vibestrate** to
 *                     authenticate, or `null` when the provider uses an API
 *                     key / needs no login.
 *   - `loginNote`   — a one-line, human explanation shown alongside it.
 *
 * The presets are "works out of the box" defaults so a detected provider can
 * be auto-configured (like Claude always has been). They are best-effort:
 * coding-CLI flag matrices move across releases, so `vibe provider test
 * <id>` remains the source of truth, and the auth check below turns a failed
 * test into a precise "log in here" instruction instead of a vague error.
 */
export type ProviderPreset = {
  preset: PresetConfig;
  loginCommand: string | null;
  loginNote: string;
};

export const PROVIDER_PRESETS: Record<KnownProviderId, ProviderPreset> = {
  claude: {
    preset: claudeCodePreset,
    loginCommand: "claude",
    loginNote: "Run `claude` once and complete sign-in, or set ANTHROPIC_API_KEY.",
  },
  codex: {
    preset: codexPreset,
    loginCommand: "codex login",
    loginNote: "Run `codex login`, or set OPENAI_API_KEY.",
  },
  gemini: {
    preset: { type: "cli", command: "gemini", args: [], input: "stdin" },
    loginCommand: "gemini",
    loginNote: "Run `gemini` once and sign in with Google, or set GEMINI_API_KEY.",
  },
  opencode: {
    preset: { type: "cli", command: "opencode", args: ["run"], input: "arg" },
    loginCommand: "opencode auth login",
    loginNote: "Run `opencode auth login`.",
  },
  aider: {
    preset: {
      type: "cli",
      command: "aider",
      args: ["--no-auto-commits", "--yes", "--message"],
      input: "arg",
    },
    loginCommand: null,
    loginNote:
      "Aider authenticates via API keys — set OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment.",
  },
  ollama: {
    preset: ollamaPreset,
    loginCommand: null,
    loginNote: "No login needed (runs locally). Pull the model first: `ollama pull qwen3.5`.",
  },
  qwen: {
    preset: { type: "cli", command: "qwen", args: [], input: "stdin" },
    loginCommand: "qwen",
    loginNote: "Run `qwen` once and authenticate (or set the API key it prompts for).",
  },
  crush: {
    preset: { type: "cli", command: "crush", args: ["run"], input: "arg" },
    loginCommand: null,
    loginNote:
      "Crush uses your model provider's API key — set the relevant one (e.g. ANTHROPIC_API_KEY / OPENAI_API_KEY).",
  },
  goose: {
    preset: { type: "cli", command: "goose", args: ["run", "-t"], input: "arg" },
    loginCommand: "goose configure",
    loginNote: "Run `goose configure` to set your provider and API key.",
  },
  cursor: {
    preset: { type: "cli", command: "cursor-agent", args: ["-p"], input: "arg" },
    loginCommand: "cursor-agent login",
    loginNote: "Run `cursor-agent login`.",
  },
  amp: {
    preset: { type: "cli", command: "amp", args: ["-x"], input: "arg" },
    loginCommand: "amp login",
    loginNote: "Run `amp login`.",
  },
};

/**
 * Returns a fresh provider config from a preset, with the command swapped for
 * the detected binary path. Arrays are copied so callers can't mutate the
 * shared preset.
 */
export function buildProviderFromDetection(
  id: KnownProviderId,
  detectedCommand: string,
): PresetConfig {
  const { preset } = PROVIDER_PRESETS[id];
  // `...preset` carries claude-code's `settings` (stream-json) through verbatim.
  return {
    ...preset,
    command: detectedCommand || preset.command,
    args: [...preset.args],
    ...(preset.env ? { env: { ...preset.env } } : {}),
  };
}

/**
 * A user-facing "you need to log in" instruction for a provider, or `null`
 * when the provider needs no interactive login (API-key / local providers
 * still get a note via `PROVIDER_PRESETS[id].loginNote`).
 */
export function providerLoginInstruction(id: KnownProviderId): {
  command: string | null;
  note: string;
} {
  const entry = PROVIDER_PRESETS[id];
  return { command: entry.loginCommand, note: entry.loginNote };
}

export type ProviderFailureKind = "auth" | "exit" | "flags";

const AUTH_SIGNALS = [
  "not logged in",
  "log in",
  "login required",
  "please login",
  "please log in",
  "unauthorized",
  "unauthenticated",
  "authentication",
  "authenticate",
  "not authenticated",
  "no api key",
  "api key not",
  "missing api key",
  "set your api key",
  "credentials",
  "session expired",
  "token expired",
  "403 forbidden",
  "401",
];

// A CLI rejecting our args (a flag it no longer accepts, a renamed
// subcommand) prints one of these and exits non-zero — usually exit 2.
// We treat that as a "flags" problem, not a generic exit, so the hint can
// point at `vibe provider setup` instead of "check it's installed".
const USAGE_SIGNALS = [
  "unexpected argument",
  "unrecognized argument",
  "unrecognized option",
  "unknown option",
  "unknown flag",
  "invalid option",
  "invalid argument",
  "invalid subcommand",
];

/**
 * Classify why a provider invocation failed, so callers can give the right
 * advice: an auth failure → "log in outside Vibestrate"; rejected args / wrong
 * output → "your prompt flags need adjusting"; anything else → a plain
 * non-zero exit.
 */
export function classifyProviderFailure(input: {
  exitCode: number;
  stdout: string;
  stderr: string;
  matchedMagic: boolean;
}): ProviderFailureKind {
  const haystack = `${input.stdout}\n${input.stderr}`.toLowerCase();
  if (AUTH_SIGNALS.some((s) => haystack.includes(s))) return "auth";
  if (USAGE_SIGNALS.some((s) => haystack.includes(s))) return "flags";
  if (input.exitCode !== 0) return "exit";
  return "flags";
}
