import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildFlowContextPacket as buildThroughFunnel } from "../src/core/run-engine/flow-outputs.js";
import { ArtifactStore } from "../src/core/stores/artifact-store.js";
import {
  clampInjections,
  enrichStep,
  MAX_INJECTIONS_PER_STEP,
  MAX_INJECTION_BYTES,
  type ContextEngine,
  type ContextEngineView,
  injectionEvent,
  deterministicContextEngine,
  viewForStep,
} from "../src/supervisor/context-engine.js";
import {
  buildFlowContextPacket,
  type FlowContextOutput,
} from "../src/flows/runtime/flow-context-builder.js";
import { qualityArbitrationFlow } from "../src/flows/catalog/builtin-flows.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { projectConfigSchema } from "../src/project/config-schema.js";

/**
 * The Supervisor context engine is ADDITIVE ONLY. These tests pin that as
 * behaviour; the type signature is what makes it true (`proposeInjections`
 * returns additions and nothing else), and these prove the signature is
 * actually honoured end to end.
 */
const config = projectConfigSchema.parse({
  project: { name: "ctx-engine" },
  providers: {
    claude: { type: "claude-code", command: "claude", input: "stdin" },
    codex: { type: "cli", command: "codex", input: "stdin" },
  },
  profiles: {
    "claude-balanced": { provider: "claude" },
    "codex-balanced": { provider: "codex" },
  },
  crews: {
    default: {
      roles: {
        planner: { seats: ["planner"], profile: "claude-balanced", permissions: "readOnly", prompt: "planner.md" },
        architect: { seats: ["architect"], profile: "claude-balanced", permissions: "readOnly", prompt: "architect.md" },
        executor: { seats: ["implementer", "builder"], profile: "claude-balanced", permissions: "codeWrite", prompt: "executor.md" },
        fixer: { seats: ["fixer"], profile: "claude-balanced", permissions: "codeWrite", prompt: "fixer.md" },
        reviewer: { seats: ["reviewer", "challenger"], profile: "codex-balanced", permissions: "readOnly", prompt: "reviewer.md" },
        verifier: { seats: ["verifier", "arbiter"], profile: "claude-balanced", permissions: "readOnly", prompt: "verifier.md" },
      },
    },
  },
  defaultCrew: "default",
});

function output(token: string, content: string): FlowContextOutput {
  return { token, label: token, content, artifactPath: `artifacts/flows/${token}.md` };
}

function snapshot() {
  return resolveFlow({
    flow: qualityArbitrationFlow,
    source: { kind: "builtin", ref: qualityArbitrationFlow.id },
    config,
    task: "context engine",
    contextPolicy: "balanced",
    resolvedAt: "2026-05-23T00:00:00.000Z",
  });
}

const view: ContextEngineView = {
  stepId: "challenge-response",
  stepLabel: "Challenge",
  seat: "reviewer",
  declaredInputs: ["findings"],
  requiredInputs: ["findings"],
  candidates: [],
  task: "context engine",
};

describe("supervisor context engine is additive only", () => {
  it("an injection can never displace or shrink a declared input", () => {
    const s = snapshot();
    const step = s.steps.find((c) => c.id === "challenge-response")!;
    const findings = "the exact finding the reviewer must read\n".repeat(200);

    const withInjection = buildFlowContextPacket({
      snapshot: s,
      step: { ...step, requiredInputs: ["findings"] },
      contextMode: "stateless",
      outputs: new Map([["findings", output("findings", findings)]]),
      injections: [
        {
          source: "context-engine",
          label: "Earlier decision",
          content: "The team rejected the polling approach in step 2.",
          reason: "This seat did not receive step 2's output.",
        },
      ],
      generatedAt: "2026-05-23T00:00:00.000Z",
    });

    // The declared input is untouched: same disposition, whole content.
    const declared = withInjection.packet.inputs.find((i) => i.token === "findings");
    expect(declared?.disposition).toBe("embedded-full");
    expect(withInjection.packet.contractViolations).toEqual([]);
    const joined = withInjection.priorArtifacts.map((a) => a.content).join("\n");
    expect(joined).toContain(findings.trim());
    // And the addition is there, attributed.
    expect(joined).toContain("rejected the polling approach");
    expect(withInjection.packet.injections).toHaveLength(1);
    expect(withInjection.packet.injections[0]?.source).toBe("context-engine");
    expect(withInjection.packet.injections[0]?.reason).toContain("did not receive");
  });

  it("injecting changes nothing about the inputs a step would have received", () => {
    const s = snapshot();
    const step = s.steps.find((c) => c.id === "challenge-response")!;
    const outputs = () => new Map([["findings", output("findings", "a finding")]]);
    const base = { snapshot: s, step, contextMode: "stateless" as const, generatedAt: "2026-05-23T00:00:00.000Z" };

    const without = buildFlowContextPacket({ ...base, outputs: outputs() });
    const with_ = buildFlowContextPacket({
      ...base,
      outputs: outputs(),
      injections: [
        { source: "e", label: "L", content: "extra", reason: "because" },
      ],
    });

    // Byte-for-byte identical inputs. The only difference is what was ADDED.
    expect(with_.packet.inputs).toEqual(without.packet.inputs);
    expect(with_.priorArtifacts.length).toBe(without.priorArtifacts.length + 1);
  });

  it("clamps its own output, never the step's inputs", () => {
    const many = Array.from({ length: MAX_INJECTIONS_PER_STEP + 3 }, (_, i) => ({
      source: "e",
      label: `L${i}`,
      content: "x",
      reason: "r",
    }));
    expect(clampInjections(many).kept).toHaveLength(MAX_INJECTIONS_PER_STEP);

    const huge = [{ source: "e", label: "big", content: "x".repeat(MAX_INJECTION_BYTES + 1), reason: "r" }];
    expect(clampInjections(huge).kept).toHaveLength(0);
    expect(clampInjections(huge).dropped[0]?.why).toContain("bytes");

    // An addition with no stated reason is unattributable, so it is refused.
    const unattributed = [{ source: "e", label: "x", content: "y", reason: "  " }];
    expect(clampInjections(unattributed).kept).toHaveLength(0);
    expect(clampInjections(unattributed).dropped[0]?.why).toContain("no stated reason");
  });

  it("a failing engine costs the enrichment, never the step", async () => {
    const broken: ContextEngine = {
      id: "broken",
      proposeInjections: async () => {
        throw new Error("model unreachable");
      },
    };
    const result = await enrichStep(broken, view);
    expect(result.injections).toEqual([]);
    expect(result.error).toBe("model unreachable");
  });

  it("the engine is handed names, not handles - there is nothing to mutate", async () => {
    let seen: ContextEngineView | null = null;
    const nosy: ContextEngine = {
      id: "nosy",
      proposeInjections: async (v) => {
        seen = v;
        return { injections: [], note: "nothing to add" };
      },
    };
    const result = await enrichStep(nosy, view);
    expect(result.note).toBe("nothing to add");
    // The view carries token NAMES. There is no content, no packet, and no
    // setter, so an engine has no object through which to remove an input.
    expect(seen!.declaredInputs).toEqual(["findings"]);
    expect(Object.keys(seen!)).not.toContain("packet");
    expect(Object.keys(seen!)).not.toContain("outputs");
  });

  it("every injection becomes one auditable, attributable event", () => {
    const event = injectionEvent({
      stepId: "review",
      engineId: "context-engine",
      injection: {
        source: "prior-decision",
        label: "Earlier decision",
        content: "The team rejected polling in step 2.",
        reason: "This seat did not receive step 2's output.",
      },
    });
    expect(event.type).toBe("supervisor.context_injection");
    expect(event.data.stepId).toBe("review");
    expect(event.data.reason).toContain("did not receive");
    expect(event.data.bytes).toBeGreaterThan(0);
    // The event vocabulary has one verb. There is no "removed" to emit.
    expect(event.data.effect).toBe("added");
  });

  it("viewForStep hands the engine the COMPLEMENT, never what the step holds", () => {
    // The structural half of the guarantee: the engine's whole input domain is
    // what the step is missing, so there is no object on which it could act to
    // drop something the step has.
    const v = viewForStep({
      step: { id: "review", label: "Review", seat: "reviewer", inputs: ["findings"], requiredInputs: ["findings"] },
      outputs: new Map([
        ["findings", { token: "findings", label: "findings", content: "SECRET-DECLARED" }],
        ["architecture", { token: "architecture", label: "architecture", content: "we chose queues" }],
      ]),
      task: "t",
    });
    expect(v.candidates.map((c) => c.token)).toEqual(["architecture"]);
    // The declared input's content is nowhere in the view.
    expect(JSON.stringify(v)).not.toContain("SECRET-DECLARED");
  });

  it("the deterministic tier states which outputs the step is NOT getting", async () => {
    const v = viewForStep({
      step: { id: "review", label: "Review", seat: "reviewer", inputs: ["findings"] },
      outputs: new Map([
        ["findings", { token: "findings", label: "Findings", content: "declared" }],
        ["architecture", { token: "architecture", label: "Architecture", content: "we rejected polling" }],
      ]),
      task: "t",
    });
    const decision = await deterministicContextEngine.proposeInjections(v);
    expect(decision.injections).toHaveLength(1);
    const body = decision.injections[0]!.content;
    // The undeclared one is named; the declared one is not re-listed.
    expect(body).toContain("architecture");
    expect(body).not.toContain("- findings");
    // A manifest, not a copy: the content is pointed at, never inlined.
    expect(body).not.toContain("we rejected polling");
  });

  it("says so plainly when the step already declares everything", async () => {
    const v = viewForStep({
      step: { id: "review", label: "Review", seat: "reviewer", inputs: ["findings"] },
      outputs: new Map([["findings", { token: "findings", label: "Findings", content: "x" }]]),
      task: "t",
    });
    const decision = await deterministicContextEngine.proposeInjections(v);
    expect(decision.injections).toEqual([]);
    // Silence is legible rather than indistinguishable from "did not run".
    expect(decision.note).toContain("already declared");
  });

  it("a seatless step is never enriched - nothing there reads a prompt", async () => {
    // Found by running it, not by a test: the first live run injected into
    // `validation` (seat=null), which executes a command and never reads a
    // prompt. 263 bytes nobody would ever see.
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-seatless-"));
    const store = new ArtifactStore(root, "quiet-otter");
    await store.init();

    const s = snapshot();
    const step = s.steps.find((c) => c.id === "challenge-response")!;
    const built = await buildThroughFunnel({
      snapshot: s,
      step: { ...step, seat: null },
      outputs: new Map([
        ["architecture", output("architecture", "we chose queues")],
      ]),
      artifactStore: store,
      contextMode: "stateless",
    });
    expect(built.priorArtifacts.filter((a) => a.label.includes("supervisor:"))).toEqual([]);

    // The same step WITH a seat does get the manifest, so this is the seat
    // check doing the work rather than the engine simply finding nothing.
    const seated = await buildThroughFunnel({
      snapshot: s,
      step,
      outputs: new Map([
        ["architecture", output("architecture", "we chose queues")],
      ]),
      artifactStore: store,
      contextMode: "stateless",
    });
    expect(seated.priorArtifacts.some((a) => a.label.includes("supervisor:"))).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });
});
