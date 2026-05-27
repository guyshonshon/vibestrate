import { z } from "zod";
import { pathExists } from "../../utils/fs.js";
import { readJson, writeJson } from "../../utils/json.js";
import { runFlowArbitrationPath } from "../../utils/paths.js";
import { nowIso } from "../../utils/time.js";
import type { ValidationResults } from "../../core/validation-runner.js";
import type {
  ResolvedFlowSnapshot,
  ResolvedFlowStep,
} from "../schemas/flow-schema.js";
import {
  FLOW_DECISION_SUMMARY_CONTRACT,
  FLOW_FINDING_RESOLUTIONS_CONTRACT,
  FLOW_FINDING_RESPONSES_CONTRACT,
  FLOW_FINDINGS_CONTRACT,
  flowDecisionSummaryOutputSchema,
  flowFindingResolutionSchema,
  flowFindingResponseSchema,
  flowFindingSchema,
  type FlowDecisionSummaryOutput,
  type FlowEvidenceRef,
  type FlowFinding,
  type FlowFindingResolution,
  type FlowFindingResolutionsOutput,
  type FlowFindingResponse,
  type FlowFindingResponsesOutput,
  type FlowFindingsOutput,
} from "../schemas/flow-output-contracts.js";

export const FLOW_OUTPUT_MARKER = "AMACO_FLOW_OUTPUT:";
export const FLOW_OUTPUT_END_MARKER = "AMACO_FLOW_OUTPUT_END";

export const flowArbitrationFindingRecordSchema = z
  .object({
    finding: flowFindingSchema,
    sourceStepId: z.string().min(1),
    sourceArtifactPath: z.string().min(1),
    suggestionId: z.string().nullable().default(null),
  })
  .strict();
export type FlowArbitrationFindingRecord = z.infer<
  typeof flowArbitrationFindingRecordSchema
>;

export const flowArbitrationResponseRecordSchema = z
  .object({
    response: flowFindingResponseSchema,
    sourceStepId: z.string().min(1),
    sourceArtifactPath: z.string().min(1),
  })
  .strict();
export type FlowArbitrationResponseRecord = z.infer<
  typeof flowArbitrationResponseRecordSchema
>;

export const flowArbitrationResolutionRecordSchema = z
  .object({
    resolution: flowFindingResolutionSchema,
    sourceStepId: z.string().min(1),
    sourceArtifactPath: z.string().min(1),
  })
  .strict();
export type FlowArbitrationResolutionRecord = z.infer<
  typeof flowArbitrationResolutionRecordSchema
>;

export const flowArbitrationDecisionRecordSchema = z
  .object({
    output: flowDecisionSummaryOutputSchema,
    sourceStepId: z.string().min(1),
    sourceArtifactPath: z.string().min(1),
  })
  .strict();
export type FlowArbitrationDecisionRecord = z.infer<
  typeof flowArbitrationDecisionRecordSchema
>;

export const flowArbitrationParseIssueSchema = z
  .object({
    stepId: z.string().min(1),
    outputToken: z.string().min(1),
    sourceArtifactPath: z.string().min(1),
    message: z.string().min(1),
    recordedAt: z.string(),
  })
  .strict();
export type FlowArbitrationParseIssue = z.infer<
  typeof flowArbitrationParseIssueSchema
>;

export const flowArbitrationLedgerSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().min(1),
    flowId: z.string().min(1),
    flowVersion: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string(),
    findings: z.array(flowArbitrationFindingRecordSchema).default([]),
    responses: z.array(flowArbitrationResponseRecordSchema).default([]),
    resolutions: z.array(flowArbitrationResolutionRecordSchema).default([]),
    decision: flowArbitrationDecisionRecordSchema.nullable().default(null),
    acceptedReviewPassId: z.string().nullable().default(null),
    decisionSummaryPath: z.string().nullable().default(null),
    parseIssues: z.array(flowArbitrationParseIssueSchema).default([]),
  })
  .strict();
export type FlowArbitrationLedger = z.infer<
  typeof flowArbitrationLedgerSchema
>;

export type FlowDisagreementRecord = {
  findingId: string;
  findingClaim: string;
  responseDisposition: FlowFindingResponse["disposition"] | null;
  resolutionDisposition: FlowFindingResolution["disposition"] | null;
  decisionMarkedDisagreement: boolean;
};

export function createFlowArbitrationLedger(input: {
  runId: string;
  snapshot: ResolvedFlowSnapshot;
}): FlowArbitrationLedger {
  const createdAt = nowIso();
  return flowArbitrationLedgerSchema.parse({
    schemaVersion: 1,
    runId: input.runId,
    flowId: input.snapshot.flowId,
    flowVersion: input.snapshot.flowVersion,
    createdAt,
    updatedAt: createdAt,
  });
}

export function recordFlowFindings(input: {
  ledger: FlowArbitrationLedger;
  output: FlowFindingsOutput;
  sourceArtifactPath: string;
}): FlowArbitrationLedger {
  const findings = [...input.ledger.findings];
  for (const finding of input.output.findings) {
    const idx = findings.findIndex((record) => record.finding.id === finding.id);
    const suggestionId = idx >= 0 ? findings[idx]!.suggestionId : null;
    const record: FlowArbitrationFindingRecord = {
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

export function recordFlowFindingResponses(input: {
  ledger: FlowArbitrationLedger;
  output: FlowFindingResponsesOutput;
  sourceArtifactPath: string;
}): FlowArbitrationLedger {
  const responses = [...input.ledger.responses];
  for (const response of input.output.responses) {
    const idx = responses.findIndex(
      (record) => record.response.findingId === response.findingId,
    );
    const record: FlowArbitrationResponseRecord = {
      response,
      sourceStepId: input.output.stepId,
      sourceArtifactPath: input.sourceArtifactPath,
    };
    if (idx >= 0) responses[idx] = record;
    else responses.push(record);
  }
  return validateLedger({ ...input.ledger, responses });
}

export function recordFlowFindingResolutions(input: {
  ledger: FlowArbitrationLedger;
  output: FlowFindingResolutionsOutput;
  sourceArtifactPath: string;
}): FlowArbitrationLedger {
  const resolutions = [...input.ledger.resolutions];
  for (const resolution of input.output.resolutions) {
    const idx = resolutions.findIndex(
      (record) => record.resolution.findingId === resolution.findingId,
    );
    const record: FlowArbitrationResolutionRecord = {
      resolution,
      sourceStepId: input.output.stepId,
      sourceArtifactPath: input.sourceArtifactPath,
    };
    if (idx >= 0) resolutions[idx] = record;
    else resolutions.push(record);
  }
  return validateLedger({ ...input.ledger, resolutions });
}

export function recordFlowDecision(input: {
  ledger: FlowArbitrationLedger;
  output: FlowDecisionSummaryOutput;
  sourceArtifactPath: string;
}): FlowArbitrationLedger {
  return validateLedger({
    ...input.ledger,
    decision: {
      output: input.output,
      sourceStepId: input.output.stepId,
      sourceArtifactPath: input.sourceArtifactPath,
    },
  });
}

export function recordFlowArbitrationParseIssue(input: {
  ledger: FlowArbitrationLedger;
  stepId: string;
  outputToken: string;
  sourceArtifactPath: string;
  message: string;
}): FlowArbitrationLedger {
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

export function setFlowFindingSuggestionId(input: {
  ledger: FlowArbitrationLedger;
  findingId: string;
  suggestionId: string;
}): FlowArbitrationLedger {
  return validateLedger({
    ...input.ledger,
    findings: input.ledger.findings.map((record) =>
      record.finding.id === input.findingId
        ? { ...record, suggestionId: input.suggestionId }
        : record,
    ),
  });
}

export function setFlowAcceptedReviewPassId(
  ledger: FlowArbitrationLedger,
  acceptedReviewPassId: string,
): FlowArbitrationLedger {
  return validateLedger({ ...ledger, acceptedReviewPassId });
}

export function setFlowDecisionSummaryPath(
  ledger: FlowArbitrationLedger,
  decisionSummaryPath: string,
): FlowArbitrationLedger {
  return validateLedger({ ...ledger, decisionSummaryPath });
}

export function flowArbitrationCanonicalFindings(
  ledger: FlowArbitrationLedger,
  stepId: string,
): FlowFindingsOutput {
  return {
    contract: FLOW_FINDINGS_CONTRACT,
    stepId,
    findings: ledger.findings.map((record) => record.finding),
  };
}

export function flowArbitrationCanonicalResponses(
  ledger: FlowArbitrationLedger,
  stepId: string,
): FlowFindingResponsesOutput {
  return {
    contract: FLOW_FINDING_RESPONSES_CONTRACT,
    stepId,
    responses: ledger.responses.map((record) => record.response),
  };
}

export function flowArbitrationCanonicalResolutions(
  ledger: FlowArbitrationLedger,
  stepId: string,
): FlowFindingResolutionsOutput {
  return {
    contract: FLOW_FINDING_RESOLUTIONS_CONTRACT,
    stepId,
    resolutions: ledger.resolutions.map((record) => record.resolution),
  };
}

export function parseFlowJsonContract<S extends z.ZodTypeAny>(input: {
  text: string;
  schema: S;
  expectedStepId: string;
}): { ok: true; output: z.output<S> } | { ok: false; message: string } {
  const candidates = extractJsonCandidates(input.text);
  if (candidates.length === 0) {
    return {
      ok: false,
      message:
        "No structured Flow JSON block found. Use AMACO_FLOW_OUTPUT markers or a JSON code fence.",
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
        `Structured Flow output stepId "${String(output.stepId)}" does not match "${input.expectedStepId}".`,
      );
      continue;
    }
    return { ok: true, output: parsed.data };
  }

  return {
    ok: false,
    message: `Structured Flow JSON did not match its contract: ${failures[0] ?? "unknown parse failure"}`,
  };
}

export function renderFlowOutputContractNotes(step: ResolvedFlowStep): string {
  const contracts: string[] = [];
  if (step.outputs.includes("findings")) {
    contracts.push(
      `- findings: {"contract":"${FLOW_FINDINGS_CONTRACT}","stepId":"${step.id}","findings":[{"id":"finding-id","severity":"high","category":"correctness","claim":"...","evidence":[{"kind":"diff","ref":"..."}],"recommendation":"..."}]}`,
    );
  }
  if (step.outputs.includes("finding-responses")) {
    contracts.push(
      `- finding-responses: {"contract":"${FLOW_FINDING_RESPONSES_CONTRACT}","stepId":"${step.id}","responses":[{"findingId":"finding-id","disposition":"fix","rationale":"...","evidence":[{"kind":"validation","ref":"..."}]}]}`,
    );
  }
  if (step.outputs.includes("finding-resolutions")) {
    contracts.push(
      `- finding-resolutions: {"contract":"${FLOW_FINDING_RESOLUTIONS_CONTRACT}","stepId":"${step.id}","resolutions":[{"findingId":"finding-id","disposition":"resolved","rationale":"...","evidence":[{"kind":"validation","ref":"..."}]}]}`,
    );
  }
  if (step.outputs.includes("decision-summary")) {
    contracts.push(
      `- decision-summary: {"contract":"${FLOW_DECISION_SUMMARY_CONTRACT}","stepId":"${step.id}","recommendation":"merge-ready","summary":"...","validation":{"status":"passed","evidence":[]},"agreementFindingIds":[],"disagreementFindingIds":[],"residualRisks":[],"requiredHumanActions":[]}`,
    );
  }
  if (contracts.length === 0) return "";

  return [
    "Structured Flow output:",
    "Return the relevant JSON contract inside an explicit block so Amaco can parse it:",
    FLOW_OUTPUT_MARKER,
    "{...}",
    FLOW_OUTPUT_END_MARKER,
    "Keep DECISION or VERIFICATION lines when this role requires them.",
    ...contracts,
  ].join("\n");
}

export function summarizeFlowDisagreements(
  ledger: FlowArbitrationLedger,
): FlowDisagreementRecord[] {
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
    .filter((record): record is FlowDisagreementRecord => record !== null);
}

export function flowAcceptedFindingResponses(
  ledger: FlowArbitrationLedger,
): {
  finding: FlowArbitrationFindingRecord;
  response: FlowArbitrationResponseRecord;
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
        finding: FlowArbitrationFindingRecord;
        response: FlowArbitrationResponseRecord;
      } => record !== null,
    );
}

export function renderFlowDecisionSummaryMarkdown(input: {
  ledger: FlowArbitrationLedger;
  validation: ValidationResults | null;
  validationArtifactPath: string | null;
}): string {
  const { ledger } = input;
  const decision = ledger.decision?.output ?? null;
  const disagreements = summarizeFlowDisagreements(ledger);
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
    "# Flow Decision Summary",
    "",
    `- Recommendation: ${decision?.recommendation ?? "needs-human"}`,
    `- Structured arbitration record: \`arbitration.json\``,
    `- Validation status: ${validationStatus}`,
    `- Validation record: ${input.validationArtifactPath ? `\`${input.validationArtifactPath}\`` : "_not recorded_"}`,
    `- Findings record: \`artifacts/flows/findings.json\``,
    `- Responses record: \`artifacts/flows/finding-responses.json\``,
    `- Resolutions record: \`artifacts/flows/finding-resolutions.json\``,
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

export function formatFlowFindingSuggestionBody(input: {
  finding: FlowFinding;
  response: FlowFindingResponse;
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
  ledger: FlowArbitrationLedger,
  findingId: string,
): FlowFindingResponse | null {
  return (
    ledger.responses.find((record) => record.response.findingId === findingId)
      ?.response ?? null
  );
}

function findResolution(
  ledger: FlowArbitrationLedger,
  findingId: string,
): FlowFindingResolution | null {
  return (
    ledger.resolutions.find(
      (record) => record.resolution.findingId === findingId,
    )?.resolution ?? null
  );
}

function formatEvidenceRef(ref: FlowEvidenceRef): string {
  return `${ref.kind}: ${ref.ref}`;
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function validateLedger(value: Omit<FlowArbitrationLedger, "updatedAt"> & {
  updatedAt?: string;
}): FlowArbitrationLedger {
  return flowArbitrationLedgerSchema.parse({
    ...value,
    updatedAt: nowIso(),
  });
}

function extractJsonCandidates(text: string): string[] {
  const out: string[] = [];
  const marker = new RegExp(
    `${escapeRegExp(FLOW_OUTPUT_MARKER)}\\s*([\\s\\S]*?)\\s*(?:${escapeRegExp(FLOW_OUTPUT_END_MARKER)}|$)`,
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

export class FlowArbitrationStore {
  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
  ) {}

  get filePath(): string {
    return runFlowArbitrationPath(this.projectRoot, this.runId);
  }

  async read(): Promise<FlowArbitrationLedger | null> {
    if (!(await pathExists(this.filePath))) return null;
    return flowArbitrationLedgerSchema.parse(
      await readJson<unknown>(this.filePath),
    );
  }

  async write(ledger: FlowArbitrationLedger): Promise<void> {
    await writeJson(this.filePath, flowArbitrationLedgerSchema.parse(ledger));
  }
}
