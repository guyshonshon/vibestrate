import { describe, it, expect } from "vitest";
import { preparePr, prBodyFrom, prTitleFrom } from "../src/git/pr-prepare.js";

/**
 * Preparing a pull request, without pushing one.
 *
 * The design decision under test is that Vibestrate stops one step short: it
 * writes everything and hands over the command. Opening a PR requires a push,
 * a push is strictly more irreversible than `git.merge` (which the Action
 * Broker already calls its most irreversible effect), and a confirmation token
 * would ship in `--help` next to a shell the agent already has.
 *
 * So the tests that matter are: does the body tell a reviewer the truth, and
 * does a secret in the outgoing diff stop the whole thing.
 */
const base = {
  runId: "run-1",
  task: "Add retry with backoff to the uploader",
  branch: "vibestrate/run-1",
  base: "main",
  diff: "+ const timeout = 30;\n",
  assurance: null,
  filesTouched: 3,
};

describe("the title", () => {
  it("is the first line of the task", () => {
    expect(prTitleFrom("Add audit logging\n\nmore detail here")).toBe("Add audit logging");
  });

  it("is trimmed rather than allowed to run long", () => {
    const t = prTitleFrom("x".repeat(200));
    expect(t.length).toBeLessThanOrEqual(72);
    expect(t.endsWith("...")).toBe(true);
  });

  it("falls back rather than producing an empty title", () => {
    expect(prTitleFrom("   \n  ")).toBe("Vibestrate change");
  });
});

describe("the body tells a reviewer what they would otherwise have to ask", () => {
  it("says plainly when one model both wrote and reviewed", () => {
    // The single thing this product exists to stop is a self-check presented as
    // review. It must not be softened in the artefact a reviewer reads.
    const body = prBodyFrom({
      runId: "r",
      task: "t",
      filesTouched: 1,
      assurance: {
        verdict: "merge_ready",
        review: { status: "approved", independence: "single-profile" },
      },
    });
    expect(body).toContain("self-check only");
  });

  it("says when the review was independent", () => {
    const body = prBodyFrom({
      runId: "r",
      task: "t",
      filesTouched: 1,
      assurance: {
        verdict: "merge_ready",
        review: { status: "approved", independence: "cross-model" },
      },
    });
    expect(body).toContain("different model");
    expect(body).not.toContain("self-check");
  });

  it("reports which checks actually passed, not just that it is ready", () => {
    const body = prBodyFrom({
      runId: "r",
      task: "t",
      filesTouched: 2,
      assurance: {
        verdict: "merge_ready",
        validation: { status: "passed", passed: 3, total: 3 },
      },
    });
    expect(body).toContain("3/3 passed");
  });

  it("admits when there is no assurance record rather than implying success", () => {
    const body = prBodyFrom({ runId: "r", task: "t", filesTouched: null, assurance: null });
    expect(body).toContain("No assurance record");
  });

  it("names the run it came from", () => {
    expect(prBodyFrom({ runId: "run-xyz", task: "t", filesTouched: null, assurance: null })).toContain(
      "run-xyz",
    );
  });
});

describe("the secret sweep is over the outgoing diff", () => {
  it("passes a clean diff", () => {
    expect(preparePr(base).secretFindings).toEqual([]);
  });

  it("refuses a diff carrying a key the per-turn check is too lenient for", () => {
    // `checkPatchSafety` is deliberately underfit to avoid false-positive patch
    // blocks. That is fine on a local branch and unrecoverable once pushed, so
    // the publish-grade set runs here instead.
    const leaked = ["sk", "-", "A".repeat(32)].join("");
    const out = preparePr({ ...base, diff: `+ const key = "${leaked}";\n` });
    expect(out.secretFindings.length).toBeGreaterThan(0);
    // The finding must not quote the token back in full.
    expect(out.secretFindings.join("\n")).not.toContain(leaked);
  });

  it("catches a JWT, which a per-turn diff check lets through", () => {
    const jwt = `eyJ${"a".repeat(12)}.eyJ${"b".repeat(12)}.${"c".repeat(20)}`;
    expect(preparePr({ ...base, diff: `+ token: ${jwt}\n` }).secretFindings.length).toBeGreaterThan(
      0,
    );
  });
});

describe("the command it hands over", () => {
  it("names the base, the head and the body file - never a push", () => {
    const out = preparePr(base);
    expect(out.command).toContain("--base main");
    expect(out.command).toContain("--head vibestrate/run-1");
    expect(out.command).toContain("--body-file");
    // Vibestrate prepares; the user pushes. Nothing here runs anything.
    expect(out.command.startsWith("gh pr create")).toBe(true);
  });

  it("quotes a title containing shell metacharacters", () => {
    const out = preparePr({ ...base, task: 'Fix $(rm -rf /) "quoting" bug' });
    // JSON.stringify, so the title cannot break out of its argument.
    expect(out.command).toContain('\\"quoting\\"');
    expect(out.title).toContain("$(rm -rf /)");
  });
});
