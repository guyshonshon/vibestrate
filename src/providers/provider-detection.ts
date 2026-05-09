import { execa } from "execa";

export type KnownProviderId = "claude" | "codex" | "opencode" | "aider";

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
    presetReady: false,
    notes: [
      "Detected, but Amaco does not ship a verified prompt-flag preset.",
      "Run `amaco provider setup` to confirm command, args, and input mode.",
    ],
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
      notes: [`${def.command} is not on PATH.`],
    };
  }

  if (result.exitCode !== 0) {
    return {
      id: def.id,
      label: def.label,
      command: def.command,
      available: false,
      detectionMethod: "failed",
      confidence: "missing",
      recommended: false,
      notes: [
        `${def.command} returned exit code ${result.exitCode} for ${def.versionArgs.join(" ")}.`,
        result.stderr.trim() || "Command may be installed but not configured.",
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
