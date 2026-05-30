// ── Assist primitive (Phase 3) ─────────────────────────────────────────────
//
// One internal, one-shot, READ-ONLY, structured-output run: build a minimal
// prompt, spawn a provider once (gated through the Action Broker like every
// other effect), then parse + Zod-validate the JSON response. No worktree, no
// run lifecycle, no fix loop — the degenerate "ask the model one question and
// get typed data back" path. Reused by "enhance" (decompose a card into a
// checklist) and, later, overview / suggest. Design:
// docs/design/roadmap-and-sequencing.md §1 + §8.

import { z } from "zod";
import { VibestrateError } from "../utils/errors.js";
import { loadConfig, type LoadedConfig } from "../project/config-loader.js";
import {
  getCrew,
  getProfile,
  rolesFillingSeat,
} from "../crews/crew-registry.js";
import { createActionBroker, gateAction } from "../safety/action-broker.js";
import { runProvider } from "../providers/provider-runner.js";
import type { ProvidersConfigMap } from "../providers/provider-schema.js";
import type { ProviderRunInput } from "../providers/provider-types.js";
import type { NormalizedMetrics } from "../providers/output-adapter.js";

export class AssistError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("ASSIST_ERROR", message, cause);
    this.name = "AssistError";
  }
}

/** Provider-spawn seam. Defaults to {@link runProvider}; tests inject a fake. */
export type AssistProviderRunner = (
  providers: ProvidersConfigMap,
  input: ProviderRunInput,
) => Promise<{
  exitCode: number;
  normalized: { responseText: string; metrics: NormalizedMetrics | null };
}>;

export type AssistRequest<T> = {
  projectRoot: string;
  /** Short audit/log label, e.g. "enhance:checklist". */
  label: string;
  /** The instruction/question for the model. */
  instruction: string;
  /** Zod schema the parsed JSON must satisfy. */
  schema: z.ZodType<T>;
  /** Human-readable shape embedded in the prompt (a JSON sketch). */
  schemaHint: string;
  /** Explicit profile id; else resolved from the crew's read-only planner. */
  profileId?: string | null;
  /** Crew to resolve the default profile from (default: project.defaultCrew). */
  crewId?: string | null;
  /** Pre-loaded config to avoid re-reading from disk. */
  loaded?: LoadedConfig;
  /** Max provider attempts (a parse failure re-prompts once). Default 2. */
  maxAttempts?: number;
  signal?: AbortSignal;
  /** Test seam — defaults to the real provider runner. */
  runner?: AssistProviderRunner;
};

export type AssistResult<T> = {
  parsed: T;
  raw: string;
  attempts: number;
  providerId: string;
  profileId: string;
  metrics: NormalizedMetrics | null;
};

/** Stable audit bucket — assist effects append to runs/assist/actions.ndjson.
 *  It has no state.json, so the runs listing skips it (not a real run). */
const ASSIST_RUN_ID = "assist";

/**
 * Resolve which profile/provider an assist should use: an explicit `profileId`,
 * else the read-only **planner** of the (default) crew, else that crew's first
 * role. Planner is the natural assist seat — read-only, planning-shaped.
 */
export function resolveAssistTarget(
  loaded: LoadedConfig,
  opts: { profileId?: string | null; crewId?: string | null } = {},
): { profileId: string; providerId: string } {
  const { config } = loaded;
  let profileId = opts.profileId ?? null;
  if (!profileId) {
    const { crew } = getCrew(config, opts.crewId);
    const planner = rolesFillingSeat(crew, "planner")[0];
    const fallback = Object.values(crew.roles)[0];
    const role = planner?.role ?? fallback;
    if (!role) {
      throw new AssistError(
        "No role available to resolve an assist profile from. Pass an explicit profileId.",
      );
    }
    profileId = role.profile;
  }
  const profile = getProfile(config, profileId);
  return { profileId, providerId: profile.provider };
}

function buildAssistPrompt(req: {
  label: string;
  instruction: string;
  schemaHint: string;
  rules: string;
  retryError?: string;
}): string {
  const parts = [
    `# Vibestrate Assist — ${req.label}`,
    "You are a read-only planning assistant. Do not modify any files, run any commands, or take any action. Produce structured data only.",
  ];
  if (req.rules.trim()) {
    parts.push("## Project context\n" + req.rules.trim());
  }
  parts.push("## Task\n" + req.instruction.trim());
  parts.push(
    "## Response format\n" +
      "Respond with ONLY valid JSON matching this shape — no prose, no explanation, no markdown code fences:\n" +
      req.schemaHint.trim(),
  );
  if (req.retryError) {
    parts.push(
      "## Your previous response was rejected\n" +
        req.retryError.trim() +
        "\nReturn ONLY the corrected JSON.",
    );
  }
  return parts.join("\n\n");
}

/**
 * Extract the first balanced JSON value (object or array) from model text,
 * tolerating markdown fences and surrounding prose. Returns the raw JSON
 * substring, or null if none is found.
 */
export function extractJson(text: string): string | null {
  let s = text.trim();
  // Strip a leading ```json / ``` fence and its closing fence if present.
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1]) s = fence[1].trim();
  const start = s.search(/[[{]/);
  if (start < 0) return null;
  const open = s[start]!;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export async function runAssist<T>(req: AssistRequest<T>): Promise<AssistResult<T>> {
  const loaded = req.loaded ?? (await loadConfig(req.projectRoot));
  const { profileId, providerId } = resolveAssistTarget(loaded, {
    profileId: req.profileId,
    crewId: req.crewId,
  });
  const runner = req.runner ?? runProvider;
  const maxAttempts = Math.max(1, req.maxAttempts ?? 2);

  // Gate the spawn through the Action Broker (the "one boundary" guarantee).
  const broker = createActionBroker(req.projectRoot, ASSIST_RUN_ID);
  const request = {
    runId: ASSIST_RUN_ID,
    kind: "provider.spawn" as const,
    subject: { providerId, cwd: req.projectRoot, label: req.label, assist: true },
    proposedBy: "system" as const,
  };
  const gate = await gateAction(broker, request);
  if (!gate.allowed) {
    throw new AssistError(
      `Assist "${req.label}" blocked by policy (${gate.effect}): ${gate.reason}`,
    );
  }

  let lastError = "";
  let metrics: NormalizedMetrics | null = null;
  let lastRaw = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = buildAssistPrompt({
      label: req.label,
      instruction: req.instruction,
      schemaHint: req.schemaHint,
      rules: loaded.rules,
      retryError: attempt > 1 ? lastError : undefined,
    });
    const result = await runner(loaded.config.providers, {
      providerId,
      prompt,
      cwd: req.projectRoot,
      signal: req.signal,
    });
    metrics = result.normalized.metrics;
    lastRaw = result.normalized.responseText;

    if (result.exitCode !== 0) {
      lastError = `The provider exited with code ${result.exitCode}.`;
      continue;
    }
    const jsonText = extractJson(result.normalized.responseText);
    if (!jsonText) {
      lastError = "No JSON object/array was found in the response.";
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(jsonText);
    } catch (err) {
      lastError = `The JSON did not parse: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
    const validated = req.schema.safeParse(value);
    if (!validated.success) {
      lastError =
        "The JSON did not match the required shape:\n" +
        validated.error.issues
          .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("\n");
      continue;
    }
    await broker.record(request, gate.decision, {
      ok: true,
      summary: `assist:${req.label} ok (attempt ${attempt})`,
      data: { providerId, profileId, attempts: attempt },
    });
    return {
      parsed: validated.data,
      raw: result.normalized.responseText,
      attempts: attempt,
      providerId,
      profileId,
      metrics,
    };
  }

  await broker.record(request, gate.decision, {
    ok: false,
    summary: `assist:${req.label} failed after ${maxAttempts} attempt(s)`,
    data: { providerId, profileId },
  });
  throw new AssistError(
    `Assist "${req.label}" failed after ${maxAttempts} attempt(s). Last error: ${lastError}` +
      (lastRaw ? `\n\nLast raw response:\n${lastRaw.slice(0, 800)}` : ""),
  );
}
