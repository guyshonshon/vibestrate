import { describe, it, expect } from "vitest";
import os from "node:os";
import {
  projectConfigSchema,
  BUILTIN_PERSONA_IDS,
  type ProjectConfig,
} from "../src/project/config-schema.js";
import {
  resolvePersona,
  classifyTaskRisk,
  listPersonaIds,
  BUILTIN_PERSONAS,
} from "../src/supervisor/personas.js";
import { chooseRunFlow } from "../src/supervisor/select-workflow.js";
import { resolveRunPosture } from "../src/supervisor/posture-apply.js";
import { deriveRunAssurance } from "../src/safety/run-assurance.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { securityReviewFlow, reviewPanelFlow, defaultFlow } from "../src/flows/catalog/builtin-flows.js";

function baseConfigRaw(extra: Record<string, unknown> = {}) {
  return {
    project: { name: "x" },
    providers: { claude: { type: "cli", command: "claude" } },
    profiles: { "claude-balanced": { provider: "claude" } },
    crews: {
      default: {
        roles: {
          planner: { seats: ["planner"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
          architect: { seats: ["architect"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
          executor: { seats: ["implementer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
          reviewer: { seats: ["reviewer"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
          verifier: { seats: ["verifier", "arbiter"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
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

describe("supervisor personas - prefersPosture nudge (Slice B, advisory)", () => {
  const projectRoot = os.tmpdir();

  it("nudges posture to the persona's prefersPosture on a risk-matched task (security)", async () => {
    const sel = await chooseRunFlow({
      projectRoot,
      task: "Refactor the auth login + token handling",
      config: baseConfig(),
      personaOverride: "security",
    });
    // The security built-in prefers a sandbox posture for risky work.
    expect(sel.posture).toBe("sandbox-suggested");
    expect(sel.advisory).toMatch(/sandbox/i);
    expect(sel.reasons.some((r) => /posture/i.test(r))).toBe(true);
  });

  it("the default staff-engineer (no prefersPosture) keeps posture normal on a risk task", async () => {
    const sel = await chooseRunFlow({
      projectRoot,
      task: "Refactor the auth login flow and add a migration",
      config: baseConfig(),
    });
    expect(sel.posture).toBe("normal");
  });

  it("does NOT nudge posture on a non-risky task even under the security persona", async () => {
    const sel = await chooseRunFlow({
      projectRoot,
      task: "Tweak the footer spacing and copy",
      config: baseConfig(),
      personaOverride: "security",
    });
    expect(sel.posture).toBe("normal");
  });

  it("never nudges posture when --flow is forced (persona is only tagged)", async () => {
    const sel = await chooseRunFlow({
      projectRoot,
      task: "Refactor the auth login + token handling",
      config: baseConfig(),
      personaOverride: "security",
      forcedFlowId: "default",
    });
    expect(sel.source).toBe("forced");
    expect(sel.posture).toBe("normal");
  });
});

describe("posture-applies (Slice 2b) - real selection -> effective run posture", () => {
  const projectRoot = os.tmpdir();
  const riskyTask = "Refactor the auth login + token handling";

  it("auto-applies sandbox isolation when a real selection suggests it + flag on", async () => {
    const cfg = baseConfig({ posture: { autoApplySandbox: true } });
    const sel = await chooseRunFlow({ projectRoot, task: riskyTask, config: cfg, personaOverride: "security" });
    expect(sel.posture).toBe("sandbox-suggested"); // the real selection
    const eff = resolveRunPosture({
      posture: sel.posture,
      config: cfg.posture,
      specPermissionMode: null,
      readOnly: false,
      unattended: false,
    });
    expect(eff.isolationOverride).toBe("sandboxed");
    expect(eff.notes.join(" ")).toMatch(/sandbox posture applied/);
  });

  it("does NOT apply sandbox when the flag is off (default)", async () => {
    const cfg = baseConfig(); // posture flags default off
    const sel = await chooseRunFlow({ projectRoot, task: riskyTask, config: cfg, personaOverride: "security" });
    expect(sel.posture).toBe("sandbox-suggested");
    const eff = resolveRunPosture({
      posture: sel.posture,
      config: cfg.posture,
      specPermissionMode: null,
      readOnly: false,
      unattended: false,
    });
    expect(eff.isolationOverride).toBeUndefined();
  });

  it("auto-applies an approval gate (ask) attended, suppresses it unattended", async () => {
    const cfg = baseConfig({
      posture: { autoApplyApproval: true },
      personas: {
        gate: {
          label: "Gate",
          riskSignals: ["auth"],
          prefersPosture: "approval-suggested",
          prefersFlows: [],
          reviewLenses: [],
        },
      },
      defaultPersona: "gate",
    });
    const sel = await chooseRunFlow({ projectRoot, task: "Refactor the auth login flow", config: cfg });
    expect(sel.posture).toBe("approval-suggested");
    const attended = resolveRunPosture({
      posture: sel.posture, config: cfg.posture, specPermissionMode: null, readOnly: false, unattended: false,
    });
    expect(attended.permissionMode).toBe("ask");
    const unattended = resolveRunPosture({
      posture: sel.posture, config: cfg.posture, specPermissionMode: null, readOnly: false, unattended: true,
    });
    expect(unattended.permissionMode).toBeUndefined();
    expect(unattended.notes.join(" ")).toMatch(/suppressed \(unattended\)/);
  });
});

describe("supervisor personas - a second persona with distinct lenses (security)", () => {
  const projectRoot = os.tmpdir();

  it("BUILTIN_PERSONA_IDS (schema) and BUILTIN_PERSONAS (runtime) are in sync BOTH ways", () => {
    // Forward: every runtime persona is an accepted default. Reverse (the
    // dangerous one): every schema-accepted built-in id actually resolves to a
    // persona - else defaultPersona validates but silently falls back.
    for (const id of Object.keys(BUILTIN_PERSONAS)) {
      expect(BUILTIN_PERSONA_IDS as readonly string[]).toContain(id);
    }
    for (const id of BUILTIN_PERSONA_IDS) {
      expect(Object.keys(BUILTIN_PERSONAS)).toContain(id);
    }
  });

  it("the security persona resolves and prefers the security-review panel", () => {
    const cfg = baseConfig({ defaultPersona: "security" });
    const r = resolvePersona(cfg);
    expect(r.id).toBe("security");
    expect(r.config.prefersFlows).toEqual(["security-review"]);
  });

  it("routes the SAME risky task to DIFFERENT panels per persona (behavioral, not tone)", async () => {
    const task = "Refactor the auth login + token handling";
    const sec = await chooseRunFlow({ projectRoot, task, config: baseConfig(), personaOverride: "security" });
    const eng = await chooseRunFlow({ projectRoot, task, config: baseConfig(), personaOverride: "staff-engineer" });
    expect(sec.flowId).toBe("security-review");
    expect(eng.flowId).toBe("panel-review");
    expect(sec.flowId).not.toBe(eng.flowId);
  });

  it("security-review resolves with all reviewer lenses read-only (one writer per worktree)", () => {
    // Throws if any parallel-group member can write - so a clean resolve proves
    // the 3 security lenses are read-only.
    const snap = resolveFlow({
      flow: securityReviewFlow,
      source: { kind: "builtin", ref: "security-review" },
      config: baseConfig(),
      task: "x",
    });
    const lensIds = snap.steps
      .filter((s) => s.id.startsWith("review-"))
      .map((s) => s.id)
      .sort();
    expect(lensIds).toEqual(["review-authz", "review-injection", "review-secrets"]);
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

describe("supervisor personas - the review panels are review-only (capped at partially_verified)", () => {
  // Honesty claim (CHANGELOG 0.7.31 + orchestrator-personas.md): a run on
  // `security-review` (and the generalist `panel-review` the staff-engineer
  // persona prefers) can NEVER reach the `verified` assurance level, because the
  // flow ends at the arbiter with NO verifying step - so the run produces
  // verification = not_run. The assurance *consequence* (verification not_run ->
  // partially_verified, even with validation + review passing) is already proven
  // in tests/safety/run-assurance.test.ts ("partially_verified: approved but
  // verification not run"). What was unguarded is the STRUCTURAL reason that holds
  // that claim up - if someone adds a verify gate to these flows, the cap silently
  // breaks and the changelog becomes a lie. These two assertions are that guard.

  it("security-review and panel-review have no verifying-stage step (the default flow does)", () => {
    const hasVerifyGate = (f: typeof defaultFlow) => f.steps.some((s) => s.stage === "verifying");
    expect(hasVerifyGate(securityReviewFlow)).toBe(false);
    expect(hasVerifyGate(reviewPanelFlow)).toBe(false);
    // Anchor: the "verifying" discriminator is real - the default flow DOES verify,
    // so the two `false`s above mean "no verify gate", not "wrong stage name".
    expect(hasVerifyGate(defaultFlow)).toBe(true);
  });

  it("both panels' terminal scrutiny is a review-turn arbiter, not a verify gate", () => {
    for (const f of [securityReviewFlow, reviewPanelFlow]) {
      const arbiter = f.steps.find((s) => s.id === "arbiter");
      expect(arbiter, `${f.id} must have an arbiter step`).toBeDefined();
      expect(arbiter!.kind).toBe("review-turn");
      // And nothing downstream re-verifies: no verifier seat anywhere in the flow.
      expect(f.steps.some((s) => s.seat === "verifier")).toBe(false);
    }
  });
});

// ── persona.reviewerProfile (P9d): the supervisor's cost lever ──────────────

describe("reviewerProfile resolution", () => {
  const cfgWithCheapReviewer = () =>
    baseConfig({
      profiles: {
        "claude-balanced": { provider: "claude" },
        "cheap-reviewer": { provider: "claude", model: "claude-haiku-4-5-20251001" },
      },
      crews: {
        default: {
          roles: {
            planner: { seats: ["planner"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            architect: { seats: ["architect"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            executor: { seats: ["implementer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
            fixer: { seats: ["fixer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
            reviewer: { seats: ["reviewer"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            verifier: { seats: ["verifier", "arbiter"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
          },
        },
      },
    });

  function resolveDefault(
    cfg: ProjectConfig,
    extra: Partial<Parameters<typeof resolveFlow>[0]> = {},
  ) {
    return resolveFlow({
      flow: defaultFlow,
      source: { kind: "builtin", ref: defaultFlow.id },
      config: cfg,
      task: "t",
      ...extra,
    });
  }

  it("review-stage seats resolve to the persona's reviewerProfile; others keep their default", () => {
    const snap = resolveDefault(cfgWithCheapReviewer(), {
      reviewerProfile: "cheap-reviewer",
    });
    const review = snap.steps.filter(
      (s) => s.kind === "review-turn" || s.stage === "reviewing",
    );
    expect(review.length).toBeGreaterThan(0);
    for (const s of review) expect(s.profileId).toBe("cheap-reviewer");
    const exec = snap.steps.find((s) => s.stage === "executing" && s.seat);
    expect(exec!.profileId).toBe("claude-balanced");
  });

  it("explicit overrides ALWAYS beat the persona reviewerProfile", () => {
    const cfg = cfgWithCheapReviewer();
    const reviewStepId = resolveDefault(cfg).steps.find(
      (s) => s.kind === "review-turn" || s.stage === "reviewing",
    )!.id;
    // Per-step override wins.
    const perStep = resolveDefault(cfg, {
      reviewerProfile: "cheap-reviewer",
      stepProfileOverrides: { [reviewStepId]: "claude-balanced" },
    });
    expect(
      perStep.steps.find((s) => s.id === reviewStepId)!.profileId,
    ).toBe("claude-balanced");
    // Run-wide explicit override wins too.
    const runWide = resolveDefault(cfg, {
      reviewerProfile: "cheap-reviewer",
      profileOverride: "claude-balanced",
    });
    for (const s of runWide.steps.filter((x) => x.seat)) {
      expect(s.profileId).toBe("claude-balanced");
    }
  });

  it("the panel ARBITER is never pinned - the binding verdict keeps its profile", () => {
    // The arbiter weighs the reviewers; pinning it to the cheap reviewer
    // model would partly undo the upgrade that picked the panel.
    const cfg = baseConfig({
      profiles: {
        "claude-balanced": { provider: "claude" },
        "cheap-reviewer": { provider: "claude" },
      },
      crews: {
        default: {
          roles: {
            planner: { seats: ["planner"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            architect: { seats: ["architect"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            executor: { seats: ["implementer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
            fixer: { seats: ["fixer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
            reviewer: { seats: ["reviewer"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            arbiter: { seats: ["arbiter", "verifier"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
          },
        },
      },
    });
    const snap = resolveFlow({
      flow: reviewPanelFlow,
      source: { kind: "builtin", ref: reviewPanelFlow.id },
      config: cfg,
      task: "t",
      reviewerProfile: "cheap-reviewer",
    });
    const arbiter = snap.steps.find((s) => s.seat === "arbiter");
    expect(arbiter).toBeDefined();
    expect(arbiter!.profileId).toBe("claude-balanced");
    const lenses = snap.steps.filter(
      (s) => s.kind === "review-turn" && s.seat === "reviewer",
    );
    expect(lenses.length).toBeGreaterThanOrEqual(3);
    for (const s of lenses) expect(s.profileId).toBe("cheap-reviewer");
  });

  it("the FIX step (a writer) and seatless steps are untouched", () => {
    const snap = resolveDefault(cfgWithCheapReviewer(), {
      reviewerProfile: "cheap-reviewer",
    });
    const fix = snap.steps.find((s) => s.id.startsWith("fix"));
    expect(fix).toBeDefined();
    expect(fix!.profileId).toBe("claude-balanced");
    const seatless = snap.steps.filter((s) => !s.seat);
    expect(seatless.length).toBeGreaterThan(0);
    for (const s of seatless) expect(s.profileId).toBeNull();
  });

  it("no reviewerProfile = byte-identical resolution to before", () => {
    const cfg = cfgWithCheapReviewer();
    const a = resolveDefault(cfg, { resolvedAt: "2026-06-12T00:00:00.000Z" });
    const b = resolveDefault(cfg, {
      reviewerProfile: null,
      resolvedAt: "2026-06-12T00:00:00.000Z",
    });
    expect(b).toEqual(a);
  });
});
