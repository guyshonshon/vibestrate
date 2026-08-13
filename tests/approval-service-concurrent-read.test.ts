// A run blocked on a human decision polls approvals.json with NO lock while the
// HTTP route, CLI or shell writes it from another process. If that write is not
// atomic, a poll can land on a truncated file, read as "no approvals", and
// `waitForResolution` fails the run with "disappeared from approvals.json" - over
// a decision that was being recorded at that exact instant.
//
// Named after the invariant, not the fix: a reader must never observe a state
// where a created approval is absent.

import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { ApprovalService } from "../src/core/run/approval-service.js";

async function tempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-approval-race-"));
  await fs.mkdir(path.join(dir, ".vibestrate", "runs", "r1"), { recursive: true });
  return dir;
}

describe("ApprovalService concurrent reads", () => {
  it("never reads an approval as missing while it is being rewritten", async () => {
    const projectRoot = await tempProject();
    const svc = new ApprovalService(projectRoot, "r1");

    // A realistic file, not a single entry: a bigger payload takes longer to
    // write, which is what opens the window a reader can fall into. One entry
    // can land in a single write() and hide the bug entirely.
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      const a = await svc.create({
        stageId: `stage-${i}`,
        roleId: "reviewer",
        reason: `decision ${i} on a change that touches the auth boundary`,
        prompt: null,
        sourceArtifactPath: null,
        requestedAction: null,
      });
      ids.push(a.id);
    }
    const watched = ids[0]!;

    // Hammer: rewrite the whole file repeatedly while reading the first entry.
    // The reader takes no lock, exactly as waitForResolution's poll does.
    let stop = false;
    const writer = (async () => {
      for (let i = 0; i < 60 && !stop; i++) {
        const all = await svc.readAll();
        await svc.writeAll(all);
      }
    })();

    const misses: string[] = [];
    const reader = (async () => {
      for (let i = 0; i < 400; i++) {
        const seen = await svc.get(watched);
        if (!seen) misses.push(`read ${i} saw no approval`);
      }
    })();

    await Promise.all([reader, writer.then(() => { stop = true; })]);

    expect(misses).toEqual([]);
  });
});
