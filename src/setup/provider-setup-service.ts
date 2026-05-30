import { execa } from "execa";
import { ConfigError } from "../utils/errors.js";
import { ollamaPreset } from "../providers/presets/ollama.js";
import { claudeCodePreset } from "../providers/presets/claude-code.js";
import {
  ensureProvider,
  pointAllProfilesAtProvider,
  deleteProvider,
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
  /** Profile ids whose `provider` points at this provider. */
  profilesUsing: string[];
};

export async function listConfiguredProviders(
  projectRoot: string,
): Promise<ProviderSummary[]> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as {
    providers?: Record<string, { command?: string; args?: string[]; input?: "stdin" | "arg" }>;
    profiles?: Record<string, { provider?: string }>;
  };
  const providers = js.providers ?? {};
  const profiles = js.profiles ?? {};
  const out: ProviderSummary[] = [];
  for (const [id, prov] of Object.entries(providers)) {
    const usedBy: string[] = [];
    for (const [profileId, profile] of Object.entries(profiles)) {
      if (profile.provider === id) usedBy.push(profileId);
    }
    out.push({
      id,
      command: prov.command ?? "",
      args: prov.args ?? [],
      input: prov.input ?? "stdin",
      profilesUsing: usedBy.sort(),
    });
  }
  return out;
}

export type SetProviderResult = {
  ok: true;
  providerId: string;
  profilesUpdated: string[];
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
      hint: "Run `vibe provider setup` to add a provider before assigning it.",
    };
  }
  await pointAllProfilesAtProvider(projectRoot, providerId);
  const after = await listConfiguredProviders(projectRoot);
  const updated = after.find((s) => s.id === providerId)?.profilesUsing ?? [];
  return { ok: true, providerId, profilesUpdated: updated };
}

export type AddProviderInput = {
  id: string;
  config: ProviderConfig;
  /** Also point every Profile at this provider after adding it. */
  alsoAssignAllProfiles?: boolean;
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
  if (input.alsoAssignAllProfiles) {
    await pointAllProfilesAtProvider(projectRoot, input.id);
  }
}

export type RemoveProviderResult =
  | { ok: true; providerId: string }
  | { ok: false; reason: string; hint: string };

/**
 * Remove a configured provider from project.yml. Refuses (without writing)
 * if any role still points at it — removing it would leave a dangling
 * reference (and the config write would reject anyway). The caller reassigns
 * those roles first. Mirrors the `setDefaultProvider` ok/refusal shape.
 */
export async function removeProvider(
  projectRoot: string,
  providerId: string,
): Promise<RemoveProviderResult> {
  const summaries = await listConfiguredProviders(projectRoot);
  const found = summaries.find((s) => s.id === providerId);
  if (!found) {
    return {
      ok: false,
      reason: `Provider "${providerId}" is not configured in .vibestrate/project.yml.`,
      hint: "Nothing to remove.",
    };
  }
  if (found.profilesUsing.length > 0) {
    return {
      ok: false,
      reason: `"${providerId}" is still used by profile(s): ${found.profilesUsing.join(", ")}.`,
      hint: "Point those profiles at another provider first, then remove it.",
    };
  }
  await deleteProvider(projectRoot, providerId);
  return { ok: true, providerId };
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
      hint: `Provider "${input.providerId}" is not configured. Run \`vibe provider setup\` first.`,
    };
  }

  // Non-CLI providers have no command to spawn. Test them by type without a
  // surprise token spend: localhost-proxy makes a real (free) call; cloud
  // http-api just verifies the key env var is set (we don't call the paid API
  // on a "test" click — it'll be exercised on the next real run).
  {
    const { loadConfig } = await import("../project/config-loader.js");
    const loaded = await loadConfig(input.projectRoot).catch(() => null);
    const cfg = loaded?.config.providers[input.providerId];
    if (cfg && (cfg.type === "http-api" || cfg.type === "localhost-proxy")) {
      const base = {
        providerId: input.providerId,
        command: cfg.baseUrl,
        args: [cfg.model],
        startedAt: new Date().toISOString(),
        matchedMagic: false as boolean,
        needsLogin: false,
      };
      if (cfg.type === "http-api") {
        const { envVarName } = await import(
          "../notifications/gateways/secret-resolver.js"
        );
        const envName = envVarName(cfg.apiKey);
        const keySet = !!(envName && process.env[envName]);
        return {
          ...base,
          ok: keySet,
          durationMs: 0,
          exitCode: keySet ? 0 : -1,
          stdout: "",
          stderr: keySet ? "" : `Env var ${envName ?? "(unset)"} not set.`,
          hint: keySet
            ? `Config valid. Key ${envName} is set; the external ${cfg.api} API will be called on the next run (not tested here to avoid spend).`
            : `Set ${envName ?? "the API key env var"} before running.`,
        };
      }
      // localhost-proxy → real, free connectivity test.
      const started = Date.now();
      try {
        const { runProvider } = await import("../providers/provider-runner.js");
        const r = await runProvider(loaded!.config.providers, {
          providerId: input.providerId,
          prompt: SAFE_TEST_PROMPT,
          cwd: input.projectRoot,
        });
        return {
          ...base,
          ok: r.exitCode === 0,
          durationMs: Date.now() - started,
          exitCode: r.exitCode,
          stdout: r.stdout.slice(0, 400),
          stderr: r.stderr.slice(0, 400),
          hint:
            r.exitCode === 0
              ? `Reached the local ${cfg.api} server at ${cfg.baseUrl}.`
              : `Could not reach ${cfg.baseUrl}. Is the local server running?`,
        };
      } catch (err) {
        return {
          ...base,
          ok: false,
          durationMs: Date.now() - started,
          exitCode: -1,
          stdout: "",
          stderr: err instanceof Error ? err.message : String(err),
          hint: `Could not reach ${cfg.baseUrl}. Is the local server running?`,
        };
      }
    }
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
      hint = `"${provider.command}" rejected its arguments — a flag/subcommand it no longer accepts in this version. Run \`vibe provider setup\` to update the command/args.`;
    } else {
      hint = `The CLI ran but did not echo "${SAFE_TEST_MAGIC}". Your provider may need a different prompt-flag setup. Run \`vibe provider setup\` to adjust args/input mode.`;
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
 * provider that might not work. The user opts in via `vibe provider
 * setup codex` (or the dashboard's setup wizard), and we recommend they
 * follow up with `vibe provider test codex` before a real run depends
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
