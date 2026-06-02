// ── Applying a profile's model + effort to the actual spawn ──────────────────
//
// A profile's `model`/`power` (effort) only matter if they reach the provider's
// CLI. Each provider accepts them differently, so this maps the resolved knobs
// to concrete CLI args per provider. Conservative: only providers whose flag we
// are confident about are wired; everything else returns [] (the value stays
// advisory rather than risk injecting a flag the CLI rejects). User-overridable
// catalog comes later (Phase C).

type ArgApply =
  | { kind: "none" }
  | { kind: "flag"; flag: string } // -> [flag, value]
  | { kind: "config"; flag: string; key: string }; // -> [flag, `${key}=${value}`]

type ApplySpec = { model: ArgApply; effort: ArgApply };

const NONE: ArgApply = { kind: "none" };

const APPLY: Record<string, ApplySpec> = {
  // OpenAI Codex CLI: `--model <id>`, reasoning effort via `-c
  // model_reasoning_effort=<level>`.
  codex: {
    model: { kind: "flag", flag: "--model" },
    effort: { kind: "config", flag: "-c", key: "model_reasoning_effort" },
  },
  // Gemini CLI: `--model <id>`. No confirmed discrete effort flag -> advisory.
  gemini: { model: { kind: "flag", flag: "--model" }, effort: NONE },
  // Claude Code: `--model <id>` (applied in claude-code-provider). Headless
  // effort mechanism not confirmed yet, so effort stays advisory.
  claude: { model: { kind: "flag", flag: "--model" }, effort: NONE },
};

function oneArg(a: ArgApply, value?: string | null): string[] {
  if (!value || a.kind === "none") return [];
  if (a.kind === "flag") return [a.flag, value];
  return [a.flag, `${a.key}=${value}`];
}

export type ProfileKnobs = {
  model?: string | null;
  effort?: string | null;
};

/** Extra CLI args that apply a profile's model + effort for `providerId`.
 *  [] when the provider's mechanism is unknown (value remains advisory). */
export function profileSpawnArgs(
  providerId: string,
  knobs: ProfileKnobs,
): string[] {
  const spec = APPLY[providerId];
  if (!spec) return [];
  return [
    ...oneArg(spec.model, knobs.model),
    ...oneArg(spec.effort, knobs.effort),
  ];
}

/** Whether we know how to apply effort for this provider (for honest UI/labels). */
export function effortIsWired(providerId: string): boolean {
  return APPLY[providerId]?.effort.kind !== undefined &&
    APPLY[providerId]?.effort.kind !== "none";
}
