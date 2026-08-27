import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { resolveRunRef, resolveRunRefOrReport } from "../src/cli/run-ref.js";

/**
 * Typing part of a run id, or the name you gave it, has to reach the run - and
 * never the wrong one.
 *
 * Ids are timestamped and task-derived, so they are long enough that people
 * copy them wrong or give up. Three references resolve: the id, a `displayName`
 * from `vibe rename`, and a unique prefix. The ORDER between them is the
 * interesting part, and so is the refusal to guess when a reference is
 * ambiguous - picking the newest match would abort someone else's run.
 */
let dir: string;

async function makeRun(id: string, displayName: string | null): Promise<void> {
  await fs.mkdir(path.join(dir, ".vibestrate", "runs", id), { recursive: true });
  await fs.writeFile(
    path.join(dir, ".vibestrate", "runs", id, "state.json"),
    JSON.stringify({
      runId: id,
      task: "t",
      displayName,
      status: "merge_ready",
      projectRoot: dir,
      worktreePath: null,
      branchName: null,
      reviewLoopCount: 0,
      maxReviewLoops: 1,
      abortRequested: false,
      startedAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z",
      finalDecision: null,
      verification: null,
      error: null,
    }),
  );
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-runref-"));
  await makeRun("20260614-125024-alpha", "Nightly");
  await makeRun("20260614-125100-beta", "nightly"); // same name, different case
  await makeRun("20260615-090000-gamma", "Audit pass");
  // Its whole id is a strict prefix of two others: it must stay addressable.
  await makeRun("20260614", null);
  // Named the same as another run's id prefix, to pin the precedence between
  // rule 2 (a name) and rule 3 (a prefix).
  await makeRun("20260701-000000-delta", "20260615");
  // A directory with no state.json is not a run.
  await fs.mkdir(path.join(dir, ".vibestrate", "runs", "20260699-scratch"), { recursive: true });
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const ok = async (ref: string): Promise<string> => {
  const r = await resolveRunRef(dir, ref);
  expect(r.ok, `expected "${ref}" to resolve, got: ${r.ok ? "" : r.reason}`).toBe(true);
  return r.ok ? r.runId : "";
};
const fail = async (ref: string): Promise<{ reason: string; matches: string[] }> => {
  const r = await resolveRunRef(dir, ref);
  expect(r.ok, `expected "${ref}" to fail`).toBe(false);
  return r.ok ? { reason: "", matches: [] } : { reason: r.reason, matches: r.matches ?? [] };
};

describe("resolveRunRef", () => {
  it("returns a full id unchanged", async () => {
    expect(await ok("20260614-125024-alpha")).toBe("20260614-125024-alpha");
  });

  it("resolves a displayName", async () => {
    expect(await ok("Audit pass")).toBe("20260615-090000-gamma");
  });

  it("resolves an unambiguous prefix", async () => {
    expect(await ok("20260615-09")).toBe("20260615-090000-gamma");
  });

  it("prefers an exact id over treating it as a prefix", async () => {
    // "20260614" is BOTH a real run and a prefix of two others. Exact wins, or
    // that run could never be addressed again.
    expect(await ok("20260614")).toBe("20260614");
  });

  it("prefers a name someone set over an accidental prefix match", async () => {
    // "20260615" is delta's displayName AND a prefix of gamma's id. A name was
    // chosen deliberately; a prefix collision is an accident.
    expect(await ok("20260615")).toBe("20260701-000000-delta");
  });

  it("takes the exact-case name over a case-insensitive one", async () => {
    expect(await ok("Nightly")).toBe("20260614-125024-alpha");
    expect(await ok("nightly")).toBe("20260614-125100-beta");
  });

  it("refuses an ambiguous name rather than guessing", async () => {
    // Neither "Nightly" nor "nightly" matches NIGHTLY exactly, so both land in
    // the case-insensitive bucket together.
    const r = await fail("NIGHTLY");
    expect(r.matches).toHaveLength(2);
    expect(r.reason).toContain("ambiguous");
  });

  it("refuses an ambiguous prefix, listing the candidates", async () => {
    const r = await fail("20260614-125");
    expect(r.matches).toHaveLength(2);
    expect(r.reason).toContain("Use more of the id");
  });

  it("ignores a directory that holds no run", async () => {
    expect((await fail("20260699")).reason).toContain("not found");
  });

  it("rejects an empty reference rather than matching everything", async () => {
    expect((await fail("   ")).reason).toContain("No run id given");
  });

  it("is not fooled by a substring that is not a prefix", async () => {
    expect((await fail("125024")).reason).toContain("not found");
  });
});

describe("resolveRunRefOrReport", () => {
  it("gives back the id and writes nothing on success", async () => {
    const out: string[] = [];
    expect(await resolveRunRefOrReport(dir, "20260615-09", (t) => out.push(t))).toBe(
      "20260615-090000-gamma",
    );
    expect(out).toEqual([]);
  });

  it("returns null and prints the candidates when ambiguous", async () => {
    const out: string[] = [];
    expect(await resolveRunRefOrReport(dir, "20260614-125", (t) => out.push(t))).toBeNull();
    // "be more specific" is advice the reader cannot act on without these.
    expect(out.join("")).toContain("20260614-125024-alpha");
    expect(out.join("")).toContain("20260614-125100-beta");
  });
});

describe("the commands you type a run id into resolve it", () => {
  // The ones a person types by hand, from `vibe status` output or memory. The
  // bundles/suggestions/spec-up families take an id copied straight from another
  // command's output, where a prefix buys nothing.
  const HAND_TYPED = [
    "src/cli/commands/pause.ts",
    "src/cli/commands/replay.ts",
    "src/cli/commands/steer.ts",
    "src/cli/commands/path.ts",
    "src/cli/commands/rename.ts",
    "src/cli/commands/logs.ts",
    "src/cli/commands/assurance.ts",
    "src/cli/commands/audit.ts",
    "src/cli/index.ts", // abort
  ];

  it("each resolves the reference instead of using it raw", () => {
    // The CALL, not the name: a substring check passed when the identifier was
    // renamed to `resolveRunRefOrReportX`, which is a test that cannot fail.
    const missing = HAND_TYPED.filter((f) => !/resolveRunRef\w*\s*\(/.test(readFileSync(f, "utf8")));
    expect(
      missing.join("\n"),
      "these take a <runId> but never resolve it, so only a full id works there",
    ).toBe("");
  });

  it("there is exactly one resolver", () => {
    // A second one was very nearly shipped beside this: same name, different
    // file, prefix-only. Two resolvers means two answers to "which run is that".
    let exists = true;
    try {
      readFileSync("src/core/run/run-ref.ts", "utf8");
    } catch {
      exists = false;
    }
    expect(exists, "src/core/run/run-ref.ts duplicates src/cli/run-ref.ts").toBe(false);
  });
});
