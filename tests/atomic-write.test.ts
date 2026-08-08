import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { writeTextAtomic } from "../src/utils/fs.js";

/**
 * `writeTextAtomic` named its temp file after the pid alone. That is unique
 * across processes and NOT within one, so two concurrent writes to the same
 * path shared a single temp file, interleaved into it, and renamed the mixture
 * over the target. Reachable today: the orchestrator fans review-panel steps out
 * through Promise.allSettled, and each can reach a state write.
 */
describe("writeTextAtomic under same-process concurrency", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-write-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("leaves a complete, parseable file when many writers race on one path", async () => {
    const target = path.join(dir, "state.json");
    // Distinct sizes so a torn result is a mixture of two payloads rather than
    // two identical ones that would hide the bug.
    const payloads = Array.from({ length: 12 }, (_, i) =>
      JSON.stringify({ writer: i, filler: "x".repeat(2000 + i * 500) }),
    );

    await Promise.all(payloads.map((p) => writeTextAtomic(target, p)));

    const finalText = await fs.readFile(target, "utf8");
    // The winner is whichever renamed last, but it must be exactly ONE payload.
    expect(payloads, "final content must be one writer's payload, not a blend").toContain(
      finalText,
    );
    expect(() => JSON.parse(finalText)).not.toThrow();
  });

  it("leaves no temp files behind", async () => {
    const target = path.join(dir, "state.json");
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => writeTextAtomic(target, `payload-${i}`)),
    );
    const left = (await fs.readdir(dir)).filter((f) => f.includes(".tmp."));
    expect(left, `stray temp files: ${left.join(", ")}`).toHaveLength(0);
  });
});
