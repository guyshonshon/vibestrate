import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { creditTrailers } from "../src/git/commit-credit.js";
import { stageAndCommitAll, commitMerge } from "../src/git/git.js";

describe("creditTrailers", () => {
  it("emits a Co-authored-by trailer when enabled (the default identity)", () => {
    expect(
      creditTrailers({
        coAuthor: true,
        coAuthorName: "Vibestrate",
        coAuthorEmail: "noreply@vibestrate.com",
      }),
    ).toEqual({ "Co-authored-by": "Vibestrate <noreply@vibestrate.com>" });
  });

  it("returns no trailer when opted out", () => {
    expect(
      creditTrailers({
        coAuthor: false,
        coAuthorName: "Vibestrate",
        coAuthorEmail: "noreply@vibestrate.com",
      }),
    ).toEqual({});
  });

  it("honors a custom identity and sanitizes line breaks / stray brackets", () => {
    expect(
      creditTrailers({
        coAuthor: true,
        coAuthorName: "My Bot\n",
        coAuthorEmail: "<bot@example.com>",
      }),
    ).toEqual({ "Co-authored-by": "My Bot <bot@example.com>" });
  });
});

async function tempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-credit-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "seed.txt"), "seed");
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  return dir;
}

describe("commit credit reaches real git commits", () => {
  it("stageAndCommitAll stamps the merged credit trailer", async () => {
    const dir = await tempRepo();
    await fs.writeFile(path.join(dir, "a.txt"), "change");
    const committed = await stageAndCommitAll({
      cwd: dir,
      message: "do a thing",
      trailers: {
        "Vibestrate-Run": "run-1",
        ...creditTrailers({
          coAuthor: true,
          coAuthorName: "Vibestrate",
          coAuthorEmail: "noreply@vibestrate.com",
        }),
      },
    });
    expect(committed?.sha).toMatch(/^[0-9a-f]{40}$/);
    const body = (
      await execa("git", ["log", "-1", "--pretty=%B"], { cwd: dir })
    ).stdout;
    expect(body).toContain("Vibestrate-Run: run-1");
    expect(body).toContain("Co-authored-by: Vibestrate <noreply@vibestrate.com>");
  });

  it("commitMerge stamps the credit trailer on an integrator merge", async () => {
    const dir = await tempRepo();
    // A side branch with its own commit, then merge it no-ff into main.
    await execa("git", ["checkout", "-q", "-b", "feature"], { cwd: dir });
    await fs.writeFile(path.join(dir, "f.txt"), "feature");
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "feature work"], { cwd: dir });
    await execa("git", ["checkout", "-q", "main"], { cwd: dir });
    await execa("git", ["merge", "--no-ff", "--no-commit", "feature"], {
      cwd: dir,
      reject: false,
    });
    const merged = await commitMerge(
      dir,
      "integrate: merge feature",
      creditTrailers({
        coAuthor: true,
        coAuthorName: "Vibestrate",
        coAuthorEmail: "noreply@vibestrate.com",
      }),
    );
    expect(merged?.sha).toMatch(/^[0-9a-f]{40}$/);
    const body = (
      await execa("git", ["log", "-1", "--pretty=%B"], { cwd: dir })
    ).stdout;
    expect(body).toContain("Co-authored-by: Vibestrate <noreply@vibestrate.com>");
  });

  it("opt-out leaves no credit trailer", async () => {
    const dir = await tempRepo();
    await fs.writeFile(path.join(dir, "b.txt"), "change");
    await stageAndCommitAll({
      cwd: dir,
      message: "no credit",
      trailers: {
        ...creditTrailers({
          coAuthor: false,
          coAuthorName: "Vibestrate",
          coAuthorEmail: "noreply@vibestrate.com",
        }),
      },
    });
    const body = (
      await execa("git", ["log", "-1", "--pretty=%B"], { cwd: dir })
    ).stdout;
    expect(body).not.toContain("Co-authored-by");
  });
});
