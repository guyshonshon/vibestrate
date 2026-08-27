import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { resolveRunRef, RunRefError } from "../src/core/run/run-ref.js";

/**
 * Typing part of a run id has to reach the run, and never the wrong one.
 *
 * Ids are timestamped and task-derived, so they are long enough that people
 * copy them wrong or give up. Prefix matching is the git convention and is
 * purely additive - but a prefix that silently picked the newest match would
 * abort someone else's run, so ambiguity is an error carrying the candidates.
 */
let dir: string;

const RUNS = [
  "20260614-125024-go-through-all-the-things",
  "20260614-125100-go-somewhere-else",
  "20260615-090000-unrelated",
  // Deliberately a strict prefix of the first: an older run must not become
  // unreachable because a longer id exists.
  "20260614",
];

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-runref-"));
  for (const id of RUNS) {
    await fs.mkdir(path.join(dir, ".vibestrate", "runs", id), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".vibestrate", "runs", id, "state.json"),
      JSON.stringify({ runId: id }),
    );
  }
  // A stray directory with no state.json is not a run.
  await fs.mkdir(path.join(dir, ".vibestrate", "runs", "20260699-scratch"), { recursive: true });
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("resolveRunRef", () => {
  it("returns a full id unchanged", async () => {
    await expect(resolveRunRef(dir, RUNS[0]!)).resolves.toBe(RUNS[0]);
  });

  it("resolves an unambiguous prefix", async () => {
    await expect(resolveRunRef(dir, "20260615")).resolves.toBe("20260615-090000-unrelated");
  });

  it("prefers an exact id over treating it as a prefix", async () => {
    // "20260614" is BOTH a real run and a prefix of two others. Exact must win,
    // or that run could never be addressed again.
    await expect(resolveRunRef(dir, "20260614")).resolves.toBe("20260614");
  });

  it("refuses an ambiguous prefix instead of guessing", async () => {
    const err = await resolveRunRef(dir, "20260614-125").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunRefError);
    expect((err as RunRefError).code).toBe("ambiguous");
    // The caller can print the candidates rather than choosing for the user.
    expect((err as RunRefError).matches).toHaveLength(2);
    expect((err as RunRefError).message).toContain("matches 2 runs");
  });

  it("reports a miss as not-found, with the code and not the sentence", async () => {
    const err = await resolveRunRef(dir, "nope").catch((e: unknown) => e);
    expect((err as RunRefError).code).toBe("not-found");
  });

  it("ignores a directory that holds no run", async () => {
    const err = await resolveRunRef(dir, "20260699").catch((e: unknown) => e);
    expect((err as RunRefError).code).toBe("not-found");
  });

  it("rejects an empty reference rather than matching everything", async () => {
    const err = await resolveRunRef(dir, "   ").catch((e: unknown) => e);
    expect((err as RunRefError).code).toBe("not-found");
  });

  it("is not fooled by a substring that is not a prefix", async () => {
    const err = await resolveRunRef(dir, "go-through").catch((e: unknown) => e);
    expect((err as RunRefError).code).toBe("not-found");
  });
});

describe("the commands you type a run id into accept a prefix", () => {
  // The ones a person types by hand, from `vibe status` output or memory.
  // The bundles/suggestions/spec-up families take an id copied straight from
  // another command's output, where a prefix buys nothing.
  const HAND_TYPED = [
    "src/cli/commands/pause.ts",
    "src/cli/commands/replay.ts",
    "src/cli/commands/steer.ts",
    "src/cli/commands/path.ts",
    "src/cli/commands/rename.ts",
    "src/cli/commands/logs.ts",
    "src/cli/index.ts", // abort
  ];

  it("each resolves the reference instead of using it raw", async () => {
    const { readFileSync } = await import("node:fs");
    // The CALL, not the name: a substring check passed when the identifier was
    // renamed to `resolveRunRefOrReportX`, which is a test that cannot fail.
    const missing = HAND_TYPED.filter(
      (f) => !/resolveRunRefOrReport\s*\(/.test(readFileSync(f, "utf8")),
    );
    expect(
      missing.join("\n"),
      "these take a <runId> but never resolve it, so only a full id works there",
    ).toBe("");
  });

  it("says so in the argument help, where the reader is", async () => {
    const { readFileSync } = await import("node:fs");
    const silent = HAND_TYPED.filter((f) => f !== "src/cli/index.ts").filter(
      (f) => !readFileSync(f, "utf8").includes("a unique prefix is enough"),
    );
    expect(silent.join("\n"), "a feature nobody is told about is not a feature").toBe("");
  });
});
