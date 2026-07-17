// ── "analyze deeper" (design/merge-advisor.md) ───────────────
//
// An OPTIONAL, read-only consult-style LLM pass over a merge-ready run's diff
// vs main, plus deterministic hot-path context. It is ADVISORY PROSE ONLY: it
// runs AFTER and INDEPENDENT of the deterministic advice, and it can never
// change `recommendation` or `flags` (those are computed in merge-advisor.ts
// without any model). The model surfaces semantic risk in the change content
// that a textual conflict check and the check-lanes cannot see.
//
// Safety: text sent to the provider passes the existing redaction rules -
// secret-like FILES are suppressed (path only), and high-precision
// secret-shaped CONTENT (vendor token shapes) is `[REDACTED:…]`'d via
// redactSecretsInText, applied to every diff body AND to the file-path
// headers and the run task string. (Redaction is the same high-precision
// pattern set apply uses; generic non-vendor secrets are not caught - same
// limitation as the apply gate.) Diff is byte-capped. The provider spawn is
// broker-gated through the assist primitive, creates no run, and writes only
// a cached markdown artifact under the run's own dir.

import { z } from "zod";
import { execa } from "execa";
import { VibestrateError } from "../utils/errors.js";
import { loadConfig } from "../project/config-loader.js";
import { readJson } from "../utils/json.js";
import { pathExists } from "../utils/fs.js";
import { runStatePath } from "../utils/paths.js";
import { runStateSchema } from "../core/state-machine.js";
import { refExists } from "./git.js";
import { runAssist, type AssistProviderRunner } from "../core/assist/assist-runner.js";
import { ArtifactStore } from "../core/stores/artifact-store.js";
import { isSecretLikePath, redactSecretsInText } from "../core/diff-service.js";
import { listMergeReadyRuns } from "./integration-service.js";

export class MergeAnalyzeError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("MERGE_ANALYZE_ERROR", message, cause);
    this.name = "MergeAnalyzeError";
  }
}

/** Hard cap on the diff text handed to the provider (defense + cost). */
const DIFF_CAP_BYTES = 64 * 1024;
/** Most other merge-ready runs to scan for file overlap. */
const MAX_OTHER_RUNS = 20;

export const mergeAnalysisSchema = z
  .object({
    /** 1-3 sentence plain-language risk summary of the change content. */
    summary: z.string().min(1),
    /** Specific risks the diff raises; empty is a valid "nothing stood out". */
    findings: z
      .array(
        z.object({
          area: z.string().min(1),
          severity: z.enum(["info", "caution", "concern"]),
          detail: z.string().min(1),
        }),
      )
      .default([]),
    /** How well-grounded the read is - never laundered as a merge verdict. */
    confidence: z.enum(["low", "medium", "high"]),
    /** What the model could NOT verify from the diff + context. */
    caveats: z.array(z.string()).default([]),
  })
  .strict();
export type MergeAnalysis = z.infer<typeof mergeAnalysisSchema>;

const MERGE_ANALYSIS_HINT = `{
  "summary": "string - 1-3 sentences on the risk in this change's CONTENT",
  "findings": [{ "area": "string e.g. concurrency|error-handling|api-compat|tests", "severity": "info | caution | concern", "detail": "string" }],
  "confidence": "low | medium | high",
  "caveats": ["string - what you could NOT verify from the diff + context"]
}`;

/** The deterministic context assembled for the pass - returned so the surface
 *  can show exactly what was (and was not) fed to the model. */
export type MergeAnalysisContext = {
  branchName: string;
  filesInDiff: number;
  /** Secret-like files whose BODIES were suppressed (paths still listed). */
  suppressedSecretFiles: string[];
  /** High-precision secret tokens redacted out of the diff bodies. */
  redactedTokenCount: number;
  /** Diff body was truncated at the byte cap. */
  truncated: boolean;
  /** Files in this diff that other merge-ready runs also touch (overlap risk). */
  overlaps: { file: string; otherRunIds: string[] }[];
  /** Whether the project has validate commands that would exercise the change.
   *  A PROXY for "test coverage of touched files" - not real
   *  coverage data. */
  validation: { configured: boolean; commandCount: number };
};

export type MergeAnalysisResult = {
  runId: string;
  analysis: MergeAnalysis;
  context: MergeAnalysisContext;
  /** Markdown rendering, also written to the artifact path below. */
  markdown: string;
  /** Path of the cached artifact under the run's dir (relative to project). */
  cachedArtifactPath: string;
  providerId: string;
  model: string | null;
  effort: string | null;
  /** Non-fatal context notes (e.g. a skipped run with no branch). */
  notes: string[];
};

async function gitLines(
  projectRoot: string,
  args: string[],
): Promise<string[]> {
  const r = await execa("git", args, {
    cwd: projectRoot,
    reject: false,
    stdin: "ignore",
    timeout: 15_000,
  });
  if (r.exitCode !== 0) return [];
  return r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Changed file paths a branch introduces vs main (three-dot = merge-base),
 *  read-only and worktree-independent (refs are global). */
async function changedFiles(
  projectRoot: string,
  mainBranch: string,
  branchName: string,
): Promise<string[]> {
  const lines = await gitLines(projectRoot, [
    "diff",
    "--name-only",
    `${mainBranch}...${branchName}`,
  ]);
  return [...new Set(lines)];
}

/** Build the byte-capped, redacted diff text fed to the provider. Secret-like
 *  files are suppressed to path-only; secret-shaped content is redacted. */
async function collectRedactedDiff(input: {
  projectRoot: string;
  mainBranch: string;
  branchName: string;
}): Promise<{
  text: string;
  files: string[];
  filesInDiff: number;
  suppressedSecretFiles: string[];
  redactedTokenCount: number;
  truncated: boolean;
}> {
  const files = await changedFiles(
    input.projectRoot,
    input.mainBranch,
    input.branchName,
  );
  const suppressedSecretFiles: string[] = [];
  const parts: string[] = [];
  let bytes = 0;
  let truncated = false;
  let redactedTokenCount = 0;

  for (const file of files) {
    if (isSecretLikePath(file)) {
      suppressedSecretFiles.push(file);
      continue;
    }
    if (truncated) continue;
    const body = (
      await execa(
        "git",
        [
          "diff",
          "--no-ext-diff",
          "--no-color",
          `${input.mainBranch}...${input.branchName}`,
          "--",
          file,
        ],
        { cwd: input.projectRoot, reject: false, stdin: "ignore", timeout: 15_000 },
      )
    ).stdout;
    if (!body.trim()) continue;
    // Redact BOTH the path header and the body - a token-shaped file path
    // would otherwise reach the prompt unredacted.
    const headerRes = redactSecretsInText(`### ${file}`);
    const bodyRes = redactSecretsInText(body);
    redactedTokenCount += headerRes.count + bodyRes.count;
    const block = `${headerRes.redacted}\n${bodyRes.redacted}\n`;
    const blockBytes = Buffer.byteLength(block, "utf8");
    if (bytes + blockBytes > DIFF_CAP_BYTES) {
      // Slice operates on already-redacted text, so it can only ever cut a
      // [REDACTED:…] marker, never re-expose a token.
      const remaining = DIFF_CAP_BYTES - bytes;
      if (remaining > 200) {
        parts.push(block.slice(0, remaining) + "\n…(diff truncated)\n");
      }
      truncated = true;
      continue;
    }
    parts.push(block);
    bytes += blockBytes;
  }

  return {
    text: parts.join("\n"),
    files,
    filesInDiff: files.length,
    suppressedSecretFiles,
    redactedTokenCount,
    truncated,
  };
}

/** Files in this run's diff that other merge-ready runs also touch - an
 *  ordering/overlap risk the textual conflict check sees only cumulatively. */
async function collectOverlaps(input: {
  projectRoot: string;
  mainBranch: string;
  runId: string;
  branchName: string;
  thisFiles: string[];
}): Promise<{ overlaps: { file: string; otherRunIds: string[] }[]; notes: string[] }> {
  const notes: string[] = [];
  const ready = (await listMergeReadyRuns(input.projectRoot))
    .filter((r) => r.runId !== input.runId)
    .slice(0, MAX_OTHER_RUNS);
  const thisSet = new Set(input.thisFiles);
  const byFile = new Map<string, string[]>();
  for (const other of ready) {
    if (!(await refExists(input.projectRoot, other.branchName))) {
      notes.push(`Skipped overlap check for ${other.runId}: branch missing.`);
      continue;
    }
    const otherFiles = await changedFiles(
      input.projectRoot,
      input.mainBranch,
      other.branchName,
    );
    for (const f of otherFiles) {
      if (!thisSet.has(f)) continue;
      const list = byFile.get(f) ?? [];
      list.push(other.runId);
      byFile.set(f, list);
    }
  }
  const overlaps = [...byFile.entries()]
    .map(([file, otherRunIds]) => ({ file, otherRunIds }))
    .sort((a, b) => a.file.localeCompare(b.file));
  return { overlaps, notes };
}

function buildInstruction(input: {
  task: string;
  branchName: string;
  mainBranch: string;
  ctx: MergeAnalysisContext;
  diffText: string;
}): string {
  const overlapLines = input.ctx.overlaps.length
    ? input.ctx.overlaps
        .map((o) => `- ${o.file} (also touched by: ${o.otherRunIds.join(", ")})`)
        .join("\n")
    : "(none)";
  return [
    "You are Vibestrate's merge analyst. A deterministic advisor has ALREADY decided how this change should land (finish / stage / resolve) and surfaced check-lane gaps. That gating is not your job and you must not repeat or override it.",
    "Your ONLY job: read the actual diff below and surface SEMANTIC risk in the change's content that a textual merge check and pass/fail check-lanes cannot see - concurrency hazards, error-handling gaps, API/behavioural compatibility breaks, missing tests for risky logic, security-sensitive edits.",
    "You are READ-ONLY and you are NOT a merge verdict: never say 'safe to merge' or 'do not merge'. Report risk; the human decides. If the diff is small and unremarkable, say so plainly with an empty or short findings list and do not invent concerns.",
    "Be honest about your boundary: you see a byte-capped, secret-redacted diff and the context below - not the running system. State what you could not verify in `caveats` and set `confidence` accordingly.",
    "",
    // Task is free user text - redact token shapes before it enters the prompt.
    `# Change: ${redactSecretsInText(input.task).redacted}`,
    `Branch ${input.branchName} vs ${input.mainBranch}. Files in diff: ${input.ctx.filesInDiff}.`,
    input.ctx.suppressedSecretFiles.length
      ? `Secret-like files were suppressed (bodies not shown): ${input.ctx.suppressedSecretFiles.join(", ")}.`
      : "No secret-like files in the diff.",
    input.ctx.truncated ? "NOTE: the diff was truncated at the size cap - you may not have seen all of it." : "",
    `Validation configured for this project: ${input.ctx.validation.configured ? `yes (${input.ctx.validation.commandCount} command(s)) - they would run over this change` : "no - nothing would automatically exercise this change"}.`,
    "",
    "# Files also being merged elsewhere (overlap risk)",
    overlapLines,
    "",
    "# Diff (redacted, may be truncated)",
    input.diffText.trim() || "(empty diff)",
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderMergeAnalysisMarkdown(
  runId: string,
  task: string,
  a: MergeAnalysis,
  ctx: MergeAnalysisContext,
): string {
  const lines: string[] = [];
  lines.push(`# Merge analysis - ${task}`);
  lines.push("");
  lines.push("_Advisory only. The deterministic advisor decides how this change");
  lines.push("lands; this is a model's read of the diff content and never a merge");
  lines.push("verdict._");
  lines.push("");
  lines.push(`**Summary.** ${a.summary}`);
  lines.push("");
  lines.push(`Confidence: ${a.confidence}.`);
  lines.push("");
  if (a.findings.length) {
    lines.push("## Findings");
    for (const f of a.findings) {
      lines.push(`- **[${f.severity}] ${f.area}** - ${f.detail}`);
    }
    lines.push("");
  } else {
    lines.push("No specific risks stood out in the diff.");
    lines.push("");
  }
  if (a.caveats.length) {
    lines.push("## Could not verify");
    for (const c of a.caveats) lines.push(`- ${c}`);
    lines.push("");
  }
  lines.push("## Context fed to the analysis");
  lines.push(`- Files in diff: ${ctx.filesInDiff}`);
  if (ctx.suppressedSecretFiles.length) {
    lines.push(`- Secret-like files suppressed: ${ctx.suppressedSecretFiles.join(", ")}`);
  }
  if (ctx.redactedTokenCount > 0) {
    lines.push(`- Secret-shaped tokens redacted from the diff: ${ctx.redactedTokenCount}`);
  }
  if (ctx.truncated) lines.push("- Diff was truncated at the size cap");
  if (ctx.overlaps.length) {
    lines.push("- Files also being merged by other runs:");
    for (const o of ctx.overlaps) {
      lines.push(`  - ${o.file} (${o.otherRunIds.join(", ")})`);
    }
  }
  lines.push(
    `- Validation: ${ctx.validation.configured ? `${ctx.validation.commandCount} command(s) configured (proxy for coverage)` : "none configured"}`,
  );
  lines.push("");
  return lines.join("\n");
}

/** Run the optional analyze-deeper pass for one merge-ready run. Throws
 *  MergeAnalyzeError on a bad/absent run or an unreachable provider; the
 *  caller surfaces it as a clear message (never a silent pass). */
export async function analyzeMergeDeeper(input: {
  projectRoot: string;
  runId: string;
  /** Test seam forwarded to the assist primitive. */
  runner?: AssistProviderRunner;
  signal?: AbortSignal;
}): Promise<MergeAnalysisResult> {
  const loaded = await loadConfig(input.projectRoot).catch(() => null);
  if (!loaded) {
    throw new MergeAnalyzeError(
      "Project is not initialized (no .vibestrate/project.yml).",
    );
  }
  const mainBranch = loaded.config.git.mainBranch;

  // Path-guard the runId before it reaches the filesystem (defense in depth;
  // the HTTP route also guards). Mirrors server RUN_ID_RE.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.runId) || input.runId.includes("..")) {
    throw new MergeAnalyzeError(`Invalid run id: ${input.runId}`);
  }

  const stateFile = runStatePath(input.projectRoot, input.runId);
  if (!(await pathExists(stateFile))) {
    throw new MergeAnalyzeError(`No run "${input.runId}".`);
  }
  const parsed = runStateSchema.safeParse(await readJson(stateFile));
  if (!parsed.success) {
    throw new MergeAnalyzeError(`Run "${input.runId}" state is unreadable.`);
  }
  const state = parsed.data;
  if (state.status !== "merge_ready" || !state.branchName) {
    throw new MergeAnalyzeError(
      `Run "${input.runId}" is not merge-ready (status ${state.status}).`,
    );
  }
  const branchName = state.branchName;
  if (!(await refExists(input.projectRoot, branchName))) {
    throw new MergeAnalyzeError(
      `Branch "${branchName}" no longer exists - nothing to analyze.`,
    );
  }

  const diff = await collectRedactedDiff({
    projectRoot: input.projectRoot,
    mainBranch,
    branchName,
  });
  const { overlaps, notes } = await collectOverlaps({
    projectRoot: input.projectRoot,
    mainBranch,
    runId: input.runId,
    branchName,
    thisFiles: diff.files, // reuse the file list collectRedactedDiff already read
  });
  const validateCommands = loaded.config.commands.validate;
  const ctx: MergeAnalysisContext = {
    branchName,
    filesInDiff: diff.filesInDiff,
    suppressedSecretFiles: diff.suppressedSecretFiles,
    redactedTokenCount: diff.redactedTokenCount,
    truncated: diff.truncated,
    overlaps,
    validation: {
      configured: validateCommands.length > 0,
      commandCount: validateCommands.length,
    },
  };

  let result;
  try {
    result = await runAssist<MergeAnalysis>({
      projectRoot: input.projectRoot,
      label: "merge-analyze",
      auditBucket: "merge-analyze",
      instruction: buildInstruction({
        task: state.task,
        branchName,
        mainBranch,
        ctx,
        diffText: diff.text,
      }),
      schema: mergeAnalysisSchema,
      schemaHint: MERGE_ANALYSIS_HINT,
      loaded,
      signal: input.signal,
      runner: input.runner,
    });
  } catch (err) {
    throw new MergeAnalyzeError(
      err instanceof Error ? err.message : String(err),
      err,
    );
  }

  const markdown = renderMergeAnalysisMarkdown(
    input.runId,
    state.task,
    result.parsed,
    ctx,
  );

  // Cache under the run's own artifacts dir (path-guarded by ArtifactStore).
  const store = new ArtifactStore(input.projectRoot, input.runId);
  await store.init();
  const abs = await store.write("merge-analysis.md", markdown);
  await store.writeJson("merge-analysis.json", {
    schemaVersion: 1,
    runId: input.runId,
    analysis: result.parsed,
    context: ctx,
    providerId: result.providerId,
    model: result.model,
    effort: result.effort,
  });

  return {
    runId: input.runId,
    analysis: result.parsed,
    context: ctx,
    markdown,
    cachedArtifactPath: store.relPath(abs),
    providerId: result.providerId,
    model: result.model,
    effort: result.effort,
    notes,
  };
}
