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
import { compileHandbook, HANDBOOK_SCHEMA_VERSION } from "../src/consult/handbook/handbook-compile.js";
import { readHandbookSources } from "../src/consult/handbook/handbook-sources.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

const ids = (question: string): string[] =>
  retrieveHandbook(question).map((h) => h.entry.id);

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
    const first = retrieveHandbook(question);
    for (let i = 0; i < 5; i += 1) {
      const again = retrieveHandbook(question);
      expect(again.map((h) => `${h.entry.id}:${h.score}`)).toEqual(
        first.map((h) => `${h.entry.id}:${h.score}`),
      );
    }
    // The rendered prompt section is what actually reaches the model, so pin
    // that byte-for-byte too, not just the ranking behind it.
    expect(renderHandbookSection(retrieveHandbook(question))).toBe(
      renderHandbookSection(first),
    );
  });

  it("breaks score ties by id, so equal-scoring pages never swap places", () => {
    const hits = retrieveHandbook("how do I make a crew");
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
    expect(retrieveHandbook(question)).toEqual([]);
    expect(renderHandbookSection(retrieveHandbook(question))).toBeNull();
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
    expect(retrieveHandbook(question)).toEqual([]);
    expect(renderHandbookSection(retrieveHandbook(question))).toBeNull();
  });

  it("retrieves nothing for an empty question", () => {
    expect(retrieveHandbook("")).toEqual([]);
    expect(retrieveHandbook("   ")).toEqual([]);
  });
});

describe("handbook retrieval is bounded", () => {
  it("never exceeds the section byte cap or the entry cap", () => {
    // Worst case on purpose: a question stuffed with product vocabulary.
    const greedy =
      "crew role seat flow workflow provider profile policy run task skill supervisor worktree sandbox spec-up approval config policies validation replay ledger annotation";
    const hits = retrieveHandbook(greedy);
    expect(hits.length).toBeLessThanOrEqual(HANDBOOK_MAX_ENTRIES);
    const section = renderHandbookSection(hits)!;
    expect(Buffer.byteLength(section, "utf8")).toBeLessThanOrEqual(
      HANDBOOK_SECTION_MAX_BYTES + 512, // + the fixed section header
    );
  });

  it("caps every compiled entry, so no single page can dominate", () => {
    for (const entry of HANDBOOK_CORPUS.entries) {
      expect(Buffer.byteLength(entry.body, "utf8")).toBeLessThanOrEqual(1800);
    }
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
    const ctx = await assembleConsultContext({ projectRoot, question: "how do I make a crew" });
    expect(ctx.text).toContain("Vibestrate product documentation");
    expect(ctx.usedSources.some((s) => s.startsWith("vibestrate docs"))).toBe(true);
  });

  it("leaves the product section out for an unrelated question", async () => {
    const ctx = await assembleConsultContext({
      projectRoot,
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
    const before = renderHandbookSection(retrieveHandbook("how do I make a crew"));
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

    const after = renderHandbookSection(retrieveHandbook("how do I make a crew"));
    expect(after).toBe(before);
    expect(after).not.toContain("SHADOWED-BY-PROJECT");

    const ctx = await assembleConsultContext({ projectRoot, question: "how do I make a crew" });
    expect(ctx.text).not.toContain("SHADOWED-BY-PROJECT");
  });
});
