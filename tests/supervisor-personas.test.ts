import { describe, it, expect } from "vitest";
import os from "node:os";
import {
  projectConfigSchema,
  type ProjectConfig,
} from "../src/project/config-schema.js";
import {
  resolvePersona,
  classifyTaskRisk,
  listPersonaIds,
  BUILTIN_PERSONAS,
} from "../src/orchestrator/personas.js";
import { chooseRunFlow } from "../src/orchestrator/select-workflow.js";
import { deriveRunAssurance } from "../src/safety/run-assurance.js";

function baseConfigRaw(extra: Record<string, unknown> = {}) {
  return {
    project: { name: "x" },
    providers: { claude: { type: "cli", command: "claude" } },
    profiles: { "claude-balanced": { provider: "claude" } },
    crews: {
      default: {
        roles: {
          planner: { seats: ["planner"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
          executor: { seats: ["implementer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
          reviewer: { seats: ["reviewer"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
        },
      },
    },
    defaultCrew: "default",
    ...extra,
  };
}
function baseConfig(extra: Record<string, unknown> = {}): ProjectConfig {
  const r = projectConfigSchema.parse(baseConfigRaw(extra));
  return r;
}

describe("supervisor personas - resolution + classifier", () => {
  it("resolves the built-in default with no config personas", () => {
    const cfg = baseConfig();
    const r = resolvePersona(cfg);
    expect(r.id).toBe("staff-engineer");
    expect(r.config.label).toBe(BUILTIN_PERSONAS["staff-engineer"]!.label);
  });

  it("an override wins; an unknown override falls back to the built-in default (never throws)", () => {
    const cfg = baseConfig();
    expect(resolvePersona(cfg, "nope").id).toBe("staff-engineer");
  });

  it("lists built-in + project persona ids", () => {
    const cfg = baseConfig({
      personas: { security: { label: "Security", riskSignals: [], prefersFlows: [], reviewLenses: [] } },
    });
    expect(listPersonaIds(cfg).sort()).toEqual(["security", "staff-engineer"]);
    expect(resolvePersona(cfg, "security").config.label).toBe("Security");
  });

  it("classifyTaskRisk matches case-insensitive substrings, dedupes, empty on no match", () => {
    expect(classifyTaskRisk("Add OAuth login + a DB migration", ["auth", "migration", "payment"]).sort()).toEqual([
      "auth",
      "migration",
    ]);
    expect(classifyTaskRisk("tweak the footer color", ["auth", "payment"])).toEqual([]);
  });
});

describe("supervisor personas - config schema", () => {
  it("defaultPersona resolves to a built-in with no personas block (back-compat)", () => {
    const r = projectConfigSchema.safeParse(baseConfigRaw());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.defaultPersona).toBe("staff-engineer");
  });

  it("rejects a defaultPersona that is neither a built-in nor in personas", () => {
    const r = projectConfigSchema.safeParse(baseConfigRaw({ defaultPersona: "ghost" }));
    expect(r.success).toBe(false);
  });

  it("accepts a project persona + a defaultPersona pointing at it", () => {
    const r = projectConfigSchema.safeParse(
      baseConfigRaw({
        personas: { security: { label: "Security", riskSignals: ["auth"], prefersFlows: ["panel-review"], reviewLenses: ["authz"] } },
        defaultPersona: "security",
      }),
    );
    expect(r.success).toBe(true);
  });

  it("rejects a persona reviewerProfile that doesn't exist", () => {
    const r = projectConfigSchema.safeParse(
      baseConfigRaw({
        personas: { security: { label: "Security", reviewerProfile: "ghost-profile" } },
      }),
    );
    expect(r.success).toBe(false);
  });
});

describe("supervisor personas - the upgrade-only flow bias (the teeth)", () => {
  const projectRoot = os.tmpdir(); // builtins (incl. panel-review) discover regardless

  it("upgrades the default flow to panel-review for a risk-tagged task", async () => {
    const sel = await chooseRunFlow({
      projectRoot,
      task: "Refactor the auth login flow and add a migration",
      config: baseConfig(),
    });
    expect(sel.flowId).toBe("panel-review");
    expect(sel.source).toBe("supervisor-upgraded");
    expect(sel.personaId).toBe("staff-engineer");
    expect(sel.personaUpgrade?.from).toBe("default");
    expect(sel.personaUpgrade?.to).toBe("panel-review");
    expect(sel.personaUpgrade?.signals).toContain("auth");
  });

  it("does NOT upgrade a non-risky task", async () => {
    const sel = await chooseRunFlow({
      projectRoot,
      task: "Tweak the footer spacing and copy",
      config: baseConfig(),
    });
    expect(sel.flowId).toBe("default");
    expect(sel.source).toBe("default");
    expect(sel.personaUpgrade).toBeNull();
  });

  it("is strictly upgrade-only: won't switch to a LIGHTER preferred flow", async () => {
    // A project persona that prefers a lighter flow (pickup = medium) than the
    // heavy default flow (panel-review = high). A risk match must NOT downgrade.
    const cfg = baseConfig({
      defaultFlow: "panel-review",
      personas: {
        lean: { label: "Lean", riskSignals: ["auth"], prefersFlows: ["pickup"], reviewLenses: [] },
      },
      defaultPersona: "lean",
    });
    const sel = await chooseRunFlow({
      projectRoot,
      task: "Refactor the auth login flow",
      config: cfg,
    });
    expect(sel.flowId).toBe("panel-review"); // kept the heavier default
    expect(sel.personaUpgrade).toBeNull();
  });

  it("never overrides an explicit --flow, even on a risky task", async () => {
    const sel = await chooseRunFlow({
      projectRoot,
      task: "Refactor the auth login flow",
      config: baseConfig(),
      forcedFlowId: "default",
    });
    expect(sel.flowId).toBe("default");
    expect(sel.source).toBe("forced");
    expect(sel.personaUpgrade).toBeNull();
    expect(sel.personaId).toBe("staff-engineer");
  });
});

describe("supervisor personas - assurance independence label (honest)", () => {
  const common = {
    runId: "r1",
    runStatus: "merge_ready",
    finalDecision: "APPROVED" as const,
    verification: null,
    actionLog: [],
    generatedAt: "2026-06-08T00:00:00.000Z",
  };

  it("labels single-profile when fewer than 2 distinct models ran", () => {
    const a = deriveRunAssurance({ ...common, persona: "staff-engineer", modelsUsed: [null, "opus", "opus"] });
    expect(a.supervisor.persona).toBe("staff-engineer");
    expect(a.supervisor.independence).toBe("single-profile");
  });

  it("labels cross-model only when >= 2 distinct non-null models ran", () => {
    const a = deriveRunAssurance({ ...common, persona: "staff-engineer", modelsUsed: ["opus", "sonnet"] });
    expect(a.supervisor.independence).toBe("cross-model");
  });
});
