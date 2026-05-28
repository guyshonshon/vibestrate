import { execa } from "execa";
import { ConfigError } from "../utils/errors.js";
import { ollamaPreset } from "../providers/presets/ollama.js";
import { claudeCodePreset } from "../providers/presets/claude-code.js";
import {
  ensureProvider,
  assignRolesToProvider,
  readDocument,
} from "./config-update-service.js";
import type {
  CliProviderConfig,
  ClaudeCodeProviderSchemaConfig,
  ProviderConfig,
} from "../providers/provider-schema.js";
import type { DetectedProvider } from "../providers/provider-detection.js";
import { knownProviderIdForCommand } from "../providers/provider-detection.js";
import {
  classifyProviderFailure,
  providerLoginInstruction,
} from "../providers/provider-presets.js";

export const SAFE_TEST_MAGIC = "VIBESTRATE_PROVIDER_OK";

export const SAFE_TEST_PROMPT = [
  "You are running a connectivity self-test from Vibestrate.",
  "Do not perform any other action.",
  `Reply with exactly this token and nothing else: ${SAFE_TEST_MAGIC}`,
].join("\n");

export type ProviderSummary = {
  id: string;
  command: string;
  args: string[];
  input: "stdin" | "arg";
  rolesUsing: string[];
};

export async function listConfiguredProviders(
  projectRoot: string,
): Promise<ProviderSummary[]> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as {
    providers?: Record<string, { command?: string; args?: string[]; input?: "stdin" | "arg" }>;
    roles?: Record<string, { provider?: string }>;
  };
  const providers = js.providers ?? {};
  const agents = js.roles ?? {};
  const out: ProviderSummary[] = [];
  for (const [id, prov] of Object.entries(providers)) {
    const usedBy: string[] = [];
    for (const [roleId, agent] of Object.entries(agents)) {
      if (agent.provider === id) usedBy.push(roleId);
    }
    out.push({
      id,
      command: prov.command ?? "",
      args: prov.args ?? [],
      input: prov.input ?? "stdin",
      rolesUsing: usedBy.sort(),
    });
  }
  return out;
}

export type SetProviderResult = {
  ok: true;
  providerId: string;
  rolesUpdated: string[];
};

export type SetProviderError = {
  ok: false;
  reason: string;
  hint: string;
};

export async function setDefaultProvider(
  projectRoot: string,
  providerId: string,
): Promise<SetProviderResult | SetProviderError> {
  const summaries = await listConfiguredProviders(projectRoot);
  const found = summaries.find((s) => s.id === providerId);
  if (!found) {
    return {
      ok: false,
      reason: `Provider "${providerId}" is not configured in .vibestrate/project.yml.`,
      hint: "Run `vibestrate provider setup` to add a provider before assigning it.",
    };
  }
  await assignRolesToProvider(projectRoot, providerId);
  const after = await listConfiguredProviders(projectRoot);
  const updated = after.find((s) => s.id === providerId)?.rolesUsing ?? [];
  return { ok: true, providerId, rolesUpdated: updated };
}

export type AddProviderInput = {
  id: string;
  config: ProviderConfig;
  alsoAssignAllRoles?: boolean;
};

export async function addProvider(
  projectRoot: string,
  input: AddProviderInput,
): Promise<void> {
  if (!input.id || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(input.id)) {
    throw new ConfigError(
      `Provider id "${input.id}" is not valid. Use letters, digits, dash, or underscore (must start with a letter).`,
    );
  }
  await ensureProvider(projectRoot, input.id, input.config);
  if (input.alsoAssignAllRoles) {
    await assignRolesToProvider(projectRoot, input.id);
  }
}

export type ProviderTestResult = {
  ok: boolean;
  providerId: string;
  command: string;
  args: string[];
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  matchedMagic: boolean;
  hint?: string;
  /** True when the failure looks like the provider isn't authenticated. */
  needsLogin: boolean;
  /** The command to run OUTSIDE Vibestrate to log in (null = API-key/local provider). */
  loginCommand?: string | null;
};

export async function runSafeProviderTest(input: {
  projectRoot: string;
  providerId: string;
  timeoutMs?: number;
}): Promise<ProviderTestResult> {
  const summaries = await listConfiguredProviders(input.projectRoot);
  const provider = summaries.find((s) => s.id === input.providerId);
  if (!provider) {
    return {
      ok: false,
      providerId: input.providerId,
      command: "",
      args: [],
      durationMs: 0,
      exitCode: -1,
      stdout: "",
      stderr: "",
      matchedMagic: false,
      needsLogin: false,
      hint: `Provider "${input.providerId}" is not configured. Run \`vibestrate provider setup\` first.`,
    };
  }

  const args = [...provider.args];
  let stdin: string | undefined;
  if (provider.input === "arg") {
    args.push(SAFE_TEST_PROMPT);
  } else {
    stdin = SAFE_TEST_PROMPT;
  }

  const startedAt = Date.now();
  let exitCode = -1;
  let stdout = "";
  let stderr = "";
  try {
    const result = await execa(provider.command, args, {
      input: stdin,
      reject: false,
      timeout: input.timeoutMs ?? 60_000,
    });
    exitCode = result.exitCode ?? -1;
    stdout = result.stdout?.toString() ?? "";
    stderr = result.stderr?.toString() ?? "";
  } catch (err) {
    stderr = err instanceof Error ? err.message : String(err);
  }
  const durationMs = Date.now() - startedAt;
  const matched = stdout.includes(SAFE_TEST_MAGIC);
  const ok = exitCode === 0 && matched;

  let hint: string | undefined;
  let needsLogin = false;
  let loginCommand: string | null | undefined;
  if (!ok) {
    const kind = classifyProviderFailure({
      exitCode,
      stdout,
      stderr,
      matchedMagic: matched,
    });
    const knownId = knownProviderIdForCommand(provider.command);
    if (kind === "auth") {
      needsLogin = true;
      const login = knownId ? providerLoginInstruction(knownId) : null;
      loginCommand = login?.command ?? null;
      if (login?.command) {
        hint = `"${provider.command}" looks unauthenticated. Log in OUTSIDE Vibestrate, then re-test:\n  ${login.command}\n${login.note}`;
      } else if (login) {
        hint = `"${provider.command}" looks unauthenticated. ${login.note}`;
      } else {
        hint = `"${provider.command}" looks unauthenticated. Check its login/credentials and re-test.`;
      }
    } else if (kind === "exit") {
      hint = `The CLI exited with code ${exitCode}. Check that "${provider.command}" is installed and authenticated.`;
    } else if (/unexpected argument|unrecognized|unknown option|unknown flag|invalid option|invalid subcommand/i.test(`${stderr}\n${stdout}`)) {
      // The CLI rejected our args (e.g. a flag removed in a newer release).
      hint = `"${provider.command}" rejected its arguments — a flag/subcommand it no longer accepts in this version. Run \`vibestrate provider setup\` to update the command/args.`;
    } else {
      hint = `The CLI ran but did not echo "${SAFE_TEST_MAGIC}". Your provider may need a different prompt-flag setup. Run \`vibestrate provider setup\` to adjust args/input mode.`;
    }
  }

  return {
    ok,
    providerId: input.providerId,
    command: provider.command,
    args,
    durationMs,
    exitCode,
    stdout,
    stderr,
    matchedMagic: matched,
    hint,
    needsLogin,
    loginCommand,
  };
}

/** Clone the canonical claude preset (claude-code + stream-json) so the setup
 *  wizard / CLI write the same config as `doctor` / the dashboard. */
export function buildClaudePresetConfig(): ClaudeCodeProviderSchemaConfig {
  return {
    ...claudeCodePreset,
    args: [...claudeCodePreset.args],
    ...(claudeCodePreset.settings
      ? { settings: { ...claudeCodePreset.settings } }
      : {}),
  };
}

export function buildClaudeProviderFromDetection(
  d: DetectedProvider,
): ClaudeCodeProviderSchemaConfig {
  return { ...buildClaudePresetConfig(), command: d.command };
}

/**
 * Starter preset for the OpenAI Codex CLI. Unlike the Claude preset,
 * Vibestrate does NOT auto-apply this in `doctor --fix` — Codex's flag matrix
 * has moved across releases and we don't want to silently configure a
 * provider that might not work. The user opts in via `vibestrate provider
 * setup codex` (or the dashboard's setup wizard), and we recommend they
 * follow up with `vibestrate provider test codex` before a real run depends
 * on it.
 *
 * Default invocation: `codex exec` with the prompt on stdin.
 *   - `exec` runs a one-shot rather than dropping into the REPL and prints
 *     the reply to stdout.
 *   - No `-q`: current codex (0.13x) removed that flag and rejects it with a
 *     usage error (exit 2). Older releases used it to quiet the output.
 *
 * The starter source of truth is `src/providers/presets/codex.ts`;
 * this function exists so the setup wizard / doctor have one call site
 * that returns a fresh config object (matching the buildClaudePresetConfig
 * pattern).
 */
export function buildCodexPresetConfig(): CliProviderConfig {
  return {
    type: "cli",
    command: "codex",
    args: ["exec"],
    input: "stdin",
  };
}

export function buildCodexProviderFromDetection(
  d: DetectedProvider,
): CliProviderConfig {
  return {
    type: "cli",
    command: d.command,
    args: ["exec"],
    input: "stdin",
  };
}

export function buildOllamaPresetConfig(): CliProviderConfig {
  return { ...ollamaPreset, args: [...ollamaPreset.args] };
}

export function buildOllamaProviderFromDetection(
  d: DetectedProvider,
): CliProviderConfig {
  return {
    ...buildOllamaPresetConfig(),
    command: d.command,
  };
}
