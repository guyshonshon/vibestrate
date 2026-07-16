import path from "node:path";
import type { ArtifactStore } from "../artifact-store.js";
import type { EventLog } from "../event-log.js";
import type { ValidationResults } from "../validation-runner.js";
import type { PriorArtifact } from "../prompt-builder.js";
import type { ProviderFailureClass } from "../provider-resilience.js";
import { getDiffSnapshot } from "../diff-service.js";
import { nowIso } from "../../utils/time.js";
import {
  buildFlowContextPacket as buildFlowContextPacketValue,
  type FlowContextOutput,
} from "../../flows/runtime/flow-context-builder.js";
import type { PreparedFlowParticipantTurn } from "../../flows/runtime/flow-participant-ledger.js";
import type {
  ResolvedFlowSnapshot,
  ResolvedFlowStep,
} from "../../flows/schemas/flow-schema.js";
import {
  flowAcceptedFindingResponses,
  flowArbitrationCanonicalFindings,
  flowArbitrationCanonicalResolutions,
  flowArbitrationCanonicalResponses,
  formatFlowFindingSuggestionBody,
  parseFlowJsonContract,
  recordFlowArbitrationParseIssue,
  recordFlowDecision,
  recordFlowFindingResolutions,
  recordFlowFindingResponses,
  recordFlowFindings,
  renderFlowDecisionSummaryMarkdown,
  renderFlowOutputContractNotes,
  setFlowAcceptedReviewPassId,
  setFlowDecisionSummaryPath,
  setFlowFindingSuggestionId,
  type FlowArbitrationLedger,
  type FlowArbitrationStore,
} from "../../flows/runtime/flow-arbitration.js";
import {
  flowDecisionSummaryOutputSchema,
  flowFindingResolutionsOutputSchema,
  flowFindingResponsesOutputSchema,
  flowFindingsOutputSchema,
  flowHandoffContracts,
  isFlowHandoffToken,
} from "../../flows/schemas/flow-output-contracts.js";
import { ReviewSuggestionService } from "../../reviews/review-suggestion-service.js";
import { SuggestionBundleService } from "../../reviews/suggestion-bundle-service.js";
import { flowFindingSuggestionTitle } from "./helpers.js";
import type { RoleRunResult } from "./types.js";

/** Append a human's change-request guidance (already redacted) to a step's
 *  notes, so a re-run of that step acts on it. Used by both the graph and the
 *  linear execution paths. */
export function composeGuidedNotes(
  baseNotes: string,
  guidance: string | undefined,
): string {
  if (!guidance) return baseNotes;
  const head = baseNotes ? `${baseNotes}\n\n` : "";
  return `${head}Human guidance on your previous attempt (address it directly):\n${guidance}`;
}

export function renderFlowStepNotes(input: {
  snapshot: ResolvedFlowSnapshot;
  step: ResolvedFlowStep;
}): string {
  const brief = input.snapshot.brief
    ? `Run brief:\n${input.snapshot.brief.trim()}\n\n`
    : "";
  const outputs =
    input.step.outputs.length > 0
      ? input.step.outputs.map((token) => `- ${token}`).join("\n")
      : "- No named outputs declared.";
  const contractNotes = renderFlowOutputContractNotes(input.step);
  return [
    `Flow: ${input.snapshot.label} (${input.snapshot.flowId} v${input.snapshot.flowVersion})`,
    `Flow step: ${input.step.label} (${input.step.id})`,
    `Flow step kind: ${input.step.kind}`,
    `Context policy: ${input.snapshot.contextPolicy}`,
    "",
    brief.trimEnd(),
    "",
    "Only this step should be completed now. Use the named prior artifacts as the handoff packet.",
    "Expected named outputs:",
    outputs,
    "",
    contractNotes,
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n");
}

export async function buildFlowContextPacket(input: {
  snapshot: ResolvedFlowSnapshot;
  step: ResolvedFlowStep;
  outputs: Map<string, FlowContextOutput>;
  artifactStore: ArtifactStore;
  contextMode: PreparedFlowParticipantTurn["contextMode"];
  forceFullTokens?: ReadonlySet<string>;
}): Promise<{
  priorArtifacts: PriorArtifact[];
  contextPacketPath: string;
  budget: ReturnType<typeof buildFlowContextPacketValue>["packet"]["budget"];
}> {
  const built = buildFlowContextPacketValue({
    snapshot: input.snapshot,
    step: input.step,
    outputs: input.outputs,
    contextMode: input.contextMode,
    forceFullTokens: input.forceFullTokens,
    generatedAt: nowIso(),
  });
  const absPath = await input.artifactStore.writeJson(
    path.posix.join("flows", input.step.id, "context-packet.json"),
    built.packet,
  );
  return {
    priorArtifacts: built.priorArtifacts,
    contextPacketPath: input.artifactStore.relPath(absPath),
    budget: built.packet.budget,
  };
}

// Honest turn outcome: a model turn "succeeded" only if its provider exited 0
// AND it produced usable output. A non-zero exit (an invocation failure the
// runner used to swallow) or empty/whitespace output (a silent no-op) is a
// real failure - the caller fails the run (or, for a continueOnError graph
// step, tolerates it) instead of registering empty output as success.
export function assessTurnResult(result: RoleRunResult): {
  ok: boolean;
  reason: string;
  failureClass: ProviderFailureClass | null;
} {
  const exit = result.providerResult.exitCode;
  if (exit !== 0) {
    // Carry the resilience layer's diagnosis (class + redacted excerpt)
    // instead of laundering every failure into "provider exited N".
    const f = result.providerResult.failure;
    return {
      ok: false,
      reason: f
        ? `provider exited ${exit} (${f.class}: ${f.excerpt})`
        : `provider exited ${exit}`,
      failureClass: f?.class ?? null,
    };
  }
  if (result.output.trim().length === 0) {
    return { ok: false, reason: "provider returned no output", failureClass: null };
  }
  return { ok: true, reason: "", failureClass: null };
}

export async function registerFlowRoleOutputs(input: {
  step: ResolvedFlowStep;
  result: RoleRunResult;
  outputs: Map<string, FlowContextOutput>;
  artifactStore: ArtifactStore;
  worktreePath: string | null;
}): Promise<void> {
  for (const token of input.step.outputs) {
    if (token === "diff") {
      if (!input.worktreePath) continue;
      const snapshot = await getDiffSnapshot({
        worktreePath: input.worktreePath,
      });
      const absPath = await input.artifactStore.writeJson(
        path.posix.join("flows", input.step.id, "diff-snapshot.json"),
        snapshot,
      );
      input.outputs.set(token, {
        token,
        label: `${input.step.label}: ${token}`,
        content: `${JSON.stringify(snapshot, null, 2)}\n`,
        artifactPath: input.artifactStore.relPath(absPath),
      });
      continue;
    }
    input.outputs.set(token, {
      token,
      label: `${input.step.label}: ${token}`,
      content: input.result.output,
      artifactPath: input.result.outputArtifactPath,
    });
  }
}

export function registerFlowValidationOutputs(input: {
  step: ResolvedFlowStep;
  validation: ValidationResults;
  validationArtifactPath: string;
  outputs: Map<string, FlowContextOutput>;
}): void {
  for (const token of input.step.outputs) {
    input.outputs.set(token, {
      token,
      label: `${input.step.label}: ${token}`,
      content: `${JSON.stringify(input.validation, null, 2)}\n`,
      artifactPath: input.validationArtifactPath,
    });
  }
}

export async function recordFlowArbitrationOutputs(input: {
  projectRoot: string;
  step: ResolvedFlowStep;
  result: RoleRunResult;
  outputs: Map<string, FlowContextOutput>;
  validation: ValidationResults | null;
  artifactStore: ArtifactStore;
  eventLog: EventLog;
  ledger: FlowArbitrationLedger;
  store: FlowArbitrationStore;
}): Promise<FlowArbitrationLedger> {
  let ledger = input.ledger;
  let findingsChanged = false;

  if (input.step.outputs.includes("findings")) {
    const parsed = parseFlowJsonContract({
      text: input.result.output,
      schema: flowFindingsOutputSchema,
      expectedStepId: input.step.id,
    });
    if (parsed.ok) {
      ledger = recordFlowFindings({
        ledger,
        output: parsed.output,
        sourceArtifactPath: input.result.outputArtifactPath,
      });
      const absPath = await input.artifactStore.writeJson(
        path.posix.join("flows", "findings.json"),
        flowArbitrationCanonicalFindings(ledger, input.step.id),
      );
      input.outputs.set("findings", {
        token: "findings",
        label: "Flow Findings",
        content: `${JSON.stringify(
          flowArbitrationCanonicalFindings(ledger, input.step.id),
          null,
          2,
        )}\n`,
        artifactPath: input.artifactStore.relPath(absPath),
      });
      findingsChanged = true;
    } else {
      ledger = recordFlowArbitrationParseIssue({
        ledger,
        stepId: input.step.id,
        outputToken: "findings",
        sourceArtifactPath: input.result.outputArtifactPath,
        message: parsed.message,
      });
    }
  }

  if (input.step.outputs.includes("finding-responses")) {
    const parsed = parseFlowJsonContract({
      text: input.result.output,
      schema: flowFindingResponsesOutputSchema,
      expectedStepId: input.step.id,
    });
    if (parsed.ok) {
      ledger = recordFlowFindingResponses({
        ledger,
        output: parsed.output,
        sourceArtifactPath: input.result.outputArtifactPath,
      });
      ledger = await feedFlowAcceptedFindings(input.projectRoot, ledger);
      const canonical = flowArbitrationCanonicalResponses(
        ledger,
        input.step.id,
      );
      const absPath = await input.artifactStore.writeJson(
        path.posix.join("flows", "finding-responses.json"),
        canonical,
      );
      input.outputs.set("finding-responses", {
        token: "finding-responses",
        label: "Flow Finding Responses",
        content: `${JSON.stringify(canonical, null, 2)}\n`,
        artifactPath: input.artifactStore.relPath(absPath),
      });
      findingsChanged = true;
    } else {
      ledger = recordFlowArbitrationParseIssue({
        ledger,
        stepId: input.step.id,
        outputToken: "finding-responses",
        sourceArtifactPath: input.result.outputArtifactPath,
        message: parsed.message,
      });
    }
  }

  if (input.step.outputs.includes("finding-resolutions")) {
    const parsed = parseFlowJsonContract({
      text: input.result.output,
      schema: flowFindingResolutionsOutputSchema,
      expectedStepId: input.step.id,
    });
    if (parsed.ok) {
      ledger = recordFlowFindingResolutions({
        ledger,
        output: parsed.output,
        sourceArtifactPath: input.result.outputArtifactPath,
      });
      const canonical = flowArbitrationCanonicalResolutions(
        ledger,
        input.step.id,
      );
      const absPath = await input.artifactStore.writeJson(
        path.posix.join("flows", "finding-resolutions.json"),
        canonical,
      );
      input.outputs.set("finding-resolutions", {
        token: "finding-resolutions",
        label: "Flow Finding Resolutions",
        content: `${JSON.stringify(canonical, null, 2)}\n`,
        artifactPath: input.artifactStore.relPath(absPath),
      });
      findingsChanged = true;
    } else {
      ledger = recordFlowArbitrationParseIssue({
        ledger,
        stepId: input.step.id,
        outputToken: "finding-resolutions",
        sourceArtifactPath: input.result.outputArtifactPath,
        message: parsed.message,
      });
    }
  }

  if (input.step.outputs.includes("decision-summary")) {
    const parsed = parseFlowJsonContract({
      text: input.result.output,
      schema: flowDecisionSummaryOutputSchema,
      expectedStepId: input.step.id,
    });
    if (parsed.ok) {
      ledger = recordFlowDecision({
        ledger,
        output: parsed.output,
        sourceArtifactPath: input.result.outputArtifactPath,
      });
      const absPath = await input.artifactStore.writeJson(
        path.posix.join("flows", "decision-summary.json"),
        parsed.output,
      );
      input.outputs.set("decision-summary", {
        token: "decision-summary",
        label: "Flow Decision Summary",
        content: `${JSON.stringify(parsed.output, null, 2)}\n`,
        artifactPath: input.artifactStore.relPath(absPath),
      });
    } else {
      ledger = recordFlowArbitrationParseIssue({
        ledger,
        stepId: input.step.id,
        outputToken: "decision-summary",
        sourceArtifactPath: input.result.outputArtifactPath,
        message: parsed.message,
      });
    }
    ledger = await writeFlowDecisionSummaryArtifact({
      ledger,
      stepId: input.step.id,
      outputs: input.outputs,
      validation: input.validation,
      artifactStore: input.artifactStore,
    });
    await input.eventLog.append({
      type: "flow.decision.completed",
      message: `Flow decision summary persisted for ${input.step.id}.`,
      data: {
        stepId: input.step.id,
        decisionSummaryPath: ledger.decisionSummaryPath,
        structuredDecisionParsed: ledger.decision !== null,
      },
    });
  }

  if (findingsChanged) {
    await input.eventLog.append({
      type: "flow.findings.updated",
      message: `Flow arbitration records updated at ${input.step.id}.`,
      data: {
        stepId: input.step.id,
        findings: ledger.findings.length,
        responses: ledger.responses.length,
        resolutions: ledger.resolutions.length,
      },
    });
  }

  await input.store.write(ledger);
  return ledger;
}

// Builder-side structured handoffs (plan/architecture/execution). Mirrors the
// review-side contract handling but stateless: for each handoff token a step
// declares, parse the step output against its contract; on success replace the
// registered output with the canonical JSON (so the next step consumes clean
// structured data) and persist it as an artifact; on failure leave the raw
// text in place (already registered by registerFlowRoleOutputs) and record a
// parse issue. Either way emit `flow.handoff.parsed` so adoption is visible.
export async function recordFlowHandoffOutputs(input: {
  step: ResolvedFlowStep;
  result: RoleRunResult;
  outputs: Map<string, FlowContextOutput>;
  artifactStore: ArtifactStore;
  eventLog: EventLog;
}): Promise<void> {
  for (const token of input.step.outputs) {
    if (!isFlowHandoffToken(token)) continue;
    const spec = flowHandoffContracts[token];
    const parsed = parseFlowJsonContract({
      text: input.result.output,
      schema: spec.schema,
      expectedStepId: input.step.id,
    });
    if (parsed.ok) {
      const absPath = await input.artifactStore.writeJson(
        path.posix.join("flows", input.step.id, `${token}.json`),
        parsed.output,
      );
      input.outputs.set(token, {
        token,
        label: spec.label,
        content: `${JSON.stringify(parsed.output, null, 2)}\n`,
        artifactPath: input.artifactStore.relPath(absPath),
      });
    }
    await input.eventLog.append({
      type: "flow.handoff.parsed",
      message: parsed.ok
        ? `Structured ${token} parsed at ${input.step.id}.`
        : `Structured ${token} at ${input.step.id} did not parse; kept raw output.`,
      data: {
        stepId: input.step.id,
        token,
        parsed: parsed.ok,
        ...(parsed.ok ? {} : { message: parsed.message }),
      },
    });
  }
}

export async function feedFlowAcceptedFindings(
  projectRoot: string,
  ledger: FlowArbitrationLedger,
): Promise<FlowArbitrationLedger> {
  const svc = new ReviewSuggestionService(projectRoot, ledger.runId);
  for (const accepted of flowAcceptedFindingResponses(ledger)) {
    if (accepted.finding.suggestionId) continue;
    const fileRef = accepted.finding.finding.evidence.find(
      (evidence) => evidence.kind === "file",
    );
    const suggestion = await svc.addArtifactSuggestion({
      title: flowFindingSuggestionTitle(accepted.finding.finding),
      body: formatFlowFindingSuggestionBody({
        finding: accepted.finding.finding,
        response: accepted.response.response,
      }),
      file: fileRef?.ref ?? null,
      sourceArtifactPath: accepted.finding.sourceArtifactPath,
    });
    ledger = setFlowFindingSuggestionId({
      ledger,
      findingId: accepted.finding.finding.id,
      suggestionId: suggestion.id,
    });
  }

  if (ledger.acceptedReviewPassId) return ledger;
  const suggestionIds = flowAcceptedFindingResponses(ledger)
    .map((accepted) => accepted.finding.suggestionId)
    .filter((id): id is string => id !== null);
  if (suggestionIds.length === 0) return ledger;
  const bundle = await new SuggestionBundleService(
    projectRoot,
    ledger.runId,
  ).create({
    title: "Quality Arbitration accepted findings",
    description:
      "Findings the builder accepted or fixed during the Flow challenge response.",
    suggestionIds,
  });
  return setFlowAcceptedReviewPassId(ledger, bundle.id);
}

export async function writeFlowDecisionSummaryArtifact(input: {
  ledger: FlowArbitrationLedger;
  stepId: string;
  outputs: Map<string, FlowContextOutput>;
  validation: ValidationResults | null;
  artifactStore: ArtifactStore;
}): Promise<FlowArbitrationLedger> {
  await input.artifactStore.writeJson(
    path.posix.join("flows", "findings.json"),
    flowArbitrationCanonicalFindings(input.ledger, input.stepId),
  );
  await input.artifactStore.writeJson(
    path.posix.join("flows", "finding-responses.json"),
    flowArbitrationCanonicalResponses(input.ledger, input.stepId),
  );
  await input.artifactStore.writeJson(
    path.posix.join("flows", "finding-resolutions.json"),
    flowArbitrationCanonicalResolutions(input.ledger, input.stepId),
  );
  const absPath = await input.artifactStore.write(
    path.posix.join("flows", "decision-summary.md"),
    `${renderFlowDecisionSummaryMarkdown({
      ledger: input.ledger,
      validation: input.validation,
      validationArtifactPath:
        input.outputs.get("validation")?.artifactPath ?? null,
    })}\n`,
  );
  return setFlowDecisionSummaryPath(
    input.ledger,
    input.artifactStore.relPath(absPath),
  );
}
