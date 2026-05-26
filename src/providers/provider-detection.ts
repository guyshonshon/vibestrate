import { execa } from "execa";

export type KnownProviderId =
  | "claude"
  | "codex"
  | "gemini"
  | "opencode"
  | "aider"
  | "ollama"
  | "qwen"
  | "crush"
  | "goose"
  | "cursor"
  | "amp";

export type DetectedProvider = {
  id: KnownProviderId;
  label: string;
  command: string;
  available: boolean;
  version?: string;
  detectionMethod: "path" | "version" | "failed";
  confidence: "ready" | "detected-needs-setup" | "missing";
  recommended: boolean;
  notes: string[];
};

type KnownProviderDef = {
  id: KnownProviderId;
  label: string;
  command: string;
  versionArgs: string[];
  // 'ready' means we ship a verified preset (e.g. claude -p with stdin).
  // 'detected-needs-setup' means we found the binary but won't guess prompt flags.
  presetReady: boolean;
  notes: string[];
  installHint?: string;
};

export const KNOWN_PROVIDERS: readonly KnownProviderDef[] = [
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    versionArgs: ["--version"],
    presetReady: true,
    notes: [
      "Default args: -p with prompt on stdin.",
      "Amaco will configure Claude Code automatically.",
    ],
  },
  {
    id: "codex",
    label: "Codex CLI",
    command: "codex",
    versionArgs: ["--version"],
    // Starter preset exists (src/providers/presets/codex.ts) but Codex's
    // flag matrix moves across releases — we don't claim "ready" so
    // doctor --fix never silently auto-configures it.
    presetReady: false,
    notes: [
      "Starter preset available: `codex exec -q` with stdin prompt.",
      "Run `amaco provider setup` to apply it, then `amaco provider test codex` to verify the flags work in your installed version.",
    ],
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    command: "gemini",
    versionArgs: ["--version"],
    presetReady: false,
    notes: [
      "Google's Gemini CLI. Detected, but Amaco does not yet ship a verified prompt-flag preset.",
      "Run `amaco provider setup` to confirm command, args, and input mode, then `amaco provider test gemini`.",
    ],
    installHint:
      "Install the Gemini CLI: `npm install -g @google/gemini-cli`, then run `gemini` once to authenticate.",
  },
  {
    id: "opencode",
    label: "OpenCode",
    command: "opencode",
    versionArgs: ["--version"],
    presetReady: false,
    notes: [
      "Detected, but Amaco does not ship a verified prompt-flag preset.",
      "Run `amaco provider setup` to confirm command, args, and input mode.",
    ],
  },
  {
    id: "aider",
    label: "Aider",
    command: "aider",
    versionArgs: ["--version"],
    presetReady: false,
    notes: [
      "Detected, but Amaco does not ship a verified prompt-flag preset.",
      "Run `amaco provider setup` to confirm command, args, and input mode.",
    ],
  },
  {
    id: "ollama",
    label: "Ollama",
    command: "ollama",
    versionArgs: ["--version"],
    presetReady: false,
    notes: [
      "Starter preset available: `ollama run qwen3.5` with stdin prompt.",
      "Run `ollama pull qwen3.5` first, or edit providers.ollama.args to use another local model.",
      "Run `amaco provider setup` to apply it, then `amaco provider test ollama` to verify the model responds.",
    ],
    installHint:
      "Install Ollama: `curl -fsSL https://ollama.com/install.sh | sh` (Linux/macOS) or download it from https://ollama.com/download.",
  },
  {
    id: "qwen",
    label: "Qwen Code",
    command: "qwen",
    versionArgs: ["--version"],
    presetReady: false,
    notes: [
      "Alibaba's Qwen Code CLI (an agentic coding CLI). Detected; no verified preset shipped.",
      "Run `amaco provider setup` to confirm command, args, and input mode.",
    ],
    installHint: "Install Qwen Code: `npm install -g @qwen-code/qwen-code`.",
  },
  {
    id: "crush",
    label: "Crush",
    command: "crush",
    versionArgs: ["--version"],
    presetReady: false,
    notes: [
      "Charm's Crush coding agent. Detected; no verified preset shipped.",
      "Run `amaco provider setup` to confirm command, args, and input mode.",
    ],
    installHint:
      "Install Crush: `brew install charmbracelet/tap/crush` (macOS) or see https://github.com/charmbracelet/crush.",
  },
  {
    id: "goose",
    label: "Goose",
    command: "goose",
    versionArgs: ["--version"],
    presetReady: false,
    notes: [
      "Block's Goose agent CLI. Detected; no verified preset shipped.",
      "Run `amaco provider setup` to confirm command, args, and input mode.",
    ],
    installHint: "Install Goose: see https://block.github.io/goose/.",
  },
  {
    id: "cursor",
    label: "Cursor CLI",
    command: "cursor-agent",
    versionArgs: ["--version"],
    presetReady: false,
    notes: [
      "Cursor's headless agent CLI (`cursor-agent`). Detected; no verified preset shipped.",
      "Run `amaco provider setup` to confirm command, args, and input mode.",
    ],
    installHint:
      "Install the Cursor CLI: `curl https://cursor.com/install -fsS | bash`.",
  },
  {
    id: "amp",
    label: "Amp",
    command: "amp",
    versionArgs: ["--version"],
    presetReady: false,
    notes: [
      "Sourcegraph's Amp CLI. Detected; no verified preset shipped.",
      "Run `amaco provider setup` to confirm command, args, and input mode.",
    ],
    installHint: "Install Amp: `npm install -g @sourcegraph/amp`.",
  },
];

const DETECTION_TIMEOUT_MS = 4_000;

export type ProviderDetectionRunner = (
  command: string,
  args: string[],
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

const defaultRunner: ProviderDetectionRunner = async (command, args) => {
  const result = await execa(command, args, {
    reject: false,
    timeout: DETECTION_TIMEOUT_MS,
    stdin: "ignore",
  });
  return {
    exitCode: result.exitCode ?? -1,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
};

function pickVersion(text: string): string | undefined {
  const match = text.match(/(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)/);
  return match ? match[1] : undefined;
}

export async function detectProvider(
  def: KnownProviderDef,
  runner: ProviderDetectionRunner = defaultRunner,
): Promise<DetectedProvider> {
  let result;
  try {
    result = await runner(def.command, def.versionArgs);
  } catch {
    return {
      id: def.id,
      label: def.label,
      command: def.command,
      available: false,
      detectionMethod: "failed",
      confidence: "missing",
      recommended: false,
      notes: [
        `${def.command} is not on PATH.`,
        ...(def.installHint ? [def.installHint] : []),
      ],
    };
  }

  if (result.exitCode !== 0) {
    const reason =
      result.exitCode === -1
        ? `${def.command} is not on PATH.`
        : `${def.command} returned exit code ${result.exitCode} for ${def.versionArgs.join(" ")}.`;
    const stderrNote =
      result.stderr.trim() ||
      (result.exitCode === -1 ? "" : "Command may be installed but not configured.");
    return {
      id: def.id,
      label: def.label,
      command: def.command,
      available: false,
      detectionMethod: "failed",
      confidence: "missing",
      recommended: false,
      notes: [
        reason,
        stderrNote,
        ...(def.installHint ? [def.installHint] : []),
      ].filter(Boolean),
    };
  }

  const version = pickVersion(`${result.stdout}\n${result.stderr}`);
  return {
    id: def.id,
    label: def.label,
    command: def.command,
    available: true,
    version,
    detectionMethod: "version",
    confidence: def.presetReady ? "ready" : "detected-needs-setup",
    recommended: def.presetReady,
    notes: def.notes.slice(),
  };
}

export async function detectAllProviders(
  runner: ProviderDetectionRunner = defaultRunner,
): Promise<DetectedProvider[]> {
  const results: DetectedProvider[] = [];
  for (const def of KNOWN_PROVIDERS) {
    results.push(await detectProvider(def, runner));
  }
  return results;
}

export function installHintForCommand(command: string): string | null {
  const basename = command.split(/[\\/]/).pop() ?? command;
  const def = KNOWN_PROVIDERS.find((p) => p.command === basename);
  return def?.installHint ?? null;
}

export function pickRecommendedProvider(
  detections: readonly DetectedProvider[],
): DetectedProvider | null {
  const ready = detections.find((d) => d.confidence === "ready" && d.available);
  if (ready) return ready;
  return null;
}

export function summarizeDetections(detections: readonly DetectedProvider[]): {
  ready: DetectedProvider[];
  needsSetup: DetectedProvider[];
  missing: DetectedProvider[];
} {
  return {
    ready: detections.filter((d) => d.confidence === "ready" && d.available),
    needsSetup: detections.filter((d) => d.confidence === "detected-needs-setup"),
    missing: detections.filter((d) => d.confidence === "missing"),
  };
}
