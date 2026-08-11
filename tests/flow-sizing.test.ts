import { describe, it, expect } from "vitest";
import {
  classifyObviousTrivial,
  classifyPlanWorthy,
  SIZER_TARGET_FLOW,
  SPEC_UP_TARGET_FLOW,
} from "../src/supervisor/flow-sizing.js";
import { chooseRunFlow } from "../src/supervisor/select-workflow.js";
import { loadConfig } from "../src/project/config-loader.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execa } from "execa";

describe("classifyObviousTrivial (deterministic tier)", () => {
  it("sizes a short, unremarkable task as trivial", () => {
    expect(classifyObviousTrivial("make a simple test.txt file").trivial).toBe(true);
    expect(classifyObviousTrivial("fix a typo in README.md").trivial).toBe(true);
  });

  it("refuses on sensitive ground, however the task names a file", () => {
    expect(classifyObviousTrivial("tweak src/auth/login.ts").trivial).toBe(false);
    expect(
      classifyObviousTrivial("update README.md and package.json").trivial,
    ).toBe(false);
    expect(classifyObviousTrivial("edit deploy.yml quickly").trivial).toBe(false);
  });

  it("refuses structural work and an empty task", () => {
    expect(classifyObviousTrivial("refactor the scheduler").trivial).toBe(false);
    expect(classifyObviousTrivial("").trivial).toBe(false);
  });

  it("never sizes long/wordy tasks", () => {
    expect(classifyObviousTrivial(`update notes.md ${"and also ".repeat(40)}`).trivial).toBe(false);
  });
});

// ── The sizing table ─────────────────────────────────────────────────────────
//
// The tier's whole job is deciding which of these two columns a sentence lands
// in, so the sentences are the specification. Phrased the way someone describes
// intent rather than implementation, because that is who the tier exists for and
// because the previous rule - "name a file or you are not trivial" - refused
// every task in the left column for that exact reason.
//
// The right column is the one that matters. Each of those three used to size as
// trivial under a refusal list written in engineer vocabulary: none of them says
// "payment", "authorization" or "validation", and all three are dangerous.

const TRIVIAL = [
  "make the font bigger",
  "change the button color to blue",
  "fix the header padding in style.css",
  "add a dark mode toggle to the navbar",
  "update the copy on the landing page",
  "center the logo",
  "fix the broken link in docs/intro.md",
  // Ordinary phrasing that a bare-word vocabulary swallows. Each of these was
  // refused by a real draft of the list: "in order to" hit `order`, "address
  // the spacing" hit `address`, a CSS `reset` read as destructive, and a price
  // TAG is display copy, not money logic. A refusal only costs a heavier flow,
  // so these never fail loudly - they just quietly undo the point of the tier.
  "make the font bigger in order to improve readability",
  "address the spacing issue on the cards",
  "add a css reset",
  "fix the alignment of the price tag",
  // A cross-section of the surface a vibe coder actually asks for. Kept broad
  // rather than minimal: the refusal vocabulary is a keyword list, every term
  // added to it risks swallowing ordinary phrasing, and a false refusal is
  // SILENT - it costs a heavier flow and reports nothing. This block is what
  // makes widening the list fail loudly instead.
  "add a hover effect to the cards",
  "make the footer sticky",
  "round the corners of the images",
  "add a loading skeleton to the list",
  "fix the mobile menu overlap",
  "make the table scroll horizontally",
  "add a tooltip to the info icon",
  "make the modal close when you click outside",
  "add a back to top button",
  "make the cards the same height",
  "show a placeholder when the list is empty",
  "make the nav sticky on scroll",
  "make the timestamps relative",
  "sort the list alphabetically",
  "add a copy to clipboard button",
  "truncate long titles with an ellipsis",
  "add a count next to the tab label",
  "increase the line height in the article body",
];

const NOT_TRIVIAL: [string, string][] = [
  // Product words for sensitive ground.
  ["make the checkout button work", "checkout"],
  ["make the admin page visible to everyone", "admin / visible to everyone"],
  ["add a loading spinner to the login form", "login"],
  ["let users delete their account", "delete / account"],
  ["add a database column for phone numbers", "database / phone"],
  // The qualified forms still bite - narrowing them must not disarm them.
  ["show the user their order history", "order history"],
  ["add a shipping address field", "shipping address"],
  ["reset the database before each run", "reset the database"],
  ["update the checkout price calculation", "checkout"],
  // Broad-access grants, keyed on the grantee. Enumerating verbs loses this
  // race: "allow anyone" was listed and "let anyone" was not, so a sweep found
  // this one sizing as trivial.
  ["let anyone edit the settings page", "anyone"],
  ["let everyone see the internal notes", "everyone"],
  ["let people in without logging in", "without logging in"],
  // Weakening a safeguard - no sensitive noun anywhere in the sentence.
  ["skip the email check for now", "skip"],
  ["just turn off that annoying warning", "turn off"],
  ["hardcode it until we fix it properly", "hardcode"],
  // A build brief is never a tweak, or the sizer and the spec-up trigger would
  // both fire: spec up a whole product, then build it in one express turn.
  ["build a mini ecommerce store", "build-a-system"],
];

describe("the sizing table", () => {
  it.each(TRIVIAL)("sizes to express: %s", (task) => {
    const c = classifyObviousTrivial(task);
    expect(c.trivial, c.reasons.join("; ")).toBe(true);
  });

  it.each(NOT_TRIVIAL)("refuses (%s) because of: %s", (task) => {
    expect(classifyObviousTrivial(task).trivial).toBe(false);
  });

  it("names why it refused, so a surprising refusal is diagnosable", () => {
    expect(classifyObviousTrivial("skip the email check for now").reasons[0]).toContain(
      "weakening",
    );
    expect(classifyObviousTrivial("make the checkout button work").reasons[0]).toContain(
      "checkout",
    );
  });
});

describe("classifyPlanWorthy (the adaptive spec-up trigger)", () => {
  // The corpus the Tier-2 review required: must fire on greenfield/system briefs
  // (the flagship "build a mini ecommerce store" especially) and stay OFF
  // targeted edits / trivial work.
  it("FIRES on greenfield / system-build briefs", () => {
    for (const t of [
      "build a mini ecommerce store",
      "create a SaaS dashboard for analytics",
      "design a CRM system for a small sales team",
      "I want a marketplace from scratch",
      "build a real-time chat feature with websockets and message persistence and presence",
      "make a landing page and a backend API for signups",
    ]) {
      expect(classifyPlanWorthy(t).planWorthy, t).toBe(true);
    }
  });

  it("does NOT fire on targeted edits, trivial work, or non-build asks (bias to execute)", () => {
    for (const t of [
      "add a comment to foo.ts",
      "fix the failing test in auth.ts",
      "add dark mode toggle to the navbar",
      "build a button component",
      "rename getUser to fetchUser",
      "update the readme",
      "implement password reset via email",
      "migrate the database from sqlite to postgres",
      "bump the dependency version",
      // verb+noun collisions that are tweaks, not greenfield builds (Tier-2 #2):
      "make the API faster",
      "build a tool",
      "make the dashboard load faster and also tidy up the header",
    ]) {
      expect(classifyPlanWorthy(t).planWorthy, t).toBe(false);
    }
  });

  it("a named code file always means execute, even with build words", () => {
    expect(classifyPlanWorthy("build a new store module in src/store/index.ts").planWorthy).toBe(false);
  });
});

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(extraYml?: (yml: string) => string): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-sizing-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({ options: { projectRoot: project }, detectionRunner: noProvider });
  if (extraYml) {
    const p = path.join(project, ".vibestrate/project.yml");
    await fs.writeFile(p, extraYml(await fs.readFile(p, "utf8")));
  }
  return project;
}

describe("chooseRunFlow + sizing (A1)", () => {
  it("routes an obvious-trivial task to express, recorded as sized", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "make a simple test.txt file",
      config: loaded.config,
      loaded,
    });
    expect(sel.flowId).toBe(SIZER_TARGET_FLOW);
    expect(sel.source).toBe("sized");
    expect(sel.reasons.join(" ")).toMatch(/diff-decided/);
  });

  it("P1: a plan-worthy brief is marked needsSpecUp but keeps the chosen (default) flow, NOT spec-up-intake", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "build a mini ecommerce store",
      config: loaded.config,
      loaded,
    });
    // Spec-up is now an ORTHOGONAL enrichment: the flow is the chosen/default flow,
    // never replaced by a spec-up flow. The run runs spec-up first, then this flow runs.
    expect(sel.flowId).not.toBe(SPEC_UP_TARGET_FLOW);
    expect(sel.flowId).toBe("default");
    expect(sel.needsSpecUp).toBe(true);
  });

  it("P1 acceptance: --flow express + plan-worthy keeps express AND marks needsSpecUp", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    // The forced-flow short-circuit used to skip the spec-up decision entirely;
    // needsSpecUp is now layered onto every return path, so an explicit flow is
    // honored (never replaced) AND still runs spec-up first when the brief warrants it.
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "build a mini ecommerce store",
      config: loaded.config,
      loaded,
      forcedFlowId: "express",
    });
    expect(sel.flowId).toBe("express");
    expect(sel.source).toBe("forced");
    expect(sel.needsSpecUp).toBe(true);
  });

  it("P1: a well-specified/targeted task skips spec-up (needsSpecUp false)", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "add a comment to src/store/index.ts",
      config: loaded.config,
      loaded,
      forcedFlowId: "express",
    });
    expect(sel.flowId).toBe("express");
    expect(sel.needsSpecUp).toBe(false);
  });

  it("adaptiveSpecUp: off suppresses spec-up entirely", async () => {
    const project = await makeProject((yml) => `${yml}\nadaptiveSpecUp: off\n`);
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "build a mini ecommerce store",
      config: loaded.config,
      loaded,
      forcedFlowId: "express",
    });
    expect(sel.flowId).toBe("express");
    expect(sel.needsSpecUp).toBe(false);
  });

  it("the specUpPhase loop guard suppresses re-entry (a spec-up-phase/executor run)", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "build a mini ecommerce store",
      config: loaded.config,
      loaded,
      forcedFlowId: "express",
      specUpPhase: true,
    });
    expect(sel.flowId).toBe("express");
    expect(sel.needsSpecUp).toBe(false);
  });

  it("a risk-tagged trivial-looking task gets persona-upgraded past express", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "update auth.md with the new authentication secret rotation steps",
      config: loaded.config,
      loaded,
    });
    // Either the persona upgraded it away from express, or sizing refused -
    // both are acceptable; what's forbidden is landing on express via sizing.
    if (sel.flowId === SIZER_TARGET_FLOW) {
      expect(sel.source).not.toBe("sized");
    } else {
      expect(["supervisor-upgraded", "default"]).toContain(sel.source);
    }
  });

  it("flowSizing: off reproduces the default path exactly", async () => {
    const project = await makeProject((yml) => `${yml}\nflowSizing: off\n`);
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "make a simple test.txt file",
      config: loaded.config,
      loaded,
    });
    expect(sel.flowId).toBe("default");
    expect(sel.source).toBe("default");
  });

  it("an explicit defaultFlow always beats sizing", async () => {
    const project = await makeProject((yml) => `${yml}\ndefaultFlow: default\n`);
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "make a simple test.txt file",
      config: loaded.config,
      loaded,
    });
    expect(sel.flowId).toBe("default");
    expect(sel.source).toBe("default");
  });

  it("a forced flow always beats sizing", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "make a simple test.txt file",
      config: loaded.config,
      forcedFlowId: "panel-review",
      loaded,
    });
    expect(sel.flowId).toBe("panel-review");
    expect(sel.source).toBe("forced");
  });
});
