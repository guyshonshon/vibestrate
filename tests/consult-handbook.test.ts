// The handbook is the *product* half of consult's context: Vibestrate's own
// docs, compiled into the bundle and retrieved deterministically. These tests
// pin the three properties the feature is worth nothing without: it is
// reproducible, it is bounded, and it stays SILENT on questions that are not
// about Vibestrate.
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { assembleConsultContext } from "../src/consult/consult-context.js";
import {
  retrieveHandbook,
  renderHandbookSection,
  productTerms,
  HANDBOOK_SECTION_MAX_BYTES,
  HANDBOOK_MAX_ENTRIES,
} from "../src/consult/handbook/handbook-retrieval.js";
import { HANDBOOK_CORPUS } from "../src/consult/handbook/handbook-corpus.generated.js";
import {
  compileHandbook,
  distillMarkdown,
  fitFencedTree,
  HANDBOOK_BODY_MAX_BYTES,
  HANDBOOK_BODY_MIN_BYTES,
  HANDBOOK_SCHEMA_VERSION,
} from "../src/consult/handbook/handbook-compile.js";
import { readHandbookSources } from "../src/consult/handbook/handbook-sources.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

const ids = (question: string): string[] =>
  retrieveHandbook(question, { surface: "cli" }).map((h) => h.entry.id);

describe("handbook corpus", () => {
  it("is compiled from the real docs and has not drifted", async () => {
    // The corpus is derived, never hand-authored. If someone edits a page under
    // docs/content/ (or regenerates docs/generated/) without re-running
    // `tsx src/consult/handbook/build-handbook.ts`, this fails - which is the
    // only thing stopping the compiled copy from rotting into a second,
    // silently wrong source of truth.
    const recompiled = compileHandbook(await readHandbookSources());
    expect(recompiled).toEqual(HANDBOOK_CORPUS);
  });

  it("declares the schema version the retriever expects", () => {
    expect(HANDBOOK_CORPUS.schemaVersion).toBe(HANDBOOK_SCHEMA_VERSION);
  });

  it("covers the concepts a user asks about", () => {
    const byId = new Set(HANDBOOK_CORPUS.entries.map((e) => e.id));
    for (const id of ["docs/concepts/crew", "docs/concepts/flow", "cli/crew", "config/crews"]) {
      expect(byId.has(id)).toBe(true);
    }
  });
});

describe("handbook retrieval is deterministic", () => {
  it("returns the same entries, in the same order, for the same question", () => {
    const question = "how do I make a crew and attach a role to a seat";
    const first = retrieveHandbook(question, { surface: "cli" });
    for (let i = 0; i < 5; i += 1) {
      const again = retrieveHandbook(question, { surface: "cli" });
      expect(again.map((h) => `${h.entry.id}:${h.score}`)).toEqual(
        first.map((h) => `${h.entry.id}:${h.score}`),
      );
    }
    // The rendered prompt section is what actually reaches the model, so pin
    // that byte-for-byte too, not just the ranking behind it.
    expect(renderHandbookSection(retrieveHandbook(question, { surface: "cli" }))).toBe(
      renderHandbookSection(first),
    );
  });

  it("breaks score ties by id, so equal-scoring pages never swap places", () => {
    const hits = retrieveHandbook("how do I make a crew", { surface: "cli" });
    for (let i = 1; i < hits.length; i += 1) {
      const prev = hits[i - 1]!;
      const cur = hits[i]!;
      expect(prev.score >= cur.score).toBe(true);
      if (prev.score === cur.score) expect(prev.entry.id < cur.entry.id).toBe(true);
    }
  });
});

describe("handbook retrieval is relevant", () => {
  it("answers a product question from the matching pages", () => {
    const hits = ids("how do I make a crew");
    expect(hits).toContain("docs/concepts/crew");
    expect(hits).toContain("cli/crew");
  });

  it.each([
    ["what is a seat", "docs/concepts/seat"],
    ["how do I add a provider", "docs/concepts/provider"],
    ["what does spec-up do", "docs/concepts/spec-up"],
    ["how do I approve a gate", "cli/approvals"],
    ["how do I pause a run", "cli/pause"],
    ["does it work on Windows", "docs/getting-started/windows"],
  ])("%s -> %s", (question, expected) => {
    expect(ids(question)).toContain(expected);
  });

  // The owner's stated goal: it must not "accidentally look up other tools that
  // are irrelevant". Two layers stop that, and each is asserted separately.
  //
  // Layer 1 - the question names none of Vibestrate's vocabulary, so retrieval
  // never even starts.
  it.each([
    "why did my React build fail",
    "how do I fix a TypeScript type error in my app",
    "my node server won't start",
    "how do I install lodash with npm",
    "center a div with flexbox",
    "our postgres migration keeps timing out",
    "what is the capital of France",
    "write me a haiku",
  ])("finds no product vocabulary in: %s", (question) => {
    expect(productTerms(question)).toEqual([]);
    expect(retrieveHandbook(question, { surface: "cli" })).toEqual([]);
    expect(renderHandbookSection(retrieveHandbook(question, { surface: "cli" }))).toBeNull();
  });

  // Layer 2 - the question brushes a word Vibestrate happens to use ("model",
  // "test"), but no page scores high enough on it alone. A single glancing hit
  // is exactly where the noise was: "my tests are failing" once matched `vibe
  // editor`, `vibe gateways` and `vibe notifications` because each has a `test`
  // subcommand.
  it.each([
    "what is the best way to structure my Django models",
    "my tests are failing in jest",
    "how do I write a unit test for my reducer",
  ])("stays quiet on an incidental word match: %s", (question) => {
    expect(retrieveHandbook(question, { surface: "cli" })).toEqual([]);
    expect(renderHandbookSection(retrieveHandbook(question, { surface: "cli" }))).toBeNull();
  });

  it("retrieves nothing for an empty question", () => {
    expect(retrieveHandbook("", { surface: "cli" })).toEqual([]);
    expect(retrieveHandbook("   ", { surface: "cli" })).toEqual([]);
  });
});

describe("handbook retrieval is bounded", () => {
  it("never exceeds the section byte cap or the entry cap", () => {
    // Worst case on purpose: a question stuffed with product vocabulary.
    const greedy =
      "crew role seat flow workflow provider profile policy run task skill supervisor worktree sandbox spec-up approval config policies validation replay ledger annotation";
    const hits = retrieveHandbook(greedy, { surface: "cli" });
    expect(hits.length).toBeLessThanOrEqual(HANDBOOK_MAX_ENTRIES);
    const section = renderHandbookSection(hits)!;
    expect(Buffer.byteLength(section, "utf8")).toBeLessThanOrEqual(
      HANDBOOK_SECTION_MAX_BYTES + 512, // + the fixed section header
    );
  });

  it("caps every compiled entry, so no single page can dominate", () => {
    for (const entry of HANDBOOK_CORPUS.entries) {
      expect(Buffer.byteLength(entry.body, "utf8")).toBeLessThanOrEqual(HANDBOOK_BODY_MAX_BYTES);
    }
  });
});

// ── The gap that shipped ────────────────────────────────────────────────────
//
// The owner asked consult "how can I make a new flow" and was told to hand-edit
// project.yml, because "the supplied docs do not include ... a concrete vibe
// command for creating a flow". The answer was honest: `cli/flows` retrieved
// FIRST and its body was zero bytes. Eight entries were empty, including
// `cli/policies`, `cli/tasks` and `config/policies`.
//
// The cause was distillMarkdown being handed something that is not a markdown
// page. A generated command tree is one fenced block, so the trimmer scored it
// as a single droppable unit and deleted every row rather than the least useful
// ones, the moment the tree crossed the budget (`vibe flows` is 1447 bytes
// against a 1400 cap).
//
// The tests above pinned determinism, silence and byte caps. None of them
// looked at whether a retrieved entry SAYS anything, so all of them passed.
// These do.

describe("every handbook entry has something to say", () => {
  it("has no empty body", () => {
    const empty = HANDBOOK_CORPUS.entries.filter((e) => e.body.trim() === "").map((e) => e.id);
    expect(empty).toEqual([]);
  });

  it("has no body below the floor where an entry is a defect", () => {
    // An entry renders as `### title` over its body, so a body that is empty or
    // pure scaffolding reaches the model as a heading over nothing - and it
    // displaces a page that had the answer, because the four-entry cap counts
    // it. Below the floor an entry must not be compiled at all.
    const thin = HANDBOOK_CORPUS.entries
      .filter((e) => Buffer.byteLength(e.body, "utf8") < HANDBOOK_BODY_MIN_BYTES)
      .map((e) => `${e.id}:${Buffer.byteLength(e.body, "utf8")}`);
    expect(thin).toEqual([]);
  });

  it("carries at least one line that is not a fence marker", () => {
    // The byte floor alone would pass a body padded with blank lines and
    // backticks. This is the invariant the floor is a cheap proxy for.
    for (const entry of HANDBOOK_CORPUS.entries) {
      const substance = entry.body
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("```") && !l.startsWith("…"));
      expect(substance.length, `${entry.id} has no content line`).toBeGreaterThan(0);
    }
  });
});

describe("distillation never deletes what it was asked to trim", () => {
  it("truncates a single oversized block instead of dropping it", () => {
    // Exactly the shape of a generated CLI body: one fence, over budget. The
    // trimmer used to remove it and return "".
    const oneFence = ["```text", "x".repeat(4000), "```"].join("\n");
    const out = distillMarkdown(oneFence, 200);
    expect(out).not.toBe("");
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(200);
  });

  it("keeps a page that is a lone heading rather than emptying it", () => {
    expect(distillMarkdown("# Only a heading\n", 500).trim()).not.toBe("");
  });

  it("keeps the whole tree when it fits, with no trim marker", () => {
    const rows = [
      { depth: 0, text: "vibe flows - list flows" },
      { depth: 1, text: "  vibe flows draft - draft a flow" },
    ];
    const out = fitFencedTree(rows, "text", 1800);
    expect(out).toContain("vibe flows draft");
    expect(out).not.toContain("trimmed");
    expect(out.startsWith("```text")).toBe(true);
    expect(out.endsWith("```")).toBe(true);
  });

  it("drops the deepest rows first and says so, keeping the root", () => {
    const rows = [
      { depth: 0, text: "vibe tasks - manage tasks" },
      { depth: 1, text: `  vibe tasks run - ${"r".repeat(120)}` },
      { depth: 2, text: `    vibe tasks checklist add - ${"c".repeat(120)}` },
    ];
    const out = fitFencedTree(rows, "text", 220);
    expect(out).toContain("vibe tasks run");
    expect(out).not.toContain("checklist add");
    expect(out).toContain("trimmed");
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(220);
  });

  it("never returns an empty tree, even under an absurd budget", () => {
    const out = fitFencedTree([{ depth: 0, text: "vibe tasks - manage tasks" }], "text", 8);
    expect(out.trim()).not.toBe("");
  });
});

// The end of the chain that failed: not "did the right entry rank first" (it
// always did) but "does the text the model receives contain the command a user
// needs". Asserting on ids or counts is what let an empty body through.
describe("a user asking how to do something gets the real command", () => {
  const section = (question: string): string =>
    renderHandbookSection(retrieveHandbook(question, { surface: "cli" })) ?? "";

  it.each([
    // The owner's question, verbatim in intent. `flows draft` is the supervisor-
    // assisted creation path and `flows import` is how a draft is adopted;
    // neither reached the model before.
    ["how can I make a new flow", ["vibe flows draft", "vibe flows import"]],
    ["how do I make a crew", ["vibe crew draft", "vibe crew presets add"]],
    ["how do I set a policy", ["vibe policies add", "vibe policies draft"]],
    ["how do I run a task", ["vibe run", "vibe tasks run"]],
  ])("%s", (question, commands) => {
    const text = section(question as string);
    expect(text).not.toBe("");
    for (const command of commands as string[]) {
      expect(text, `"${question}" never surfaced \`${command}\``).toContain(command);
    }
  });

  it("does not answer a flow question with an editorless config instruction", () => {
    // The shipped answer told the owner to hand-edit .vibestrate/project.yml
    // because the real command was missing. The command is the fix; this pins
    // that it is present rather than pinning the absence of any config mention.
    const text = section("how can I make a new flow");
    const firstCommand = text.indexOf("vibe flows draft");
    expect(firstCommand).toBeGreaterThan(-1);
  });
});

describe("handbook in the consult context", () => {
  let projectRoot: string;

  beforeAll(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-handbook-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: projectRoot });
    await execa("git", ["config", "user.email", "x@x"], { cwd: projectRoot });
    await execa("git", ["config", "user.name", "x"], { cwd: projectRoot });
    await fs.writeFile(path.join(projectRoot, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: projectRoot });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: projectRoot });
    await applySetup({ options: { projectRoot }, detectionRunner: noProvider });
  }, 60_000);

  it("adds the product section for a product question", async () => {
    const ctx = await assembleConsultContext({
      projectRoot,
      surface: "cli",
      question: "how do I make a crew",
    });
    expect(ctx.text).toContain("Vibestrate product documentation");
    expect(ctx.usedSources.some((s) => s.startsWith("vibestrate docs"))).toBe(true);
  });

  it("leaves the product section out for an unrelated question", async () => {
    const ctx = await assembleConsultContext({
      projectRoot,
      surface: "cli",
      question: "why did my React build fail",
    });
    expect(ctx.text).not.toContain("Vibestrate product documentation");
    expect(ctx.usedSources.some((s) => s.startsWith("vibestrate docs"))).toBe(false);
  });

  it("cannot be shadowed or extended by files in the project", async () => {
    // Builtin Flows ARE shadowable: a project file with the same id wins. The
    // handbook deliberately is not - it is a statically imported module, so
    // there is no path to plant anything in. Prove it by planting files in
    // every plausible location and asserting the retrieved bytes do not move.
    const before = renderHandbookSection(retrieveHandbook("how do I make a crew", { surface: "cli" }));
    for (const dir of ["skills", "handbook", "docs"]) {
      const target = path.join(projectRoot, ".vibestrate", dir);
      await fs.mkdir(target, { recursive: true });
      await fs.writeFile(path.join(target, "crew.md"), "# Crew\n\nSHADOWED-BY-PROJECT\n");
    }
    await fs.mkdir(path.join(projectRoot, "docs", "content", "concepts"), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, "docs", "content", "concepts", "crew.md"),
      "---\ntitle: Crew\n---\n\nSHADOWED-BY-PROJECT\n",
    );

    const after = renderHandbookSection(retrieveHandbook("how do I make a crew", { surface: "cli" }));
    expect(after).toBe(before);
    expect(after).not.toContain("SHADOWED-BY-PROJECT");

    const ctx = await assembleConsultContext({
      projectRoot,
      surface: "cli",
      question: "how do I make a crew",
    });
    expect(ctx.text).not.toContain("SHADOWED-BY-PROJECT");
  });
});
