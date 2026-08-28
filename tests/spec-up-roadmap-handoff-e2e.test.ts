import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { ArtifactStore } from "../src/core/stores/artifact-store.js";
import { ProposalService } from "../src/roadmap/proposal-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { RoadmapStore } from "../src/roadmap/roadmap-store.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// ── The ROADMAP completion path carries the spec too ───────────────────────────
// Spec-up has two terminal handoffs. `approveSpecUpAndBuild` is proven end to end
// by spec-up-realignment-e2e.test.ts. This is the OTHER one:
//   approve -> spec-up-roadmap -> createRoadmapProposal -> `vibe roadmap accept`
//   -> board cards -> run the card
//
// `Task.specRef` and the launchers' attach steps existed before this test; what
// did not was anything that WROTE the file specRef points at, so the derivation
// returned null on every real proposal and the whole mechanism sat inert behind
// a fail-open `if (exists)`. That is the bug class this file guards: the two
// keystones assert on THE PROMPT THE PLANNER ACTUALLY RECEIVED, not on a field
// being populated or a file existing. Context materialization is fail-open by
// design (a bad attachment becomes a note and the run proceeds), so nothing
// short of reading the prompt proves the spec arrived.

const captured = vi.hoisted(() => ({ specs: [] as unknown[] }));
vi.mock("../src/core/detached-run.js", () => ({
  startDetachedRun: vi.fn(async ({ spec }: { spec: unknown }) => {
    captured.specs.push(spec);
    return 4242;
  }),
}));

const { createRoadmapProposal, SpecUpChainError } = await import(
  "../src/spec-up/spec-up-chain.js"
);
const { runFromSpec } = await import("../src/core/run/run-launcher.js");
const { runRunCommand } = await import("../src/cli/commands/run.js");

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Every agent dumps the prompt it received into its cwd (the run worktree).
const FAKE = `#!/usr/bin/env node
const fs = require('fs');
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  const m = i.match(/Vibestrate Agent: (\\w+)/);
  if (m) { try { fs.writeFileSync(m[1] + '-prompt.txt', i); } catch {} }
  if (i.includes('Vibestrate Agent: planner')) {
    console.log('# Plan\\nok');
  } else if (i.includes('Vibestrate Agent: reviewer')) {
    console.log('# Review\\nDECISION: APPROVED');
  } else if (i.includes('Vibestrate Agent: verifier')) {
    console.log('VERIFICATION: PASSED');
  } else {
    console.log('ok');
  }
});
`;

const ROADMAP_RUN = "keen-magpie";
const PROPOSAL_ID = `spec-up-${ROADMAP_RUN}`;
const MARKER = "SPEC_UP_SPEC_MARKER_ROADMAP_88";

// The synthesize step's output. Both card titles name a concrete .ts file so the
// run under test executes instead of detouring back into adaptive spec-up
// (classifyPlanWorthy reads a named code file as targeted, not greenfield).
const SYNTHESIS = `VIBESTRATE_ROADMAP_ITEM:
TITLE: Storefront checkout
PRIORITY: high

VIBESTRATE_TASK:
TITLE: Add the cart total to src/cart/summary.ts
ROADMAP: Storefront checkout
DESCRIPTION: Show the running total.
ACCEPTANCE: The summary renders the total.
EST: S
RISK: low

VIBESTRATE_TASK:
TITLE: Add the payment call to src/checkout/pay.ts
ROADMAP: Storefront checkout
DEPENDS_ON: Add the cart total to src/cart/summary.ts
RISK: medium
`;

/** The prompt the planner was handed, from the single run worktree. */
async function readPlannerPrompt(dir: string): Promise<string> {
  const base = path.join(dir, "worktrees");
  const entries = await fs.readdir(base);
  for (const e of entries) {
    const body = await fs
      .readFile(path.join(base, e, "planner-prompt.txt"), "utf8")
      .catch(() => null);
    if (body !== null) return body;
  }
  throw new Error(`No planner-prompt.txt under ${base} (saw: ${entries.join(", ")})`);
}

describe("spec-up roadmap path: the approved spec reaches runs launched from its cards", () => {
  let dir: string;

  beforeEach(async () => {
    captured.specs.length = 0;
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-roadmap-handoff-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
    await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
    const fakeJs = path.join(dir, "fake.js");
    await fs.writeFile(fakeJs, FAKE, { mode: 0o755 });
    await fs.chmod(fakeJs, 0o755);
    await setConfigValue(
      dir,
      "providers.fake",
      JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
    );
    await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");

    // A completed spec-up-roadmap run. Its four spec steps are present because
    // approveSpecUpAndStartRoadmap resumes the spec-up run at "executing" and
    // seedResumedSteps copies every upstream step's output.md forward (an
    // upstream resume is strict, so a missing one throws at seed time).
    // Deliberately NO spec-up-approved-spec.md: nothing on this path writes one,
    // which is precisely why deriving the ref from the run store found nothing.
    const store = new ArtifactStore(dir, ROADMAP_RUN);
    await store.init();
    await store.write("00-idea.md", "# Task\n\nmake a mini e-commerce\n");
    await store.write("flows/scope/output.md", `Scope: ${MARKER} a small storefront.`);
    await store.write("flows/spec/output.md", "Spec: checkout via a payment provider.");
    await store.write("flows/architecture/output.md", "Architecture: a single web app.");
    await store.write("flows/risks/output.md", "Risks: handling card data.");
    await store.write("flows/synthesize/output.md", SYNTHESIS);
  });

  it("createRoadmapProposal writes the approved spec beside the proposal", async () => {
    const { proposalId } = await createRoadmapProposal({ projectRoot: dir, runId: ROADMAP_RUN });
    expect(proposalId).toBe(PROPOSAL_ID);

    const specDoc = await fs.readFile(
      path.join(dir, ".vibestrate", "roadmap", "proposals", "specs", `${PROPOSAL_ID}.md`),
      "utf8",
    );
    expect(specDoc).toContain(MARKER);
    expect(specDoc).toContain("# Scope");
    expect(specDoc).toContain("# Spec");
    expect(specDoc).toContain("# Architecture");
    expect(specDoc).toContain("# Risks");
  });

  it("the spec is not written into the run, where that name means 'frozen'", async () => {
    await createRoadmapProposal({ projectRoot: dir, runId: ROADMAP_RUN });
    // `spec-up-artifact-edit` reads this exact path in a run store as the
    // already-approved flag. Storing the spec there would freeze the run's
    // sections as a side effect of picking a location.
    const store = new ArtifactStore(dir, ROADMAP_RUN);
    expect(await store.exists("spec-up-approved-spec.md")).toBe(false);
  });

  it("the spec is not itself listed as a proposal by either listing", async () => {
    await createRoadmapProposal({ projectRoot: dir, runId: ROADMAP_RUN });
    const ps = new ProposalService(dir);
    expect((await ps.listProposals()).map((p) => p.id)).toEqual([PROPOSAL_ID]);
    // A second, independent walker over the same directory.
    expect(await new RoadmapStore(dir).listProposalIds()).toEqual([PROPOSAL_ID]);
  });

  it("refuses to create a proposal when the roadmap run carries no spec", async () => {
    const bare = "lone-heron";
    const store = new ArtifactStore(dir, bare);
    await store.init();
    await store.write("flows/synthesize/output.md", SYNTHESIS);
    await expect(
      createRoadmapProposal({ projectRoot: dir, runId: bare }),
    ).rejects.toBeInstanceOf(SpecUpChainError);
  });

  it("accept resolves a real specRef onto every card it creates", async () => {
    await createRoadmapProposal({ projectRoot: dir, runId: ROADMAP_RUN });
    const res = await new ProposalService(dir).accept({ proposalId: PROPOSAL_ID });
    expect(res.createdTaskIds).toHaveLength(2);

    const rs = new RoadmapService(dir);
    for (const id of res.createdTaskIds) {
      const card = await rs.getTask(id);
      // Not merely non-null: the file it names must exist and be the spec.
      expect(card!.specRef, `card ${id} carries no specRef`).not.toBeNull();
      expect(await fs.readFile(path.join(dir, card!.specRef!), "utf8")).toContain(MARKER);
    }
  });

  it("a hand-written proposal has no spec and says so", async () => {
    const ps = new ProposalService(dir);
    await ps.writeProposalText("by-hand", SYNTHESIS);
    const res = await ps.accept({ proposalId: "by-hand" });
    const rs = new RoadmapService(dir);
    for (const id of res.createdTaskIds) {
      expect((await rs.getTask(id))!.specRef).toBeNull();
    }
  });

  it("KEYSTONE (dashboard): a run launched from a card RECEIVES the spec", async () => {
    await createRoadmapProposal({ projectRoot: dir, runId: ROADMAP_RUN });
    const { createdTaskIds } = await new ProposalService(dir).accept({
      proposalId: PROPOSAL_ID,
    });
    const taskId = createdTaskIds[0]!;
    const card = await new RoadmapService(dir).getTask(taskId);

    // Exactly what the board's launch sends: the card's title as the task, the
    // card id linked, and no explicit contextSources.
    await runFromSpec({
      projectRoot: dir,
      task: card!.title,
      runId: "card-launch-dash",
      taskId,
    });

    const prompt = await readPlannerPrompt(dir);
    expect(prompt).toContain("Context - Spec-up: approved spec");
    expect(prompt).toContain(MARKER);
  }, 60_000);

  it("KEYSTONE (cli): `vibe run --task <id>` RECEIVES the spec", async () => {
    await createRoadmapProposal({ projectRoot: dir, runId: ROADMAP_RUN });
    const { createdTaskIds } = await new ProposalService(dir).accept({
      proposalId: PROPOSAL_ID,
    });
    const taskId = createdTaskIds[0]!;
    const card = await new RoadmapService(dir).getTask(taskId);

    expect(await runRunCommand(card!.title, { taskId, cwd: dir })).toBe(0);

    const prompt = await readPlannerPrompt(dir);
    expect(prompt).toContain("Context - Spec-up: approved spec");
    expect(prompt).toContain(MARKER);
  }, 60_000);

  it("a card's own context sources reach the CLI run, not just the dashboard", async () => {
    await createRoadmapProposal({ projectRoot: dir, runId: ROADMAP_RUN });
    const { createdTaskIds } = await new ProposalService(dir).accept({
      proposalId: PROPOSAL_ID,
    });
    const taskId = createdTaskIds[0]!;
    const rs = new RoadmapService(dir);
    await fs.writeFile(path.join(dir, "NOTES.md"), "CARD_ATTACHED_NOTE_51\n");
    const card = await rs.setContextSources(taskId, [
      { kind: "file", ref: "NOTES.md", label: "Owner note" },
    ]);

    expect(await runRunCommand(card.title, { taskId, cwd: dir })).toBe(0);

    const prompt = await readPlannerPrompt(dir);
    expect(prompt).toContain("CARD_ATTACHED_NOTE_51");
    // The spec is additive, so attaching a note does not displace it.
    expect(prompt).toContain(MARKER);
  }, 60_000);
});
