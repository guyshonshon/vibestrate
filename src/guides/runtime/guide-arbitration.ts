import { z } from "zod";
import { pathExists } from "../../utils/fs.js";
import { readJson, writeJson } from "../../utils/json.js";
import { runGuideArbitrationPath } from "../../utils/paths.js";
import { nowIso } from "../../utils/time.js";
import type { ValidationResults } from "../../core/validation-runner.js";
import type {
  ResolvedGuideSnapshot,
  ResolvedGuideStep,
} from "../schemas/guide-schema.js";
import {
  GUIDE_DECISION_SUMMARY_CONTRACT,
  GUIDE_FINDING_RESOLUTIONS_CONTRACT,
  GUIDE_FINDING_RESPONSES_CONTRACT,
  GUIDE_FINDINGS_CONTRACT,
  guideDecisionSummaryOutputSchema,
  guideFindingResolutionSchema,
  guideFindingResponseSchema,
  guideFindingSchema,
  type GuideDecisionSummaryOutput,
  type GuideEvidenceRef,
  type GuideFinding,
  type GuideFindingResolution,
  type GuideFindingResolutionsOutput,
  type GuideFindingResponse,
  type GuideFindingResponsesOutput,
  type GuideFindingsOutput,
} from "../schemas/guide-output-contracts.js";

export const GUIDE_OUTPUT_MARKER = "AMACO_GUIDE_OUTPUT:";
export const GUIDE_OUTPUT_END_MARKER = "AMACO_GUIDE_OUTPUT_END";

export const guideArbitrationFindingRecordSchema = z
  .object({
    finding: guideFindingSchema,
    sourceStepId: z.string().min(1),
    sourceArtifactPath: z.string().min(1),
    suggestionId: z.string().nullable().default(null),
  })
  .strict();
export type GuideArbitrationFindingRecord = z.infer<
  typeof guideArbitrationFindingRecordSchema
>;

export const guideArbitrationResponseRecordSchema = z
  .object({
    response: guideFindingResponseSchema,
    sourceStepId: z.string().min(1),
    sourceArtifactPath: z.string().min(1),
  })
  .strict();
export type GuideArbitrationResponseRecord = z.infer<
  typeof guideArbitrationResponseRecordSchema
>;

export const guideArbitrationResolutionRecordSchema = z
  .object({
    resolution: guideFindingResolutionSchema,
    sourceStepId: z.string().min(1),
    sourceArtifactPath: z.string().min(1),
  })
  .strict();
export type GuideArbitrationResolutionRecord = z.infer<
  typeof guideArbitrationResolutionRecordSchema
>;

export const guideArbitrationDecisionRecordSchema = z
  .object({
    output: guideDecisionSummaryOutputSchema,
    sourceStepId: z.string().min(1),
    sourceArtifactPath: z.string().min(1),
  })
  .strict();
export type GuideArbitrationDecisionRecord = z.infer<
  typeof guideArbitrationDecisionRecordSchema
>;

export const guideArbitrationParseIssueSchema = z
  .object({
    stepId: z.string().min(1),
    outputToken: z.string().min(1),
    sourceArtifactPath: z.string().min(1),
    message: z.string().min(1),
    recordedAt: z.string(),
  })
  .strict();
export type GuideArbitrationParseIssue = z.infer<
  typeof guideArbitrationParseIssueSchema
>;

export const guideArbitrationLedgerSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().min(1),
    guideId: z.string().min(1),
    guideVersion: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string(),
    findings: z.array(guideArbitrationFindingRecordSchema).default([]),
    responses: z.array(guideArbitrationResponseRecordSchema).default([]),
    resolutions: z.array(guideArbitrationResolutionRecordSchema).default([]),
    decision: guideArbitrationDecisionRecordSchema.nullable().default(null),
    acceptedReviewPassId: z.string().nullable().default(null),
    decisionSummaryPath: z.string().nullable().default(null),
    parseIssues: z.array(guideArbitrationParseIssueSchema).default([]),
  })
  .strict();
export type GuideArbitrationLedger = z.infer<
  typeof guideArbitrationLedgerSchema
>;

export type GuideDisagreementRecord = {
  findingId: string;
  findingClaim: string;
  responseDisposition: GuideFindingResponse["disposition"] | null;
  resolutionDisposition: GuideFindingResolution["disposition"] | null;
  decisionMarkedDisagreement: boolean;
};

export function createGuideArbitrationLedger(input: {
  runId: string;
  snapshot: ResolvedGuideSnapshot;
}): GuideArbitrationLedger {
  const createdAt = nowIso();
  return guideArbitrationLedgerSchema.parse({
    schemaVersion: 1,
    runId: input.runId,
    guideId: input.snapshot.guideId,
    guideVersion: input.snapshot.guideVersion,
    createdAt,
    updatedAt: createdAt,
  });
}

export function recordGuideFindings(input: {
  ledger: GuideArbitrationLedger;
  output: GuideFindingsOutput;
  sourceArtifactPath: string;
}): GuideArbitrationLedger {
  const findings = [...input.ledger.findings];
  for (const finding of input.output.findings) {
    const idx = findings.findIndex((record) => record.finding.id === finding.id);
    const suggestionId = idx >= 0 ? findings[idx]!.suggestionId : null;
    const record: GuideArbitrationFindingRecord = {
      finding,
      sourceStepId: input.output.stepId,
      sourceArtifactPath: input.sourceArtifactPath,
      suggestionId,
    };
    if (idx >= 0) findings[idx] = record;
    else findings.push(record);
  }
  return validateLedger({ ...input.ledger, findings });
}

export function recordGuideFindingResponses(input: {
  ledger: GuideArbitrationLedger;
  output: GuideFindingResponsesOutput;
  sourceArtifactPath: string;
}): GuideArbitrationLedger {
  const responses = [...input.ledger.responses];
  for (const response of input.output.responses) {
    const idx = responses.findIndex(
      (record) => record.response.findingId === response.findingId,
    );
    const record: GuideArbitrationResponseRecord = {
      response,
      sourceStepId: input.output.stepId,
      sourceArtifactPath: input.sourceArtifactPath,
    };
    if (idx >= 0) responses[idx] = record;
    else responses.push(record);
  }
  return validateLedger({ ...input.ledger, responses });
}

export function recordGuideFindingResolutions(input: {
  ledger: GuideArbitrationLedger;
  output: GuideFindingResolutionsOutput;
  sourceArtifactPath: string;
}): GuideArbitrationLedger {
  const resolutions = [...input.ledger.resolutions];
  for (const resolution of input.output.resolutions) {
    const idx = resolutions.findIndex(
      (record) => record.resolution.findingId === resolution.findingId,
    );
    const record: GuideArbitrationResolutionRecord = {
      resolution,
      sourceStepId: input.output.stepId,
      sourceArtifactPath: input.sourceArtifactPath,
    };
    if (idx >= 0) resolutions[idx] = record;
    else resolutions.push(record);
  }
  return validateLedger({ ...input.ledger, resolutions });
}

export function recordGuideDecision(input: {
  ledger: GuideArbitrationLedger;
  output: GuideDecisionSummaryOutput;
  sourceArtifactPath: string;
}): GuideArbitrationLedger {
  return validateLedger({
    ...input.ledger,
    decision: {
      output: input.output,
      sourceStepId: input.output.stepId,
      sourceArtifactPath: input.sourceArtifactPath,
    },
  });
}

export function recordGuideArbitrationParseIssue(input: {
  ledger: GuideArbitrationLedger;
  stepId: string;
  outputToken: string;
  sourceArtifactPath: string;
  message: string;
}): GuideArbitrationLedger {
  const duplicate = input.ledger.parseIssues.some(
    (issue) =>
      issue.stepId === input.stepId &&
      issue.outputToken === input.outputToken &&
      issue.sourceArtifactPath === input.sourceArtifactPath &&
      issue.message === input.message,
  );
  if (duplicate) return input.ledger;
  return validateLedger({
    ...input.ledger,
    parseIssues: [
      ...input.ledger.parseIssues,
      {
        stepId: input.stepId,
        outputToken: input.outputToken,
        sourceArtifactPath: input.sourceArtifactPath,
        message: input.message,
        recordedAt: nowIso(),
      },
    ],
  });
}

export function setGuideFindingSuggestionId(input: {
  ledger: GuideArbitrationLedger;
  findingId: string;
  suggestionId: string;
}): GuideArbitrationLedger {
  return validateLedger({
    ...input.ledger,
    findings: input.ledger.findings.map((record) =>
      record.finding.id === input.findingId
        ? { ...record, suggestionId: input.suggestionId }
        : record,
    ),
  });
}

export function setGuideAcceptedReviewPassId(
  ledger: GuideArbitrationLedger,
  acceptedReviewPassId: string,
): GuideArbitrationLedger {
  return validateLedger({ ...ledger, acceptedReviewPassId });
}

export function setGuideDecisionSummaryPath(
  ledger: GuideArbitrationLedger,
  decisionSummaryPath: string,
): GuideArbitrationLedger {
  return validateLedger({ ...ledger, decisionSummaryPath });
}

export function guideArbitrationCanonicalFindings(
  ledger: GuideArbitrationLedger,
  stepId: string,
): GuideFindingsOutput {
  return {
    contract: GUIDE_FINDINGS_CONTRACT,
    stepId,
    findings: ledger.findings.map((record) => record.finding),
  };
}

export function guideArbitrationCanonicalResponses(
  ledger: GuideArbitrationLedger,
  stepId: string,
): GuideFindingResponsesOutput {
  return {
    contract: GUIDE_FINDING_RESPONSES_CONTRACT,
    stepId,
    responses: ledger.responses.map((record) => record.response),
  };
}

export function guideArbitrationCanonicalResolutions(
  ledger: GuideArbitrationLedger,
  stepId: string,
): GuideFindingResolutionsOutput {
  return {
    contract: GUIDE_FINDING_RESOLUTIONS_CONTRACT,
    stepId,
    resolutions: ledger.resolutions.map((record) => record.resolution),
  };
}

export function parseGuideJsonContract<S extends z.ZodTypeAny>(input: {
  text: string;
  schema: S;
  expectedStepId: string;
}): { ok: true; output: z.output<S> } | { ok: false; message: string } {
  const candidates = extractJsonCandidates(input.text);
  if (candidates.length === 0) {
    return {
      ok: false,
      message:
        "No structured Guide JSON block found. Use AMACO_GUIDE_OUTPUT markers or a JSON code fence.",
    };
  }

  const failures: string[] = [];
  for (const candidate of candidates) {
    let raw: unknown;
    try {
      raw = JSON.parse(candidate);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
      continue;
    }
    const parsed = input.schema.safeParse(raw);
    if (!parsed.success) {
      failures.push(parsed.error.issues[0]?.message ?? "schema mismatch");
      continue;
    }
    const output = parsed.data as z.output<S> & { stepId?: unknown };
    if (output.stepId !== input.expectedStepId) {
      failures.push(
        `Structured Guide output stepId "${String(output.stepId)}" does not match "${input.expectedStepId}".`,
      );
      continue;
    }
    return { ok: true, output: parsed.data };
  }

  return {
    ok: false,
    message: `Structured Guide JSON did not match its contract: ${failures[0] ?? "unknown parse failure"}`,
  };
}

export function renderGuideOutputContractNotes(step: ResolvedGuideStep): string {
  const contracts: string[] = [];
  if (step.outputs.includes("findings")) {
    contracts.push(
      `- findings: {"contract":"${GUIDE_FINDINGS_CONTRACT}","stepId":"${step.id}","findings":[{"id":"finding-id","severity":"high","category":"correctness","claim":"...","evidence":[{"kind":"diff","ref":"..."}],"recommendation":"..."}]}`,
    );
  }
  if (step.outputs.includes("finding-responses")) {
    contracts.push(
      `- finding-responses: {"contract":"${GUIDE_FINDING_RESPONSES_CONTRACT}","stepId":"${step.id}","responses":[{"findingId":"finding-id","disposition":"fix","rationale":"...","evidence":[{"kind":"validation","ref":"..."}]}]}`,
    );
  }
  if (step.outputs.includes("finding-resolutions")) {
    contracts.push(
      `- finding-resolutions: {"contract":"${GUIDE_FINDING_RESOLUTIONS_CONTRACT}","stepId":"${step.id}","resolutions":[{"findingId":"finding-id","disposition":"resolved","rationale":"...","evidence":[{"kind":"validation","ref":"..."}]}]}`,
    );
  }
  if (step.outputs.includes("decision-summary")) {
    contracts.push(
      `- decision-summary: {"contract":"${GUIDE_DECISION_SUMMARY_CONTRACT}","stepId":"${step.id}","recommendation":"merge-ready","summary":"...","validation":{"status":"passed","evidence":[]},"agreementFindingIds":[],"disagreementFindingIds":[],"residualRisks":[],"requiredHumanActions":[]}`,
    );
  }
  if (contracts.length === 0) return "";

  return [
    "Structured Guide output:",
    "Return the relevant JSON contract inside an explicit block so Amaco can parse it:",
    GUIDE_OUTPUT_MARKER,
    "{...}",
    GUIDE_OUTPUT_END_MARKER,
    "Keep DECISION or VERIFICATION lines when this role requires them.",
    ...contracts,
  ].join("\n");
}

export function summarizeGuideDisagreements(
  ledger: GuideArbitrationLedger,
): GuideDisagreementRecord[] {
  const decisionIds = new Set(
    ledger.decision?.output.disagreementFindingIds ?? [],
  );
  return ledger.findings
    .map((record) => {
      const response =
        ledger.responses.find(
          (entry) => entry.response.findingId === record.finding.id,
        )?.response ?? null;
      const resolution =
        ledger.resolutions.find(
          (entry) => entry.resolution.findingId === record.finding.id,
        )?.resolution ?? null;
      const disputedResponse =
        response?.disposition === "rebut" ||
        response?.disposition === "defer" ||
        response?.disposition === "needs-human";
      const disputedResolution =
        resolution?.disposition === "still-open" ||
        resolution?.disposition === "invalid-finding" ||
        resolution?.disposition === "needs-human";
      if (!disputedResponse && !disputedResolution && !decisionIds.has(record.finding.id)) {
        return null;
      }
      return {
        findingId: record.finding.id,
        findingClaim: record.finding.claim,
        responseDisposition: response?.disposition ?? null,
        resolutionDisposition: resolution?.disposition ?? null,
        decisionMarkedDisagreement: decisionIds.has(record.finding.id),
      };
    })
    .filter((record): record is GuideDisagreementRecord => record !== null);
}

export function guideAcceptedFindingResponses(
  ledger: GuideArbitrationLedger,
): {
  finding: GuideArbitrationFindingRecord;
  response: GuideArbitrationResponseRecord;
}[] {
  return ledger.responses
    .filter(
      (record) =>
        record.response.disposition === "accept" ||
        record.response.disposition === "fix",
    )
    .map((response) => {
      const finding = ledger.findings.find(
        (record) => record.finding.id === response.response.findingId,
      );
      return finding ? { finding, response } : null;
    })
    .filter(
      (
        record,
      ): record is {
        finding: GuideArbitrationFindingRecord;
        response: GuideArbitrationResponseRecord;
      } => record !== null,
    );
}

export function renderGuideDecisionSummaryMarkdown(input: {
  ledger: GuideArbitrationLedger;
  validation: ValidationResults | null;
  validationArtifactPath: string | null;
}): string {
  const { ledger } = input;
  const decision = ledger.decision?.output ?? null;
  const disagreements = summarizeGuideDisagreements(ledger);
  const validationStatus = decision?.validation.status ??
    (input.validation
      ? input.validation.summary.failed > 0
        ? "failed"
        : "passed"
      : "not-run");
  const findingRows =
    ledger.findings.length === 0
      ? ["| none | - | - | - | - |"]
      : ledger.findings.map((record) => {
          const response = findResponse(ledger, record.finding.id);
          const resolution = findResolution(ledger, record.finding.id);
          return `| ${cell(record.finding.id)} | ${record.finding.severity} | ${record.finding.category} | ${response?.disposition ?? "-"} | ${resolution?.disposition ?? "-"} |`;
        });
  const disagreementRows =
    disagreements.length === 0
      ? ["- None recorded."]
      : disagreements.map(
          (record) =>
            `- \`${record.findingId}\`: response ${record.responseDisposition ?? "-"}, second review ${record.resolutionDisposition ?? "-"}${record.decisionMarkedDisagreement ? ", decision summary flagged disagreement" : ""}.`,
        );

  return [
    "# Guide Decision Summary",
    "",
    `- Recommendation: ${decision?.recommendation ?? "needs-human"}`,
    `- Structured arbitration record: \`arbitration.json\``,
    `- Validation status: ${validationStatus}`,
    `- Validation record: ${input.validationArtifactPath ? `\`${input.validationArtifactPath}\`` : "_not recorded_"}`,
    `- Findings record: \`artifacts/guides/findings.json\``,
    `- Responses record: \`artifacts/guides/finding-responses.json\``,
    `- Resolutions record: \`artifacts/guides/finding-resolutions.json\``,
    "",
    "## Provider Summary",
    "",
    decision?.summary ?? "_No structured provider decision summary was parsed._",
    "",
    "## Findings",
    "",
    "| Finding | Severity | Category | Builder response | Second review |",
    "| --- | --- | --- | --- | --- |",
    ...findingRows,
    "",
    "## Disagreement Records",
    "",
    ...disagreementRows,
    "",
    "## Residual Risk",
    "",
    ...(decision?.residualRisks.length
      ? decision.residualRisks.map((risk) => `- ${risk}`)
      : ["- None recorded by a structured decision summary."]),
    "",
    "## Required Human Actions",
    "",
    ...(decision?.requiredHumanActions.length
      ? decision.requiredHumanActions.map((action) => `- ${action}`)
      : ["- None recorded by a structured decision summary."]),
    "",
  ].join("\n");
}

export function formatGuideFindingSuggestionBody(input: {
  finding: GuideFinding;
  response: GuideFindingResponse;
}): string {
  const evidence = input.finding.evidence
    .map((ref) => `- ${formatEvidenceRef(ref)}`)
    .join("\n");
  const responseEvidence = input.response.evidence
    .map((ref) => `- ${formatEvidenceRef(ref)}`)
    .join("\n");
  return [
    `Quality Arbitration finding \`${input.finding.id}\`.`,
    "",
    `Claim: ${input.finding.claim}`,
    "",
    `Recommendation: ${input.finding.recommendation}`,
    "",
    `Builder response: ${input.response.disposition}`,
    `Rationale: ${input.response.rationale}`,
    "",
    "Finding evidence:",
    evidence || "- None.",
    "",
    "Response evidence:",
    responseEvidence || "- None.",
  ].join("\n");
}

function findResponse(
  ledger: GuideArbitrationLedger,
  findingId: string,
): GuideFindingResponse | null {
  return (
    ledger.responses.find((record) => record.response.findingId === findingId)
      ?.response ?? null
  );
}

function findResolution(
  ledger: GuideArbitrationLedger,
  findingId: string,
): GuideFindingResolution | null {
  return (
    ledger.resolutions.find(
      (record) => record.resolution.findingId === findingId,
    )?.resolution ?? null
  );
}

function formatEvidenceRef(ref: GuideEvidenceRef): string {
  return `${ref.kind}: ${ref.ref}`;
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function validateLedger(value: Omit<GuideArbitrationLedger, "updatedAt"> & {
  updatedAt?: string;
}): GuideArbitrationLedger {
  return guideArbitrationLedgerSchema.parse({
    ...value,
    updatedAt: nowIso(),
  });
}

function extractJsonCandidates(text: string): string[] {
  const out: string[] = [];
  const marker = new RegExp(
    `${escapeRegExp(GUIDE_OUTPUT_MARKER)}\\s*([\\s\\S]*?)\\s*(?:${escapeRegExp(GUIDE_OUTPUT_END_MARKER)}|$)`,
    "g",
  );
  for (const match of text.matchAll(marker)) {
    const candidate = match[1]?.trim();
    if (candidate) out.push(candidate);
  }

  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/g;
  for (const match of text.matchAll(fenced)) {
    const candidate = match[1]?.trim();
    if (candidate?.startsWith("{")) out.push(candidate);
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    out.push(trimmed);
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class GuideArbitrationStore {
  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
  ) {}

  get filePath(): string {
    return runGuideArbitrationPath(this.projectRoot, this.runId);
  }

  async read(): Promise<GuideArbitrationLedger | null> {
    if (!(await pathExists(this.filePath))) return null;
    return guideArbitrationLedgerSchema.parse(
      await readJson<unknown>(this.filePath),
    );
  }

  async write(ledger: GuideArbitrationLedger): Promise<void> {
    await writeJson(this.filePath, guideArbitrationLedgerSchema.parse(ledger));
  }
}
