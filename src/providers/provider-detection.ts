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
  /** One of the popular, out-of-the-box providers (vs an optional opt-in one). */
  popular: boolean;
  notes: string[];
};

type KnownProviderDef = {
  id: KnownProviderId;
  label: string;
  command: string;
  versionArgs: string[];
  // The popular, first-class set: auto-detected, auto-configured by
  // `doctor --fix`, and offered out of the box. The rest are still supported
  // (presets exist) but stay opt-in — detected, never auto-bound.
  popular: boolean;
  // 'ready' (presetReady) means we auto-apply a verified preset (e.g. claude
  // -p with stdin). Optional providers ship a preset too but are not auto-
  // applied, so they detect as 'detected-needs-setup' until the user opts in.
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
    popular: true,
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
    popular: true,
    presetReady: true,
    notes: [
      "Preset: `codex exec -q` with the prompt on stdin.",
      "Verify with `amaco provider test codex`; log in with `codex login` if prompted.",
    ],
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    command: "gemini",
    versionArgs: ["--version"],
    popular: true,
    presetReady: true,
    notes: [
      "Preset: prompt piped to `gemini` on stdin.",
      "Verify with `amaco provider test gemini`; sign in by running `gemini` once (or set GEMINI_API_KEY).",
    ],
    installHint:
      "Install the Gemini CLI: `npm install -g @google/gemini-cli`, then run `gemini` once to authenticate.",
  },
  {
    id: "opencode",
    label: "OpenCode",
    command: "opencode",
    versionArgs: ["--version"],
    popular: true,
    presetReady: true,
    notes: [
      "Preset: `opencode run` with the prompt as an argument.",
      "Verify with `amaco provider test opencode`; log in with `opencode auth login`.",
    ],
  },
  {
    id: "aider",
    label: "Aider",
    command: "aider",
    versionArgs: ["--version"],
    popular: true,
    presetReady: true,
    notes: [
      "Preset: `aider --message` (one-shot, no auto-commits).",
      "Set OPENAI_API_KEY or ANTHROPIC_API_KEY, then verify with `amaco provider test aider`.",
    ],
  },
  {
    id: "ollama",
    label: "Ollama",
    command: "ollama",
    versionArgs: ["--version"],
    popular: true,
    presetReady: true,
    notes: [
      "Preset: `ollama run qwen3.5` with the prompt on stdin.",
      "Pull the model first (`ollama pull qwen3.5`), or edit providers.ollama.args for another local model.",
      "No login needed (runs locally). Verify with `amaco provider test ollama`.",
    ],
    installHint:
      "Install Ollama: `curl -fsSL https://ollama.com/install.sh | sh` (Linux/macOS) or download it from https://ollama.com/download.",
  },
  {
    id: "qwen",
    label: "Qwen Code",
    command: "qwen",
    versionArgs: ["--version"],
    popular: false,
    presetReady: false,
    notes: [
      "Preset: prompt piped to `qwen` on stdin.",
      "Verify with `amaco provider test qwen`; authenticate by running `qwen` once.",
    ],
    installHint: "Install Qwen Code: `npm install -g @qwen-code/qwen-code`.",
  },
  {
    id: "crush",
    label: "Crush",
    command: "crush",
    versionArgs: ["--version"],
    popular: false,
    presetReady: false,
    notes: [
      "Preset: `crush run` with the prompt as an argument.",
      "Set your model provider's API key, then verify with `amaco provider test crush`.",
    ],
    installHint:
      "Install Crush: `brew install charmbracelet/tap/crush` (macOS) or see https://github.com/charmbracelet/crush.",
  },
  {
    id: "goose",
    label: "Goose",
    command: "goose",
    versionArgs: ["--version"],
    popular: false,
    presetReady: false,
    notes: [
      "Preset: `goose run -t` with the prompt as an argument.",
      "Run `goose configure` to set your provider + key, then verify with `amaco provider test goose`.",
    ],
    installHint: "Install Goose: see https://block.github.io/goose/.",
  },
  {
    id: "cursor",
    label: "Cursor CLI",
    command: "cursor-agent",
    versionArgs: ["--version"],
    popular: false,
    presetReady: false,
    notes: [
      "Preset: `cursor-agent -p` with the prompt as an argument.",
      "Log in with `cursor-agent login`, then verify with `amaco provider test cursor`.",
    ],
    installHint:
      "Install the Cursor CLI: `curl https://cursor.com/install -fsS | bash`.",
  },
  {
    id: "amp",
    label: "Amp",
    command: "amp",
    versionArgs: ["--version"],
    popular: false,
    presetReady: false,
    notes: [
      "Preset: `amp -x` with the prompt as an argument.",
      "Log in with `amp login`, then verify with `amaco provider test amp`.",
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
      popular: def.popular,
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
      popular: def.popular,
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
    popular: def.popular,
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

/**
 * Map a configured provider's command (e.g. "claude", "/usr/local/bin/codex",
 * "cursor-agent") back to its known provider id, so we can look up its login
 * instruction. Returns null for custom commands Amaco doesn't recognize.
 */
export function knownProviderIdForCommand(command: string): KnownProviderId | null {
  const basename = command.split(/[\\/]/).pop() ?? command;
  return KNOWN_PROVIDERS.find((p) => p.command === basename)?.id ?? null;
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
