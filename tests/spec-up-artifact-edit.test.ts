import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { ArtifactStore } from "../src/core/artifact-store.js";
import {
  editSpecUpArtifact,
  specUpArtifactHash,
  SpecUpEditError,
} from "../src/spec-up/spec-up-artifact-edit.js";

const RUN = "brave-otter";

async function setup(opts: { withArtifact?: boolean; approved?: boolean } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-suedit-"));
  const store = new ArtifactStore(root, RUN);
  await store.init();
  if (opts.withArtifact ?? true) {
    await store.write("flows/spec/output.md", "# Spec\n\nThe original spec.\n");
  }
  if (opts.approved) {
    await store.write("spec-up-approved-spec.md", "frozen");
  }
  return { root, store };
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ name: "SpecUpEditError", code });
}

describe("editSpecUpArtifact - happy path", () => {
  it("writes the edited section and returns the new hash", async () => {
    const { root, store } = await setup();
    const r = await editSpecUpArtifact({
      projectRoot: root,
      runId: RUN,
      section: "spec",
      content: "# Spec\n\nThe EDITED spec.\n",
    });
    expect(await store.read("flows/spec/output.md")).toBe("# Spec\n\nThe EDITED spec.\n");
    expect(r.hash).toHaveLength(64);
    // The broker recorded the allow on success.
    const actions = await fs
      .readFile(path.join(store.rootDir, "actions.ndjson"), "utf8")
      .catch(() => "");
    expect(actions).toContain("spec-up-artifact-edit");
  });

  it("normalizes CRLF to LF", async () => {
    const { root, store } = await setup();
    await editSpecUpArtifact({
      projectRoot: root,
      runId: RUN,
      section: "spec",
      content: "line1\r\nline2\r\n",
    });
    expect(await store.read("flows/spec/output.md")).toBe("line1\nline2\n");
  });

  it("baseHash that matches the current content is accepted", async () => {
    const { root } = await setup();
    const base = await specUpArtifactHash(root, RUN, "spec");
    expect(base).not.toBeNull();
    const r = await editSpecUpArtifact({
      projectRoot: root,
      runId: RUN,
      section: "spec",
      content: "updated",
      baseHash: base,
    });
    expect(r.path.endsWith(path.join("flows", "spec", "output.md"))).toBe(true);
  });
});

describe("editSpecUpArtifact - guards (each refusal has a machine code)", () => {
  it("bad-section: a section outside the closed set", async () => {
    const { root } = await setup();
    await expectCode(
      editSpecUpArtifact({ projectRoot: root, runId: RUN, section: "config", content: "x" }),
      "bad-section",
    );
    // A traversal attempt as a "section" is also just a bad section (path never built).
    await expectCode(
      editSpecUpArtifact({ projectRoot: root, runId: RUN, section: "../../etc/passwd", content: "x" }),
      "bad-section",
    );
  });

  it("too-large: content over the byte cap", async () => {
    const { root } = await setup();
    await expectCode(
      editSpecUpArtifact({
        projectRoot: root,
        runId: RUN,
        section: "spec",
        content: "x".repeat(256 * 1024 + 1),
      }),
      "too-large",
    );
  });

  it("already-approved: an approved-spec snapshot exists", async () => {
    const { root } = await setup({ approved: true });
    await expectCode(
      editSpecUpArtifact({ projectRoot: root, runId: RUN, section: "spec", content: "x" }),
      "already-approved",
    );
  });

  it("missing: the section artifact does not exist (not a spec-up run)", async () => {
    const { root } = await setup({ withArtifact: false });
    await expectCode(
      editSpecUpArtifact({ projectRoot: root, runId: RUN, section: "spec", content: "x" }),
      "missing",
    );
  });

  it("secret: refuses secret-shaped content and audits the refusal", async () => {
    const { root, store } = await setup();
    await expectCode(
      editSpecUpArtifact({
        projectRoot: root,
        runId: RUN,
        section: "spec",
        // canonical AWS example access-key id - matches the secret content patterns
        content: "Use the key AKIAIOSFODNN7EXAMPLE for the demo.",
      }),
      "secret",
    );
    // The file is NOT modified.
    expect(await store.read("flows/spec/output.md")).toContain("The original spec.");
    // The refusal is in the audit log.
    const actions = await fs
      .readFile(path.join(store.rootDir, "actions.ndjson"), "utf8")
      .catch(() => "");
    expect(actions).toContain("spec-up.edit.secret");
  });

  it("stale: baseHash mismatch (someone else edited)", async () => {
    const { root } = await setup();
    await expectCode(
      editSpecUpArtifact({
        projectRoot: root,
        runId: RUN,
        section: "spec",
        content: "x",
        baseHash: "deadbeef".repeat(8), // not the real hash
      }),
      "stale",
    );
  });
});
