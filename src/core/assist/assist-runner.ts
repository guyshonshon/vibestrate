// ── Assist primitive ────────────────────────────────────────────────────────
//
// One internal, one-shot, READ-ONLY, structured-output run: build a minimal
// prompt, spawn a provider once (gated through the Action Broker like every
// other effect), then parse + Zod-validate the JSON response. No worktree, no
// run lifecycle, no fix loop - the degenerate "ask the model one question and
// get typed data back" path. Reused by "enhance" (decompose a card into a
// checklist) and, later, overview / suggest. Design:
// docs/design/roadmap-and-sequencing.md §1 + §8.

import { z } from "zod";
import { VibestrateError } from "../../utils/errors.js";
import { loadConfig, type LoadedConfig } from "../../project/config-loader.js";
import {
  getCrew,
  getProfile,
  rolesFillingSeat,
} from "../../agents/crew-registry.js";
import { createActionBroker, gateAction } from "../../safety/action-broker.js";
import { runProvider } from "../../providers/provider-runner.js";
import { redactSecretsInText } from "../diff-service.js";
import { failureExcerpt } from "../provider-resilience.js";
import { resolveCatalog } from "../../providers/provider-catalog-overlay.js";
import type { ProvidersConfigMap } from "../../providers/provider-schema.js";
import type { ProviderRunInput } from "../../providers/provider-types.js";
import type { NormalizedMetrics } from "../../providers/output-adapter.js";

export class AssistError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("ASSIST_ERROR", message, cause);
    this.name = "AssistError";
  }
}

/** Provider-spawn seam. Defaults to {@link runProvider}; tests inject a fake.
 *  `stderr`/`stdout` are optional so fakes can omit them, but the real runner
 *  provides them - the error path surfaces their excerpt so a failed assist
 *  says WHY (e.g. "not logged in", "unknown model"), not just "exited 1". */
export type AssistProviderRunner = (
  providers: ProvidersConfigMap,
  input: ProviderRunInput,
) => Promise<{
  exitCode: number;
  normalized: { responseText: string; metrics: NormalizedMetrics | null };
  stderr?: string;
  stdout?: string;
}>;

/** An ad-hoc provider+knob choice that bypasses the saved-profile lookup -
 *  "run this one inquiry on exactly this provider/model/effort". Precedence:
 *  adHocProvider > profileId > crew planner. */
export type AdHocProvider = {
  providerId: string;
  model?: string | null;
  effort?: string | null;
  maxTokens?: number | null;
  timeoutMs?: number | null;
};

export type AssistRequest<T> = {
  projectRoot: string;
  /** Short audit/log label, e.g. "enhance:checklist". */
  label: string;
  /** The instruction/question for the model. */
  instruction: string;
  /** Zod schema the parsed JSON must satisfy. Input is `unknown` (we `safeParse`
   *  raw model output), so schemas that use `.default()` fit cleanly. */
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /** Human-readable shape embedded in the prompt (a JSON sketch). */
  schemaHint: string;
  /** Explicit profile id; else resolved from the crew's read-only planner. */
  profileId?: string | null;
  /** Crew to resolve the default profile from (default: project.defaultCrew). */
  crewId?: string | null;
  /** Ad-hoc provider/model/effort override; wins over profileId/crew. */
  adHocProvider?: AdHocProvider | null;
  /** Pre-loaded config to avoid re-reading from disk. */
  loaded?: LoadedConfig;
  /** Max provider attempts (a parse failure re-prompts once). Default 2. */
  maxAttempts?: number;
  /** Audit bucket - effects log under `runs/<bucket>/`. Default "assist".
   *  Consult passes "consult" so its evidence sits in its own bucket. */
  auditBucket?: string;
  signal?: AbortSignal;
  /** Test seam - defaults to the real provider runner. */
  runner?: AssistProviderRunner;
};

export type AssistResult<T> = {
  parsed: T;
  raw: string;
  attempts: number;
  providerId: string;
  profileId: string;
  /** The model + effort actually requested at spawn (null = provider default). */
  model: string | null;
  effort: string | null;
  metrics: NormalizedMetrics | null;
};

/** The resolved provider + runtime knobs for an assist spawn. */
export type AssistTarget = {
  profileId: string;
  providerId: string;
  model: string | null;
  effort: string | null;
  maxTokens: number | null;
  timeoutMs: number | null;
};

/** Stable audit bucket - assist effects append to runs/assist/actions.ndjson.
 *  It has no state.json, so the runs listing skips it (not a real run). */
const ASSIST_RUN_ID = "assist";

/**
 * Resolve which profile/provider an assist should use: an explicit `profileId`,
 * else the read-only **planner** of the (default) crew, else that crew's first
 * role. Planner is the natural assist seat - read-only, planning-shaped.
 */
export function resolveAssistTarget(
  loaded: LoadedConfig,
  opts: { profileId?: string | null; crewId?: string | null; adHoc?: AdHocProvider | null } = {},
): AssistTarget {
  const { config } = loaded;
  // Ad-hoc wins: run exactly this provider/model/effort, no profile lookup.
  if (opts.adHoc) {
    if (!config.providers[opts.adHoc.providerId]) {
      throw new AssistError(`Unknown provider "${opts.adHoc.providerId}".`);
    }
    return {
      profileId: "(ad-hoc)",
      providerId: opts.adHoc.providerId,
      model: opts.adHoc.model ?? null,
      effort: opts.adHoc.effort ?? null,
      maxTokens: opts.adHoc.maxTokens ?? null,
      timeoutMs: opts.adHoc.timeoutMs ?? null,
    };
  }
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
  return {
    profileId,
    providerId: profile.provider,
    model: profile.model ?? null,
    effort: profile.power ?? null,
    maxTokens: profile.maxTokens ?? null,
    timeoutMs: profile.timeoutMs ?? null,
  };
}

function buildAssistPrompt(req: {
  label: string;
  instruction: string;
  schemaHint: string;
  rules: string;
  retryError?: string;
}): string {
  const parts = [
    `# Vibestrate Assist - ${req.label}`,
    "You are a read-only planning assistant. Do not modify any files, run any commands, or take any action. Produce structured data only.",
  ];
  if (req.rules.trim()) {
    parts.push("## Project context\n" + req.rules.trim());
  }
  parts.push("## Task\n" + req.instruction.trim());
  parts.push(
    "## Response format\n" +
      "Respond with ONLY valid JSON matching this shape - no prose, no explanation, no markdown code fences:\n" +
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
  const { profileId, providerId, model, effort, maxTokens, timeoutMs } = resolveAssistTarget(
    loaded,
    {
      profileId: req.profileId,
      crewId: req.crewId,
      adHoc: req.adHocProvider,
    },
  );
  const runner = req.runner ?? runProvider;
  const maxAttempts = Math.max(1, req.maxAttempts ?? 2);
  // Resolve the capability catalog so the provider actually applies model/effort
  // (built-in + project overlay). Best-effort: a failure falls back to built-ins.
  const catalog = await resolveCatalog(req.projectRoot).catch(() => undefined);

  // Gate the spawn through the Action Broker (the "one boundary" guarantee).
  const bucket = req.auditBucket ?? ASSIST_RUN_ID;
  const broker = createActionBroker(req.projectRoot, bucket);
  const request = {
    runId: bucket,
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
  // The real provider failure reason (redacted excerpt of stderr/stdout) from
  // the most recent non-zero exit - surfaced in the thrown message so the user
  // sees WHY, not just an exit code.
  let lastFailureReason = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Redact secret-shaped tokens from the WHOLE assembled prompt before it ever
    // reaches a provider. assist/consult feed free-text (the question, prior
    // answers, view snapshots, rules) that file-source materialization never sees,
    // so this is the one chokepoint that makes every assist + consult path
    // redacted-by-default (no-secrets-exposure invariant). High-precision patterns
    // => effectively no false positives on structural prompt text.
    const prompt = redactSecretsInText(
      buildAssistPrompt({
        label: req.label,
        instruction: req.instruction,
        schemaHint: req.schemaHint,
        rules: loaded.rules,
        retryError: attempt > 1 ? lastError : undefined,
      }),
    ).redacted;
    const result = await runner(loaded.config.providers, {
      providerId,
      prompt,
      cwd: req.projectRoot,
      // Apply the resolved knobs so the chosen model/effort actually take effect
      // (provider-apply maps them to the right CLI flag / request-body field).
      model: model ?? undefined,
      effort: effort ?? undefined,
      maxTokens: maxTokens ?? undefined,
      timeoutMs: timeoutMs ?? undefined,
      catalog,
      signal: req.signal,
    });
    metrics = result.normalized.metrics;
    lastRaw = result.normalized.responseText;

    if (result.exitCode !== 0) {
      // Surface the provider's OWN error output (stderr first, then stdout,
      // then any normalized text) - that line is what tells the user the real
      // cause (not authenticated, unknown model, bad flag) instead of a bare
      // exit code. Redacted via failureExcerpt.
      const reason = failureExcerpt(
        result.stderr || result.stdout || result.normalized.responseText || "",
      );
      lastFailureReason = reason;
      lastError = reason
        ? `the ${providerId} CLI exited ${result.exitCode}: ${reason}`
        : `the ${providerId} CLI exited ${result.exitCode} with no error output (is it installed and authenticated? try \`${providerId}\` directly, or \`vibe provider test ${providerId}\`).`;
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
      data: { providerId, profileId, model, effort, attempts: attempt },
    });
    return {
      parsed: validated.data,
      raw: result.normalized.responseText,
      attempts: attempt,
      providerId,
      profileId,
      model,
      effort,
      metrics,
    };
  }

  await broker.record(request, gate.decision, {
    ok: false,
    summary: `assist:${req.label} failed after ${maxAttempts} attempt(s)`,
    data: { providerId, profileId },
  });
  // Lead with the real cause in plain words, then the spawn details the user
  // needs to debug it (which provider/model/effort actually ran). A provider
  // that exited non-zero is the common case (auth/model/flag); a parse failure
  // names the shape mismatch instead.
  const target = `${providerId}${model ? ` · model ${model}` : ""}${effort ? ` · effort ${effort}` : ""}`;
  const headline = lastFailureReason
    ? lastFailureReason
    : lastError || "the provider produced no usable response.";
  throw new AssistError(
    `Couldn't complete "${req.label}": ${headline}\n` +
      `Provider used: ${target} (${maxAttempts} attempt(s)).` +
      (lastFailureReason
        ? ""
        : `\nLast error: ${lastError}`) +
      (lastRaw ? `\n\nLast raw response:\n${lastRaw.slice(0, 800)}` : ""),
  );
}
