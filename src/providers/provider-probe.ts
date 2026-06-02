// ── Best-effort provider probing (catalog auto-fill, local only) ─────────────
//
// `vibe provider refresh` spawns a configured CLI provider's `--help` and
// heuristically parses its model / effort knobs, then writes them into the
// `.vibestrate/providers-catalog.yml` overlay FOR REVIEW. It fills gaps only -
// it never overrides a built-in spec or a hand-authored overlay entry unless
// `--force`. Local only: it runs the provider's own `--help` (the same binary
// Vibestrate already drives), no network egress and no API keys. Parsing help
// text is inherently heuristic, so findings are written for the user to confirm,
// not trusted blindly (the catalog view shows source = overlay).

import YAML from "yaml";
import { runArgvCommand } from "../execution/command-runner.js";
import { loadConfig } from "../project/config-loader.js";
import { providerCatalogOverlayPath } from "../utils/paths.js";
import { writeText } from "../utils/fs.js";
import { effortLevels, modelIsWired, type ArgApply } from "./provider-apply.js";
import { loadCatalogOverlay, type CatalogOverlay } from "./provider-catalog-overlay.js";

const HELP_TIMEOUT_MS = 10_000;

/** Pull enumerated choices out of a help segment, in the common forms:
 *  `<a|b|c>`, `[a|b|c]`, `{a,b,c}`, `(choices: "a", "b", "c")`. Returns clean,
 *  identifier-shaped tokens (filters prose so we don't write garbage levels). */
export function extractChoices(segment: string): string[] {
  const candidates: string[] = [];
  const choicesParen = segment.match(/\(choices:\s*([^)]+)\)/i);
  if (choicesParen) candidates.push(...choicesParen[1]!.split(","));
  else {
    const angle = segment.match(/<([^>]*\|[^>]*)>/);
    const square = segment.match(/\[([^\]]*\|[^\]]*)\]/);
    const brace = segment.match(/\{([^}]*,[^}]*)\}/);
    if (angle) candidates.push(...angle[1]!.split("|"));
    else if (square) candidates.push(...square[1]!.split("|"));
    else if (brace) candidates.push(...brace[1]!.split(","));
  }
  const cleaned = candidates
    .map((c) => c.trim().replace(/^["']|["']$/g, "").trim())
    .filter((c) => /^[a-z0-9][a-z0-9._-]{0,30}$/i.test(c));
  return [...new Set(cleaned)];
}

export type ProbedKnobs = {
  /** Effort flag + levels, if a `--…effort…` flag with enumerated choices. */
  effort?: { flag: string; levels: string[] };
  /** Whether a `--model` flag exists, and any enumerated model choices. */
  modelFlag?: string;
  models: string[];
};

/** Heuristically parse a CLI's `--help` for model + effort knobs. */
export function parseHelpForKnobs(helpText: string): ProbedKnobs {
  const out: ProbedKnobs = { models: [] };
  const lines = helpText.split("\n");
  for (const line of lines) {
    // Effort-ish flag (--effort, --reasoning-effort, --thinking_effort, …).
    const effortFlag = line.match(/--[\w-]*effort[\w-]*/i);
    if (effortFlag && !out.effort) {
      const after = line.slice(line.indexOf(effortFlag[0]) + effortFlag[0].length);
      const levels = extractChoices(after) || [];
      if (levels.length > 0) out.effort = { flag: effortFlag[0], levels };
    }
    // Model flag.
    const modelFlag = line.match(/--model\b/);
    if (modelFlag && !out.modelFlag) {
      out.modelFlag = "--model";
      const after = line.slice(line.indexOf(modelFlag[0]) + modelFlag[0].length);
      const choices = extractChoices(after);
      if (choices.length > 0) out.models = choices;
    }
  }
  return out;
}

export type ProbeStatus =
  | "added"
  | "skipped-overlay"
  | "skipped-builtin"
  | "nothing-found"
  | "probe-failed"
  | "not-cli";

export type ProbeFinding = {
  providerId: string;
  status: ProbeStatus;
  effort?: { flag: string; levels: string[] };
  models?: string[];
  detail?: string;
};

/** Injectable for tests: run `<command> --help` and return its output. */
export type HelpRunner = (
  command: string,
  cwd: string,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

const defaultRunner: HelpRunner = async (command, cwd) => {
  const r = await runArgvCommand({
    command,
    args: ["--help"],
    cwd,
    timeoutMs: HELP_TIMEOUT_MS,
  });
  return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
};

export type RefreshResult = {
  findings: ProbeFinding[];
  wrote: boolean;
  overlayPath: string;
};

/**
 * Probe configured CLI providers and write discovered knobs into the overlay
 * (gap-fill only). Returns a per-provider report. `dryRun` parses + reports but
 * writes nothing; `force` lets a probe overwrite an existing overlay/built-in
 * entry; `providerId` restricts to one provider.
 */
export async function refreshCatalog(
  projectRoot: string,
  opts: {
    providerId?: string;
    force?: boolean;
    dryRun?: boolean;
    runner?: HelpRunner;
  } = {},
): Promise<RefreshResult> {
  const runner = opts.runner ?? defaultRunner;
  const { config } = await loadConfig(projectRoot);
  const overlay = await loadCatalogOverlay(projectRoot);
  const overlayPath = providerCatalogOverlayPath(projectRoot);

  const findings: ProbeFinding[] = [];
  const nextCli: Record<string, NonNullable<CatalogOverlay["cli"]>[string]> = {
    ...(overlay.cli ?? {}),
  };
  let added = 0;

  const ids = opts.providerId
    ? [opts.providerId]
    : Object.keys(config.providers);

  for (const id of ids) {
    const provider = config.providers[id];
    if (!provider) {
      findings.push({ providerId: id, status: "probe-failed", detail: "not configured" });
      continue;
    }
    if (provider.type !== "cli" && provider.type !== "claude-code") {
      findings.push({ providerId: id, status: "not-cli", detail: `type ${provider.type}` });
      continue;
    }
    const command = provider.type === "cli" ? provider.command : "claude";

    let knobs: ProbedKnobs;
    try {
      const r = await runner(command, projectRoot);
      knobs = parseHelpForKnobs(`${r.stdout}\n${r.stderr}`);
    } catch (err) {
      findings.push({
        providerId: id,
        status: "probe-failed",
        detail: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (!knobs.effort && !knobs.modelFlag) {
      findings.push({ providerId: id, status: "nothing-found" });
      continue;
    }
    // Gap-fill: don't clobber a hand-authored overlay entry or a built-in spec.
    const overlayKey = provider.type === "claude-code" ? "claude" : id;
    if (overlay.cli?.[overlayKey] && !opts.force) {
      findings.push({ providerId: id, status: "skipped-overlay", ...knobsToFinding(knobs) });
      continue;
    }
    const builtinWired = effortLevels(overlayKey).length > 0 || modelIsWired(overlayKey);
    if (builtinWired && !opts.force) {
      findings.push({ providerId: id, status: "skipped-builtin", ...knobsToFinding(knobs) });
      continue;
    }

    const entry: NonNullable<CatalogOverlay["cli"]>[string] = {};
    if (knobs.modelFlag) {
      entry.model = { kind: "flag", flag: knobs.modelFlag } as ArgApply;
      if (knobs.models.length > 0) entry.models = knobs.models;
    }
    if (knobs.effort) {
      entry.effort = {
        levels: knobs.effort.levels,
        apply: { kind: "flag", flag: knobs.effort.flag } as ArgApply,
      };
    }
    nextCli[overlayKey] = entry;
    added++;
    findings.push({ providerId: id, status: "added", ...knobsToFinding(knobs) });
  }

  let wrote = false;
  if (added > 0 && !opts.dryRun) {
    const merged: CatalogOverlay = { ...overlay, cli: nextCli };
    const header =
      "# Provider capability overlay - merged over Vibestrate's built-in catalog.\n" +
      "# Auto-updated by `vibe provider refresh`; review before relying on it.\n" +
      "# A knob only applies where it maps to a real flag/field (no advisory dials).\n";
    await writeText(overlayPath, `${header}${YAML.stringify(merged)}`);
    wrote = true;
  }

  return { findings, wrote, overlayPath };
}

function knobsToFinding(k: ProbedKnobs): Pick<ProbeFinding, "effort" | "models"> {
  return {
    ...(k.effort ? { effort: k.effort } : {}),
    ...(k.models.length > 0 ? { models: k.models } : {}),
  };
}
