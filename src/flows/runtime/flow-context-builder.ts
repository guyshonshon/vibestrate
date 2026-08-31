import path from "node:path";
/**
 * Builds the prior-artifact blocks a Flow step's prompt carries, together with
 * the context packet that records what was actually sent. Each input token the
 * step declares gets a disposition - embedded whole, summarized, or omitted
 * because nothing has produced it yet - chosen from the flow's context policy,
 * the participant's retention mode, and the size of the artifact.
 *
 * In source order: buildFlowContextPacket walks the step's input tokens and
 * assembles both the prompt artifacts and the packet; decideContextInclusion
 * picks the disposition; renderPromptContent wraps the chosen body;
 * summarizeContent and summarizeJsonToken produce the summary bodies, with
 * diff and validation artifacts getting a structured summary rather than a
 * character clip.
 *
 * Keep intact: renderPromptContent opens each body with the artifact path, so
 * a trimmed input still points a reader at the exact content. The packet's
 * byte counts, token estimates, and sha256s are measured on the same string
 * pushed into priorArtifacts, so the record describes the prompt that was
 * built and not an approximation of it.
 */
import { createHash } from "node:crypto";
import type { FlowContextRetentionMode } from "./flow-participant-ledger.js";
import type {
  ResolvedFlowSnapshot,
  ResolvedFlowStep,
} from "../schemas/flow-schema.js";

export type FlowContextOutput = {
  token: string;
  label: string;
  content: string;
  artifactPath: string;
};

export type FlowContextDisposition =
  | "embedded-full"
  | "embedded-summary"
  | "omitted-unavailable";

export type FlowContextPacketInput = {
  token: string;
  label: string | null;
  artifactPath: string | null;
  available: boolean;
  disposition: FlowContextDisposition;
  reason: string;
  sourceBytes: number;
  sourceEstimatedTokens: number;
  promptBytes: number;
  promptEstimatedTokens: number;
  contentSha256: string | null;
  promptContentSha256: string | null;
};

export type FlowContextPacket = {
  schemaVersion: 2;
  flowId: string;
  flowVersion: number;
  stepId: string;
  contextPolicy: ResolvedFlowSnapshot["contextPolicy"];
  contextMode: FlowContextRetentionMode;
  generatedAt: string;
  budget: {
    selectedInputs: number;
    availableInputs: number;
    embeddedFullInputs: number;
    summarizedInputs: number;
    omittedInputs: number;
    sourceBytes: number;
    promptBytes: number;
    sourceEstimatedTokens: number;
    promptEstimatedTokens: number;
    estimatedTokensSaved: number;
    /** The ceiling this packet was fitted to. Nothing is summarized below it. */
    budgetTokens: number;
  };
  /**
   * Required inputs this packet could NOT deliver whole. Non-empty means the
   * step's contract is unmet and the caller must fail closed rather than send
   * a turn that is missing something it declared it cannot work without.
   */
  contractViolations: { token: string; reason: string }[];
  /**
   * Required inputs this run's shape cannot produce, so the contract did not
   * apply to them. Recorded so a reader can tell "protected and satisfied"
   * from "not protected here".
   */
  exemptedRequirements: string[];
  inputs: FlowContextPacketInput[];
};

export type FlowPromptArtifact = {
  label: string;
  content: string;
};

export type BuildFlowContextPacketInput = {
  snapshot: ResolvedFlowSnapshot;
  step: ResolvedFlowStep;
  outputs: ReadonlyMap<string, FlowContextOutput>;
  contextMode: FlowContextRetentionMode;
  generatedAt?: string;
  /**
   * Tokens that MUST be embedded in full regardless of context policy/mode. Used
   * by preference-gate review (preference-gates.ts): a model can only flag a
   * line-level violation it can actually see, so a summarized diff would make it
   * blind. Empty/absent => unchanged behavior.
   */
  forceFullTokens?: ReadonlySet<string>;
  /**
   * Absolute directory the run's artifacts live in (ArtifactStore.rootDir).
   * A summarized artifact tells the agent "exact content is available in the
   * artifact above" and prints its path - but the path is run-relative while
   * the agent's cwd is the WORKTREE, so it resolved to nothing and the agent
   * was left working from the summary it was told not to trust. Supplying the
   * root makes the reference openable. Absent => the old relative reference.
   */
  artifactRoot?: string;
  /**
   * Tokens this step's prior-artifact block may occupy before anything is
   * summarized. Absent => DEFAULT_CONTEXT_BUDGET_TOKENS. Set it lower for a
   * small-context provider; `compact` policy divides whatever it resolves to.
   */
  contextBudgetTokens?: number;
  /**
   * Tokens no step in THIS run will produce, because the runner skipped their
   * producer (disabled, read-only, or condition-skipped). A required input in
   * here is exempt and the exemption is recorded; a required input NOT in here
   * that is still missing is a real violation.
   *
   * Absent => nothing is exempt, which is the fail-closed default: a caller
   * that does not know what it skipped gets the strict contract.
   */
  unproducibleTokens?: ReadonlySet<string>;
};

export type BuildFlowContextPacketResult = {
  priorArtifacts: FlowPromptArtifact[];
  packet: FlowContextPacket;
};

const APPROX_CHARS_PER_TOKEN = 4;

/**
 * How many tokens one step's prior-artifact block may occupy before anything is
 * summarised.
 *
 * This replaces four fixed byte thresholds (1800/1400/900/700) that decided each
 * handoff in isolation, with no idea what the model's context actually was. On a
 * 200K-token model that traded information for nothing: measured over a real
 * twelve-step run, 34 of 51 inputs were summarised to save 6,812 estimated
 * tokens, and the single largest prompt in the whole run was 14KB - about 1.75%
 * of the window. Two thirds of every handoff was compressed to reclaim under one
 * percent of a context that was never close to full.
 *
 * 32K leaves ~168K on a 200K model for the system prompt, the step's own
 * instructions and the response. Lower it for a small-context provider via
 * `contextBudgetTokens`; `compact` halves it again.
 */
const DEFAULT_CONTEXT_BUDGET_TOKENS = 32_000;
/**
 * `compact` is chosen for genuinely constrained contexts, so it gets an
 * absolute ceiling rather than a fraction of the default. 2K tokens is roughly
 * 8KB of prior artifacts - small enough that the policy means what its name
 * says on an 8K or 16K model, instead of quietly behaving like `balanced`.
 */
const COMPACT_CONTEXT_BUDGET_TOKENS = 2_000;

/** Chars a downgraded input is summarised to once the budget is genuinely hit. */
const OVER_BUDGET_SUMMARY_CHARS = 4_000;

/** A reused session already holds the artifact; it gets a delta, not a replay. */
const REUSED_SUMMARY_CHARS = 900;

export function buildFlowContextPacket(
  input: BuildFlowContextPacketInput,
): BuildFlowContextPacketResult {
  // A required input this run's shape will NEVER produce is not an unmet
  // contract - it is a token whose producing step is not in the run at all.
  // Read-only runs are the case: they skip the step that outputs `execution`,
  // and that skip is decided by the runner, not the resolver, so the caller has
  // to say so. Exemptions are recorded on the packet rather than applied
  // silently, because "the contract did not apply here" is exactly the kind of
  // thing that should be visible in the artifact.
  const unproducible = input.unproducibleTokens ?? new Set<string>();
  const declaredRequired = input.step.requiredInputs ?? [];
  const exemptedRequirements = declaredRequired.filter((token) =>
    unproducible.has(token),
  );
  const required = new Set(
    declaredRequired.filter((token) => !unproducible.has(token)),
  );
  const packetInputs: FlowContextPacketInput[] = [];
  // Decided whole first, then shrunk only if the assembled packet exceeds the
  // budget. Kept alongside each entry so a downgrade can re-render it.
  const carried: {
    token: string;
    output: FlowContextOutput;
    forced: boolean;
    /** The body policy decided on, kept so a re-render cannot recompute it
     *  with the wrong budget and silently change what the step is told. */
    body: string;
    index: number;
  }[] = [];

  for (const token of input.step.inputs) {
    const output = input.outputs.get(token) ?? null;
    if (!output) {
      packetInputs.push({
        token,
        label: null,
        artifactPath: null,
        available: false,
        disposition: "omitted-unavailable",
        reason: "The Flow input token has not been produced yet.",
        sourceBytes: 0,
        sourceEstimatedTokens: 0,
        promptBytes: 0,
        promptEstimatedTokens: 0,
        contentSha256: null,
        promptContentSha256: null,
      });
      continue;
    }

    const decision = decideContextInclusion({
      token,
      content: output.content,
      artifactPath: output.artifactPath,
      contextPolicy: input.snapshot.contextPolicy,
      contextMode: input.contextMode,
      forceFull: input.forceFullTokens?.has(token) ?? false,
    });
    const promptContent = renderPromptContent({
      artifactRoot: input.artifactRoot,
      output,
      disposition: decision.disposition,
      body: decision.body,
    });

    carried.push({
      token,
      output,
      // A required input is pinned exactly like a forced one: the budget pass
      // may not downgrade it. If the pinned set alone will not fit, that is a
      // contract violation to report, not a summary to quietly ship.
      forced: decision.pinned || required.has(token),
      body: decision.body,
      index: packetInputs.length,
    });
    packetInputs.push({
      token,
      label: output.label,
      artifactPath: output.artifactPath,
      available: true,
      disposition: decision.disposition,
      reason: decision.reason,
      sourceBytes: bytes(output.content),
      sourceEstimatedTokens: estimateTokens(output.content),
      promptBytes: bytes(promptContent),
      promptEstimatedTokens: estimateTokens(promptContent),
      contentSha256: sha256(output.content),
      promptContentSha256: sha256(promptContent),
    });
  }

  fitToBudget({
    packetInputs,
    carried,
    artifactRoot: input.artifactRoot,
    budgetTokens: budgetFor(input),
  });

  // The contract, checked after the budget pass so it sees what was actually
  // assembled rather than what was intended.
  const contractViolations: { token: string; reason: string }[] = [];
  for (const token of required) {
    const item = packetInputs.find((candidate) => candidate.token === token);
    if (!item || !item.available) {
      contractViolations.push({
        token,
        reason: `Required input "${token}" has not been produced yet, so this step cannot run.`,
      });
      continue;
    }
    if (item.disposition !== "embedded-full") {
      contractViolations.push({
        token,
        reason: `Required input "${token}" could not be delivered whole (${item.disposition}). A required input is never summarized; raise the step's context budget or stop requiring it.`,
      });
    }
  }

  const priorArtifacts: FlowPromptArtifact[] = carried.map((entry) => {
    const item = packetInputs[entry.index]!;
    // `carried` only ever holds available outputs, so this cannot be
    // omitted-unavailable. Throwing rather than casting keeps that an
    // invariant the type system enforces instead of a comment.
    if (item.disposition === "omitted-unavailable") {
      throw new Error(
        `Flow context packet: ${entry.token} was carried as available but resolved to omitted-unavailable.`,
      );
    }
    return {
      label: `${entry.output.label} [${entry.token}; ${item.disposition}]`,
      content: renderedFor(entry, item.disposition, input.artifactRoot),
    };
  });

  const sourceBytes = sum(packetInputs, (item) => item.sourceBytes);
  const promptBytes = sum(packetInputs, (item) => item.promptBytes);
  const sourceEstimatedTokens = sum(
    packetInputs,
    (item) => item.sourceEstimatedTokens,
  );
  const promptEstimatedTokens = sum(
    packetInputs,
    (item) => item.promptEstimatedTokens,
  );

  return {
    priorArtifacts,
    packet: {
      schemaVersion: 2,
      flowId: input.snapshot.flowId,
      flowVersion: input.snapshot.flowVersion,
      stepId: input.step.id,
      contextPolicy: input.snapshot.contextPolicy,
      contextMode: input.contextMode,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      budget: {
        selectedInputs: packetInputs.length,
        availableInputs: packetInputs.filter((item) => item.available).length,
        embeddedFullInputs: packetInputs.filter(
          (item) => item.disposition === "embedded-full",
        ).length,
        summarizedInputs: packetInputs.filter(
          (item) => item.disposition === "embedded-summary",
        ).length,
        omittedInputs: packetInputs.filter(
          (item) => item.disposition === "omitted-unavailable",
        ).length,
        sourceBytes,
        promptBytes,
        sourceEstimatedTokens,
        promptEstimatedTokens,
        estimatedTokensSaved: Math.max(
          0,
          sourceEstimatedTokens - promptEstimatedTokens,
        ),
        budgetTokens: budgetFor(input),
      },
      contractViolations,
      exemptedRequirements,
      inputs: packetInputs,
    },
  };
}

/** The token ceiling for this step's prior-artifact block. */
function budgetFor(input: BuildFlowContextPacketInput): number {
  if (input.contextBudgetTokens !== undefined) return input.contextBudgetTokens;
  return input.snapshot.contextPolicy === "compact"
    ? COMPACT_CONTEXT_BUDGET_TOKENS
    : DEFAULT_CONTEXT_BUDGET_TOKENS;
}

/**
 * Render an entry. `downgrade` is the budget pass asking what a summary WOULD
 * cost; everything else re-renders the body policy already decided, so a reused
 * session's 900-char delta is not silently re-cut at the over-budget width.
 */
function renderedFor(
  entry: { token: string; output: FlowContextOutput; body: string },
  disposition: Exclude<FlowContextDisposition, "omitted-unavailable">,
  artifactRoot: string | undefined,
  downgrade = false,
): string {
  const body = downgrade
    ? summarizeContent(entry.token, entry.output.content, OVER_BUDGET_SUMMARY_CHARS)
    : entry.body;
  return renderPromptContent({
    artifactRoot,
    output: entry.output,
    disposition,
    body,
  });
}

/**
 * Shrink the packet ONLY if it genuinely exceeds the step's token budget, and
 * only as far as it has to. Largest source first, so one oversized artifact is
 * cut before three small ones. Forced inputs are never downgraded: a
 * preference-gate reviewer that cannot see the line under review is worse than
 * an over-budget prompt, and the caller asked for exactness explicitly.
 *
 * A downgrade that does not actually shrink the rendered block is reverted: the
 * summary wrapper (artifact-path header plus the "exact content available"
 * footer) can out-cost its own saving on a small artifact, which would lose the
 * tail of the content for nothing.
 */
function fitToBudget(args: {
  packetInputs: FlowContextPacketInput[];
  carried: {
    token: string;
    output: FlowContextOutput;
    forced: boolean;
    body: string;
    index: number;
  }[];
  artifactRoot: string | undefined;
  budgetTokens: number;
}): void {
  const total = () =>
    args.packetInputs.reduce((n, item) => n + item.promptEstimatedTokens, 0);
  if (total() <= args.budgetTokens) return;

  const order = [...args.carried]
    .filter((entry) => !entry.forced)
    .sort(
      (a, b) =>
        args.packetInputs[b.index]!.promptEstimatedTokens -
        args.packetInputs[a.index]!.promptEstimatedTokens,
    );

  for (const entry of order) {
    if (total() <= args.budgetTokens) return;
    const item = args.packetInputs[entry.index]!;
    const rendered = renderedFor(entry, "embedded-summary", args.artifactRoot, true);
    const summaryBytes = bytes(rendered);
    if (summaryBytes >= item.promptBytes) continue; // wrapper out-costs the saving
    args.packetInputs[entry.index] = {
      ...item,
      disposition: "embedded-summary",
      reason: `Packet exceeded the step's ${args.budgetTokens}-token context budget, so the largest artifacts were summarized first. The exact artifact reference is retained.`,
      promptBytes: summaryBytes,
      promptEstimatedTokens: estimateTokens(rendered),
      promptContentSha256: sha256(rendered),
    };
    entry.body = summarizeContent(
      entry.token,
      entry.output.content,
      OVER_BUDGET_SUMMARY_CHARS,
    );
  }
}

/**
 * What this input WANTS to be, from policy alone. Size is deliberately not
 * consulted here: whether the packet actually fits is a property of the whole
 * packet, not of one input, and it is decided once in fitToBudget below.
 */
function decideContextInclusion(input: {
  token: string;
  content: string;
  artifactPath: string;
  contextPolicy: ResolvedFlowSnapshot["contextPolicy"];
  contextMode: FlowContextRetentionMode;
  forceFull: boolean;
}): {
  disposition: Exclude<FlowContextDisposition, "omitted-unavailable">;
  /** Policy decided this one; the budget pass must not touch it. */
  pinned: boolean;
  body: string;
  reason: string;
} {
  // A caller that needs the exact artifact (preference-gate review) overrides
  // everything - a summarized diff would hide the very line under review.
  if (input.forceFull) {
    return {
      disposition: "embedded-full",
      pinned: true,
      body: input.content.trim(),
      reason: "Preference-gate review requires the exact artifact (forced full).",
    };
  }

  // A reused participant session already carries the artifact in its own
  // transcript. Sending it again whole duplicates it rather than informing the
  // model, so reuse gets a delta summary plus the artifact reference. This is
  // not the fixed-size compression the budget model replaced - it is about not
  // repeating yourself to a session that was there.
  if (input.contextMode === "reused" && input.token !== "task-brief") {
    return {
      disposition: "embedded-summary",
      pinned: true,
      body: summarizeContent(input.token, input.content, REUSED_SUMMARY_CHARS),
      reason:
        "Participant session was reused, so Vibestrate sent a delta summary plus artifact reference instead of replaying the full artifact.",
    };
  }

  if (input.contextPolicy === "artifact-heavy") {
    return {
      disposition: "embedded-full",
      pinned: true,
      body: input.content.trim(),
      reason: "artifact-heavy policy embeds the full selected artifact.",
    };
  }

  // Everything else starts whole. It stays whole unless the assembled packet
  // exceeds the step's token budget.
  return {
    disposition: "embedded-full",
    pinned: false,
    body: input.content.trim(),
    reason: "Embedded whole: the packet fits the step's context budget.",
  };
}

function renderPromptContent(input: {
  output: FlowContextOutput;
  disposition: Exclude<FlowContextDisposition, "omitted-unavailable">;
  body: string;
  artifactRoot?: string;
}): string {
  // Absolute when we know the root: the agent runs in the worktree, so a
  // run-relative path does not resolve and the "exact content is available"
  // promise is false.
  const reference = `Artifact path: ${
    input.artifactRoot
      ? path.join(input.artifactRoot, input.output.artifactPath)
      : input.output.artifactPath
  }`;
  if (input.disposition === "embedded-full") {
    return `${reference}\n\n${input.body.trim()}\n`;
  }
  return [
    reference,
    "",
    input.body.trim(),
    "",
    "Exact content is available in the artifact above; do not assume omitted details.",
    "",
  ].join("\n");
}

function summarizeContent(
  token: string,
  content: string,
  maxChars: number,
): string {
  const jsonSummary = summarizeJsonToken(token, content);
  if (jsonSummary) return jsonSummary;

  const normalized = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  const clipped =
    normalized.length > maxChars
      ? `${normalized.slice(0, maxChars).trimEnd()}\n...`
      : normalized;
  return [
    `Summary for ${token}:`,
    clipped || "_No textual content._",
    "",
    `Source size: ${bytes(content)} bytes, approx ${estimateTokens(content)} tokens.`,
  ].join("\n");
}

function summarizeJsonToken(token: string, content: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (token === "diff" && isRecord(parsed)) {
    const totals = isRecord(parsed.totals) ? parsed.totals : {};
    const files = Array.isArray(parsed.files)
      ? parsed.files
          .map((file) =>
            isRecord(file) && typeof file.path === "string" ? file.path : null,
          )
          .filter((file): file is string => !!file)
      : [];
    return [
      "Diff summary:",
      `Files changed: ${String(totals.files ?? files.length)}`,
      `Insertions: ${String(totals.insertions ?? "unknown")}`,
      `Deletions: ${String(totals.deletions ?? "unknown")}`,
      files.length > 0 ? `Files: ${files.slice(0, 25).join(", ")}` : "Files: unknown",
      files.length > 25 ? `Additional files omitted: ${files.length - 25}` : "",
      `Source size: ${bytes(content)} bytes, approx ${estimateTokens(content)} tokens.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (token === "validation" && isRecord(parsed)) {
    const summary = isRecord(parsed.summary) ? parsed.summary : {};
    const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
    const failed = commands.filter(
      (command) => isRecord(command) && command.status === "failed",
    );
    // Environment results are spelled out as NOT-validation - the first real
    // run's reviewer was told "failed 0/3" when the worktree simply had no
    // toolchain, and it blocked a correct change over it.
    const environment = commands.filter(
      (command) => isRecord(command) && command.status === "environment",
    );
    return [
      "Validation summary:",
      `Total: ${String(summary.total ?? commands.length)}`,
      `Passed: ${String(summary.passed ?? "unknown")}`,
      `Failed: ${String(summary.failed ?? failed.length)}`,
      environment.length > 0
        ? `Could not run - toolchain missing in the worktree (an environment gap, NOT a code failure; do not treat these as failing the change): ${environment.length}`
        : "",
      ...failed.slice(0, 5).map((command) =>
        isRecord(command)
          ? `Failed command: ${String(command.command ?? "(unknown)")} -> exit ${String(command.exitCode ?? "unknown")}`
          : "",
      ),
      ...environment.slice(0, 5).map((command) =>
        isRecord(command)
          ? `Environment-unavailable command: ${String(command.command ?? "(unknown)")}`
          : "",
      ),
      failed.length > 5 ? `Additional failed commands omitted: ${failed.length - 5}` : "",
      `Source size: ${bytes(content)} bytes, approx ${estimateTokens(content)} tokens.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return null;
}

function isBulkyToken(token: string): boolean {
  return token === "diff" || token === "validation";
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / APPROX_CHARS_PER_TOKEN);
}

function bytes(content: string): number {
  return Buffer.byteLength(content, "utf8");
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
