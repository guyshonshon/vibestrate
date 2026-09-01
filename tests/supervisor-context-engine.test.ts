import { describe, expect, it } from "vitest";
import {
  clampInjections,
  enrichStep,
  MAX_INJECTIONS_PER_STEP,
  MAX_INJECTION_BYTES,
  type ContextEngine,
  type ContextEngineView,
  injectionEvent,
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
  priorOutcomes: [],
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
});
