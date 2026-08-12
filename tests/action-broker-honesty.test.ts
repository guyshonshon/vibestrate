import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  createActionBroker,
  gateAction,
  readActionLog,
  type ActionKind,
  type ActionRequest,
} from "../src/safety/action-broker.js";
import {
  actionKindSchema,
  actionPolicySchema,
  HOLDABLE_ACTION_KINDS,
} from "../src/policies/policy-types.js";
import {
  describeBrokenPolicySet,
  loadPolicySnapshot,
} from "../src/policies/policy-store.js";
import { runProvider } from "../src/providers/provider-runner.js";
import { runPreflightChecks, describeUnboundedRun } from "../src/core/policy-engine.js";
import { PolicyError } from "../src/utils/errors.js";

// Guarantees that keep the Action Broker's advertised surface equal to its real
// one. Each block defends a specific way the boundary used to overstate itself.

function req(kind: ActionKind): ActionRequest {
  return { runId: "r1", kind, subject: {}, proposedBy: "system" };
}

describe("the action-kind vocabulary matches what actually crosses the boundary", () => {
  // A kind in the type union but in nobody's emitter advertises coverage that
  // does not exist. `network.request` and `mcp.tool` sat here for exactly that
  // reason: no site ever raised them, and no policy could target them either,
  // because the schema (correctly) never listed them.
  it("the policy schema and the broker union enumerate the same kinds", () => {
    const schemaKinds = [...actionKindSchema.options].sort();
    // Exhaustive by construction: adding a kind to ActionKind without adding it
    // here is a compile error, and adding it here without the schema fails below.
    const unionKinds: ActionKind[] = [
      "provider.spawn",
      "command.run",
      "file.patch",
      "file.write",
      "terminal.create",
      "run.complete",
      "git.merge",
    ];
    expect(schemaKinds).toEqual([...unionKinds].sort());
  });

  it("every holdable kind is a real kind", () => {
    for (const kind of HOLDABLE_ACTION_KINDS) {
      expect(actionKindSchema.options).toContain(kind);
    }
  });

  it("the UI's hand-written mirror lists exactly the schema's kinds", async () => {
    // The UI can't import a server zod schema, so PolicyActionKind is a
    // hand-maintained union - and it HAD drifted (missing git.merge, still
    // carrying kinds the schema dropped). Read the source and compare, so the
    // next divergence fails here instead of shipping a policy editor that
    // offers kinds the engine rejects.
    const src = await fs.readFile(
      path.join(process.cwd(), "src/ui/lib/types/suggestions.ts"),
      "utf8",
    );
    const decl = /export type PolicyActionKind =([\s\S]*?);/.exec(src);
    expect(decl, "PolicyActionKind declaration not found").not.toBeNull();
    const mirrored = [...decl![1]!.matchAll(/"([a-z.]+)"/g)].map((m) => m[1]!).sort();
    expect(mirrored).toEqual([...actionKindSchema.options].sort());
  });
});

describe("require_approval only survives where something can actually pause", () => {
  // The footgun: `gateAction` refuses on ANY non-allow verdict, so a
  // require_approval at a site with no approval seam is a hard block wearing a
  // "hold" label. The schema now rejects the combination at load.
  it("rejects a require_approval policy on a kind that cannot hold", () => {
    const parsed = actionPolicySchema.safeParse({
      id: "hold-installs",
      description: "hold package installs",
      on: ["command.run"],
      effect: "require_approval",
      message: "please approve",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]!.message).toMatch(/cannot pause command\.run/);
    }
  });

  it("names every offending kind when the policy lists a mix", () => {
    const parsed = actionPolicySchema.safeParse({
      id: "mixed",
      description: "mixed kinds",
      on: ["run.complete", "command.run", "terminal.create"],
      effect: "require_approval",
      message: "please approve",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]!.message;
      expect(msg).toContain("command.run");
      expect(msg).toContain("terminal.create");
      expect(msg).not.toContain("cannot pause run.complete");
    }
  });

  it("accepts require_approval on the kinds that do hold", () => {
    for (const kind of HOLDABLE_ACTION_KINDS) {
      const parsed = actionPolicySchema.safeParse({
        id: "holdIt",
        description: "hold",
        on: [kind],
        effect: "require_approval",
        message: "approve first",
      });
      expect(parsed.success, kind).toBe(true);
    }
  });

  it("still accepts deny on every kind", () => {
    for (const kind of actionKindSchema.options) {
      const parsed = actionPolicySchema.safeParse({
        id: "denyIt",
        description: "deny",
        on: [kind],
        effect: "deny",
        message: "no",
      });
      expect(parsed.success, kind).toBe(true);
    }
  });

  it("records a hold that could not pause as a refusal, in evidence", async () => {
    // file.patch is the honest half-case: it holds at the diff gate and refuses
    // at the apply surfaces. The audit log must not read as "a human was asked"
    // when no human was.
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-gate-"));
    const broker = createActionBroker(projectRoot, "r1", {
      evaluatorLoader: async () => [
        () => ({
          effect: "require_approval" as const,
          ruleIds: ["hold"],
          reason: "hold it",
        }),
      ],
    });

    const noSeam = await gateAction(broker, req("file.patch"));
    expect(noSeam.allowed).toBe(false);
    const withSeam = await gateAction(broker, req("file.patch"), { canHold: true });
    expect(withSeam.allowed).toBe(false);

    const log = await readActionLog(projectRoot, "r1");
    expect(log).toHaveLength(2);
    // Both keep the policy's own verdict - the policy really did say "hold".
    expect(log[0]!.decision.effect).toBe("require_approval");
    expect(log[1]!.decision.effect).toBe("require_approval");
    // Only the seamless site carries the "this was refused, not held" evidence.
    expect(log[0]!.evidence?.ok).toBe(false);
    expect(log[0]!.evidence?.summary).toMatch(/refused/);
    expect(log[1]!.evidence).toBeNull();
  });
});

describe("a policy set that did not fully load refuses the run", () => {
  // Only the fields runPreflightChecks reads; the gate under test is the policy
  // SET, so a full project scaffold would just add moving parts.
  const MINIMAL_CONFIG = {
    crews: {},
    permissions: { profiles: {} },
    commands: { validate: [] },
    budget: {
      spendCapDailyUsd: null,
      maxTurnsPerRun: null,
      maxWallClockMinPerRun: null,
      maxTurnsPerDay: null,
      maxWallClockMinPerDay: null,
    },
    execution: { backend: "local-worktree", isolation: "off" },
  } as never;

  async function projectWith(policyFiles: Record<string, string>) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-preflight-"));
    const dir = path.join(root, ".vibestrate", "policies");
    await fs.mkdir(dir, { recursive: true });
    for (const [name, body] of Object.entries(policyFiles)) {
      await fs.writeFile(path.join(dir, name), body, "utf8");
    }
    return { root, config: MINIMAL_CONFIG };
  }

  const GOOD = `actions:
  - id: no-installs
    description: block installs
    on: [command.run]
    match: { commandRegex: "npm install" }
    effect: deny
    message: no installs
`;

  it("refuses when a policy file is malformed", async () => {
    const { root, config } = await projectWith({ "bad.yml": "actions: [ this: is: not: valid" });
    // Precondition: the store really did drop it (that silent drop is the bug).
    expect((await loadPolicySnapshot(root)).malformedFiles.length).toBeGreaterThan(0);
    await expect(
      runPreflightChecks({ projectRoot: root, config, isGitRepo: true }),
    ).rejects.toThrow(PolicyError);
    await expect(
      runPreflightChecks({ projectRoot: root, config, isGitRepo: true }),
    ).rejects.toThrow(/did not fully load/);
  });

  it("refuses when an id is defined twice - the later, stricter rule is dropped", async () => {
    // The nastier case: nothing is malformed, `list` looks healthy, and the rule
    // someone just tightened is the one silently discarded (first wins).
    const { root, config } = await projectWith({
      "a.yml": GOOD,
      "b.yml": GOOD.replace("no installs", "no installs (stricter)"),
    });
    const snap = await loadPolicySnapshot(root);
    expect(snap.malformedFiles).toEqual([]);
    expect(snap.duplicateIds).toContain("no-installs");
    await expect(
      runPreflightChecks({ projectRoot: root, config, isGitRepo: true }),
    ).rejects.toThrow(/duplicate id/);
  });

  it("starts normally when the policy set loads cleanly", async () => {
    const { root, config } = await projectWith({ "a.yml": GOOD });
    const result = await runPreflightChecks({
      projectRoot: root,
      config,
      isGitRepo: true,
    });
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  // The preflight only guards run CREATION. Several surfaces reach a provider
  // without it - `vibe consult`, task enhancement, flow selection, param
  // generation - and they all build their broker through createActionBroker.
  // So the same condition has to deny at the boundary too, or "a broken policy
  // set stops the work" is only true for one entry point.
  it("denies every effect that changes or runs something", async () => {
    const { root } = await projectWith({ "bad.yml": "actions: [ this: is: not: valid" });
    const broker = createActionBroker(root, "assist");
    for (const kind of actionKindSchema.options) {
      const decision = await broker.decide(req(kind));
      if (kind === "provider.spawn") continue; // refused in runProvider instead
      expect(decision.effect, kind).toBe("deny");
      expect(decision.ruleIds).toContain("policy.set.broken");
    }
  });

  // provider.spawn is refused one layer down, because three spawn sites
  // (roadmap planning, provider self-test, the conductor's supervisor turns)
  // build no broker at all - gating it here would have left them wide open.
  it("refuses a model spawn at runProvider, the funnel every turn crosses", async () => {
    const { root } = await projectWith({ "bad.yml": "actions: [ this: is: not: valid" });
    await expect(
      runProvider({} as never, {
        providerId: "anything",
        prompt: "hi",
        cwd: root,
        projectRoot: root,
      }),
    ).rejects.toThrow(/did not fully load/);
  });

  it("lets a model spawn through when the set is clean", async () => {
    // Reaching provider resolution (an unknown id) proves the policy gate
    // passed rather than the spawn being blocked for the wrong reason.
    const { root } = await projectWith({ "a.yml": GOOD });
    await expect(
      runProvider({} as never, {
        providerId: "nope",
        prompt: "hi",
        cwd: root,
        projectRoot: root,
      }),
    ).rejects.toThrow(/is not configured/);
  });

  it("names the offending file in the denial, so the fix is discoverable", async () => {
    const { root } = await projectWith({ "bad.yml": "actions: [ this: is: not: valid" });
    const broker = createActionBroker(root, "assist");
    const decision = await broker.decide(req("file.write"));
    const reason = "reason" in decision ? decision.reason : "";
    expect(reason).toContain("bad.yml");
    expect(reason).toContain("vibe policies doctor");
  });

  it("denies on a duplicate id too, not just a parse failure", async () => {
    const { root } = await projectWith({
      "a.yml": GOOD,
      "b.yml": GOOD.replace("no installs", "no installs (stricter)"),
    });
    const broker = createActionBroker(root, "assist");
    expect((await broker.decide(req("file.write"))).effect).toBe("deny");
  });

  it("leaves a clean policy set alone - an effect nobody wrote a rule about proceeds", async () => {
    // Guards against the deny firing on the happy path, which would brick every
    // run rather than only the broken ones.
    const { root } = await projectWith({ "a.yml": GOOD });
    const broker = createActionBroker(root, "assist");
    expect((await broker.decide(req("file.write"))).effect).toBe("allow");
    // The real rule in that file still applies.
    const cmd = await broker.decide({
      runId: "assist",
      kind: "command.run",
      subject: { command: "npm install lodash" },
      proposedBy: "system",
    });
    expect(cmd.effect).toBe("deny");
    expect(cmd.ruleIds).toContain("no-installs");
  });

  // The likeliest real-world breakage, and it used to fail OPEN: `access` with
  // F_OK succeeds on a chmod-000 directory and readdir's EACCES was swallowed,
  // so an unreadable policies dir was byte-identical to "no policies
  // configured" - every rule silently evaporated.
  it("treats an unreadable policies directory as broken, not as empty", async () => {
    const { root } = await projectWith({ "a.yml": GOOD });
    const dir = path.join(root, ".vibestrate", "policies");
    await fs.chmod(dir, 0o000);
    try {
      const snap = await loadPolicySnapshot(root);
      expect(snap.malformedFiles.length, "an unreadable dir must be reported").toBeGreaterThan(0);
      expect(describeBrokenPolicySet(snap)).not.toBeNull();
      const broker = createActionBroker(root, "assist");
      expect((await broker.decide(req("file.write"))).effect).toBe("deny");
    } finally {
      await fs.chmod(dir, 0o755);
    }
  });

  it("a missing policies directory is still just 'no policies'", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-nopol-"));
    const snap = await loadPolicySnapshot(root);
    expect(snap.malformedFiles).toEqual([]);
    expect(describeBrokenPolicySet(snap)).toBeNull();
  });

  it("says it is a config problem, not a rule the user wrote", async () => {
    // The reason gets wrapped as `blocked by policy (deny): ...` at nine call
    // sites - the same shape a real deny rule produces - so the one line has to
    // distinguish itself or the user hunts for a rule they never authored.
    const { root } = await projectWith({ "bad.yml": "actions: [ this: is: not: valid" });
    const broker = createActionBroker(root, "assist");
    const decision = await broker.decide(req("file.write"));
    const reason = "reason" in decision ? decision.reason : "";
    expect(reason).toContain("not a rule you wrote");
    expect(reason).not.toContain("\n"); // one line, for a wrapped error string
  });
});

describe("an unattended run with nothing bounding it says so", () => {
  const base = (over: Record<string, unknown> = {}) => ({
    budget: {
      spendCapDailyUsd: null,
      maxTurnsPerRun: null,
      maxWallClockMinPerRun: null,
      maxTurnsPerDay: null,
      maxWallClockMinPerDay: null,
    },
    execution: { backend: "local-worktree", isolation: "off" },
    ...over,
  });

  it("warns for unattended + no ceiling + no confinement", () => {
    const w = describeUnboundedRun({
      config: base() as never,
      unattended: true,
    });
    expect(w?.code).toBe("UNBOUNDED_UNATTENDED_RUN");
  });

  it("stays quiet for an attended run", () => {
    expect(
      describeUnboundedRun({ config: base() as never, unattended: false }),
    ).toBeNull();
  });

  it("stays quiet once ANY ceiling binds", () => {
    const withTurns = base({
      budget: {
        spendCapDailyUsd: null,
        maxTurnsPerRun: 40,
        maxWallClockMinPerRun: null,
        maxTurnsPerDay: null,
        maxWallClockMinPerDay: null,
      },
    });
    expect(
      describeUnboundedRun({ config: withTurns as never, unattended: true }),
    ).toBeNull();
  });

  it("stays quiet once the run is confined", () => {
    const sandboxed = base({
      execution: { backend: "local-worktree", isolation: "sandboxed" },
    });
    expect(
      describeUnboundedRun({ config: sandboxed as never, unattended: true }),
    ).toBeNull();
  });
});
