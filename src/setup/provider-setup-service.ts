import { execa } from "execa";
import { ConfigError } from "../utils/errors.js";
import {
  ensureProvider,
  assignAgentsToProvider,
  readDocument,
} from "./config-update-service.js";
import type { CliProviderConfig } from "../providers/provider-schema.js";
import type { DetectedProvider } from "../providers/provider-detection.js";

export const SAFE_TEST_MAGIC = "AMACO_PROVIDER_OK";

export const SAFE_TEST_PROMPT = [
  "You are running a connectivity self-test from Amaco.",
  "Do not perform any other action.",
  `Reply with exactly this token and nothing else: ${SAFE_TEST_MAGIC}`,
].join("\n");

export type ProviderSummary = {
  id: string;
  command: string;
  args: string[];
  input: "stdin" | "arg";
  agentsUsing: string[];
};

export async function listConfiguredProviders(
  projectRoot: string,
): Promise<ProviderSummary[]> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as {
    providers?: Record<string, { command?: string; args?: string[]; input?: "stdin" | "arg" }>;
    agents?: Record<string, { provider?: string }>;
  };
  const providers = js.providers ?? {};
  const agents = js.agents ?? {};
  const out: ProviderSummary[] = [];
  for (const [id, prov] of Object.entries(providers)) {
    const usedBy: string[] = [];
    for (const [agentId, agent] of Object.entries(agents)) {
      if (agent.provider === id) usedBy.push(agentId);
    }
    out.push({
      id,
      command: prov.command ?? "",
      args: prov.args ?? [],
      input: prov.input ?? "stdin",
      agentsUsing: usedBy.sort(),
    });
  }
  return out;
}

export type SetProviderResult = {
  ok: true;
  providerId: string;
  agentsUpdated: string[];
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
      reason: `Provider "${providerId}" is not configured in .amaco/project.yml.`,
      hint: "Run `amaco provider setup` to add a provider before assigning it.",
    };
  }
  await assignAgentsToProvider(projectRoot, providerId);
  const after = await listConfiguredProviders(projectRoot);
  const updated = after.find((s) => s.id === providerId)?.agentsUsing ?? [];
  return { ok: true, providerId, agentsUpdated: updated };
}

export type AddProviderInput = {
  id: string;
  config: CliProviderConfig;
  alsoAssignAllAgents?: boolean;
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
  if (input.alsoAssignAllAgents) {
    await assignAgentsToProvider(projectRoot, input.id);
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
      hint: `Provider "${input.providerId}" is not configured. Run \`amaco provider setup\` first.`,
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
  if (!ok) {
    if (exitCode !== 0) {
      hint = `The CLI exited with code ${exitCode}. Check that "${provider.command}" is installed and authenticated.`;
    } else if (!matched) {
      hint = `The CLI ran but did not echo "${SAFE_TEST_MAGIC}". Your provider may need a different prompt-flag setup. Run \`amaco provider setup\` to adjust args/input mode.`;
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
  };
}

export function buildClaudePresetConfig(): CliProviderConfig {
  return {
    type: "cli",
    command: "claude",
    args: ["-p"],
    input: "stdin",
  };
}

export function buildClaudeProviderFromDetection(d: DetectedProvider): CliProviderConfig {
  return {
    type: "cli",
    command: d.command,
    args: ["-p"],
    input: "stdin",
  };
}
