import { createHash } from "node:crypto";
import type { GuideContextRetentionMode } from "./guide-participant-ledger.js";
import type {
  ResolvedGuideSnapshot,
  ResolvedGuideStep,
} from "../schemas/guide-schema.js";

export type GuideContextOutput = {
  token: string;
  label: string;
  content: string;
  artifactPath: string;
};

export type GuideContextDisposition =
  | "embedded-full"
  | "embedded-summary"
  | "reference-only"
  | "omitted-unavailable";

export type GuideContextPacketInput = {
  token: string;
  label: string | null;
  artifactPath: string | null;
  available: boolean;
  disposition: GuideContextDisposition;
  reason: string;
  sourceBytes: number;
  sourceEstimatedTokens: number;
  promptBytes: number;
  promptEstimatedTokens: number;
  contentSha256: string | null;
  promptContentSha256: string | null;
};

export type GuideContextPacket = {
  schemaVersion: 2;
  guideId: string;
  guideVersion: number;
  stepId: string;
  contextPolicy: ResolvedGuideSnapshot["contextPolicy"];
  contextMode: GuideContextRetentionMode;
  generatedAt: string;
  budget: {
    selectedInputs: number;
    availableInputs: number;
    embeddedFullInputs: number;
    summarizedInputs: number;
    referenceOnlyInputs: number;
    omittedInputs: number;
    sourceBytes: number;
    promptBytes: number;
    sourceEstimatedTokens: number;
    promptEstimatedTokens: number;
    estimatedTokensSaved: number;
  };
  inputs: GuideContextPacketInput[];
};

export type GuidePromptArtifact = {
  label: string;
  content: string;
};

export type BuildGuideContextPacketInput = {
  snapshot: ResolvedGuideSnapshot;
  step: ResolvedGuideStep;
  outputs: ReadonlyMap<string, GuideContextOutput>;
  contextMode: GuideContextRetentionMode;
  generatedAt?: string;
};

export type BuildGuideContextPacketResult = {
  priorArtifacts: GuidePromptArtifact[];
  packet: GuideContextPacket;
};

const TASK_BRIEF_FULL_BYTES = 1_500;
const COMPACT_SUMMARY_CHARS = 700;
const BALANCED_FULL_BYTES = 1_800;
const BALANCED_SUMMARY_CHARS = 1_400;
const REUSED_SUMMARY_CHARS = 900;
const APPROX_CHARS_PER_TOKEN = 4;

export function buildGuideContextPacket(
  input: BuildGuideContextPacketInput,
): BuildGuideContextPacketResult {
  const priorArtifacts: GuidePromptArtifact[] = [];
  const packetInputs: GuideContextPacketInput[] = [];

  for (const token of input.step.inputs) {
    const output = input.outputs.get(token) ?? null;
    if (!output) {
      packetInputs.push({
        token,
        label: null,
        artifactPath: null,
        available: false,
        disposition: "omitted-unavailable",
        reason: "The Guide input token has not been produced yet.",
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
    });
    const promptContent = renderPromptContent({
      output,
      disposition: decision.disposition,
      body: decision.body,
    });
    const sourceBytes = bytes(output.content);
    const promptBytes = bytes(promptContent);

    packetInputs.push({
      token,
      label: output.label,
      artifactPath: output.artifactPath,
      available: true,
      disposition: decision.disposition,
      reason: decision.reason,
      sourceBytes,
      sourceEstimatedTokens: estimateTokens(output.content),
      promptBytes,
      promptEstimatedTokens: estimateTokens(promptContent),
      contentSha256: sha256(output.content),
      promptContentSha256: sha256(promptContent),
    });
    priorArtifacts.push({
      label: `${output.label} [${token}; ${decision.disposition}]`,
      content: promptContent,
    });
  }

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
      guideId: input.snapshot.guideId,
      guideVersion: input.snapshot.guideVersion,
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
        referenceOnlyInputs: packetInputs.filter(
          (item) => item.disposition === "reference-only",
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
      },
      inputs: packetInputs,
    },
  };
}

function decideContextInclusion(input: {
  token: string;
  content: string;
  artifactPath: string;
  contextPolicy: ResolvedGuideSnapshot["contextPolicy"];
  contextMode: GuideContextRetentionMode;
}): {
  disposition: Exclude<GuideContextDisposition, "omitted-unavailable">;
  body: string;
  reason: string;
} {
  const sourceBytes = bytes(input.content);

  if (input.contextMode === "reused" && input.token !== "task-brief") {
    return {
      disposition: "embedded-summary",
      body: summarizeContent(input.token, input.content, REUSED_SUMMARY_CHARS),
      reason:
        "Participant session was reused, so Amaco sent a delta summary plus artifact reference instead of replaying the full artifact.",
    };
  }

  if (
    input.token === "task-brief" &&
    sourceBytes <= TASK_BRIEF_FULL_BYTES
  ) {
    return {
      disposition: "embedded-full",
      body: input.content.trim(),
      reason: "Task brief is small and needed by every step.",
    };
  }

  if (input.contextPolicy === "artifact-heavy") {
    return {
      disposition: "embedded-full",
      body: input.content.trim(),
      reason: "artifact-heavy policy embeds the full selected artifact.",
    };
  }

  if (input.contextPolicy === "compact") {
    return {
      disposition: "embedded-summary",
      body: summarizeContent(input.token, input.content, COMPACT_SUMMARY_CHARS),
      reason:
        "compact policy sends a summary and artifact reference to reduce prompt size.",
    };
  }

  if (sourceBytes <= BALANCED_FULL_BYTES && !isBulkyToken(input.token)) {
    return {
      disposition: "embedded-full",
      body: input.content.trim(),
      reason: "balanced policy embeds small non-bulky artifacts exactly.",
    };
  }

  return {
    disposition: "embedded-summary",
    body: summarizeContent(input.token, input.content, BALANCED_SUMMARY_CHARS),
    reason:
      "balanced policy summarized a bulky or large artifact and retained the exact artifact reference.",
  };
}

function renderPromptContent(input: {
  output: GuideContextOutput;
  disposition: Exclude<GuideContextDisposition, "omitted-unavailable">;
  body: string;
}): string {
  const reference = `Artifact path: ${input.output.artifactPath}`;
  if (input.disposition === "embedded-full") {
    return `${reference}\n\n${input.body.trim()}\n`;
  }
  if (input.disposition === "reference-only") {
    return [
      reference,
      "",
      "Exact content was retained in the live participant session. Inspect the artifact only if exact details are needed.",
      "",
    ].join("\n");
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
    return [
      "Validation summary:",
      `Total: ${String(summary.total ?? commands.length)}`,
      `Passed: ${String(summary.passed ?? "unknown")}`,
      `Failed: ${String(summary.failed ?? failed.length)}`,
      ...failed.slice(0, 5).map((command) =>
        isRecord(command)
          ? `Failed command: ${String(command.command ?? "(unknown)")} -> exit ${String(command.exitCode ?? "unknown")}`
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
