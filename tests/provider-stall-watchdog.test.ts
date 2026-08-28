// The inactivity watchdog that bounds an unattended run.
//
// profile.timeoutMs defaults to null and nothing else caps a provider turn, so
// a wedged provider CLI used to hang an unattended run forever - breaking the
// one thing --unattended promises ("the run always terminates on its own").
// The watchdog fails the turn on SILENCE, not on elapsed time: a model
// streaming for an hour is working.
//
// Three things have to hold together, and each is pinned below:
//   1. silence trips it and the child's whole process group dies;
//   2. a child that keeps streaming is NEVER killed, however long it runs -
//      the false-positive that would destroy real work;
//   3. the failure arrives as the typed class "stall" through the resilience
//      loop, so onExhausted applies and one terminal event is on the record.

import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { runArgvCommand } from "../src/core/execution/command-runner.js";
import { runProviderResilient } from "../src/core/run-engine/resilient-provider.js";
import {
  resolveStallTimeoutMs,
  DEFAULT_UNATTENDED_STALL_MS,
} from "../src/core/provider-resilience.js";
import { resilienceConfigSchema } from "../src/project/config-schema.js";
import type { ProjectConfig } from "../src/project/config-schema.js";
import type { EventLog } from "../src/core/stores/event-log.js";
import type { RunStateStore } from "../src/core/state-machine.js";

// A provider CLI that reads its prompt and then never says anything, ever -
// the wedge. It also never exits, so anything short of a kill hangs forever.
const SILENT_FOREVER = `#!/usr/bin/env node
process.stdin.resume();
setInterval(() => {}, 1000);
`;

// The counter-example: a CLI that streams steadily. Total runtime is well past
// the stall window; no single gap is. It must survive untouched.
const STREAMS_THEN_EXITS = `#!/usr/bin/env node
let n = 0;
const t = setInterval(() => {
  process.stdout.write(JSON.stringify({ type: "stream_event", n }) + "\\n");
  if (++n >= 8) { clearInterval(t); process.exit(0); }
}, 80);
`;

type Appended = { type: string; message: string; data?: Record<string, unknown> };

function fakeCtx(events: Appended[]): {
  eventLog: EventLog;
  runId: string;
  stateStore: RunStateStore;
} {
  return {
    runId: "run-stall",
    eventLog: {
      append: async (e: Appended) => {
        events.push(e);
      },
    } as unknown as EventLog,
    stateStore: {
      read: async () => null,
    } as unknown as RunStateStore,
  };
}

/** Resilience config with retries off, so the test asserts the give-up path
 *  rather than sitting through a backoff schedule. */
function resilience(
  over: Partial<ProjectConfig["resilience"]> = {},
): ProjectConfig["resilience"] {
  return resilienceConfigSchema.parse({
    enabled: true,
    onExhausted: "fail",
    autoFallback: "off",
    transient: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1, patterns: [] },
    ...over,
  });
}

describe("provider stall watchdog", () => {
  it("tree-kills a child that goes silent and reports a typed stall", async () => {
    const started = Date.now();
    const result = await runArgvCommand({
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"], // never writes, never exits
      cwd: process.cwd(),
      stallTimeoutMs: 300,
    });
    expect(result.termination).toBe("stall");
    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain("stalled");
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("never kills a child that keeps streaming, however long it runs", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-stall-ok-"));
    const script = path.join(dir, "streams.js");
    await fs.writeFile(script, STREAMS_THEN_EXITS, { mode: 0o755 });
    // 8 writes 80ms apart = ~640ms of work, more than twice the 300ms window.
    // Only a watchdog that re-arms on every chunk lets this finish.
    const result = await runArgvCommand({
      command: process.execPath,
      args: [script],
      cwd: dir,
      stallTimeoutMs: 300,
    });
    expect(result.termination).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("stream_event");
  });

  it("fails the turn as the typed class \"stall\" through the resilience loop", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-stall-"));
    const script = path.join(dir, "silent.js");
    await fs.writeFile(script, SILENT_FOREVER, { mode: 0o755 });
    const events: Appended[] = [];

    const result = await runProviderResilient(
      {
        config: {
          resilience: resilience({ stallTimeoutMs: 400 }),
          providers: {
            wedged: {
              type: "claude-code",
              command: process.execPath,
              args: [script],
              input: "stdin",
            },
          },
          profiles: {},
        } as unknown as ProjectConfig,
        unattended: true,
        approvalGateDeps: () => {
          throw new Error("unattended must never reach the approval gate");
        },
      },
      {
        args: {
          providerId: "wedged",
          prompt: "hello",
          cwd: dir,
          projectRoot: dir,
        },
        ctx: fakeCtx(events),
        stageId: "implement",
        abortSignal: new AbortController().signal,
      },
    );

    // The turn ended, and it ended with a code the caller can branch on.
    expect(result.exitCode).toBe(-1);
    expect(result.failure?.class).toBe("stall");
    expect(result.termination).toBe("stall");

    // Exactly one terminal event, carrying the normalized class.
    const terminal = events.filter((e) => e.type === "provider.retries_exhausted");
    expect(terminal).toHaveLength(1);
    expect(terminal[0]!.data?.["class"]).toBe("stall");
    expect(terminal[0]!.data?.["stallTimeoutMs"]).toBe(400);
    expect(terminal[0]!.data?.["stepId"]).toBe("implement");
  }, 20_000);
});

describe("resolveStallTimeoutMs", () => {
  it("is on by default for unattended runs and off for attended ones", () => {
    const auto = resilience(); // stallTimeoutMs: null
    expect(resolveStallTimeoutMs(auto, true)).toBe(DEFAULT_UNATTENDED_STALL_MS);
    expect(resolveStallTimeoutMs(auto, false)).toBe(0);
  });

  it("lets an explicit value win in both directions", () => {
    expect(resolveStallTimeoutMs(resilience({ stallTimeoutMs: 5000 }), false)).toBe(5000);
    // 0 is an explicit opt-out, even unattended - not "unset".
    expect(resolveStallTimeoutMs(resilience({ stallTimeoutMs: 0 }), true)).toBe(0);
  });

  it("treats a missing resilience block as auto", () => {
    expect(resolveStallTimeoutMs(undefined, true)).toBe(DEFAULT_UNATTENDED_STALL_MS);
    expect(resolveStallTimeoutMs(undefined, false)).toBe(0);
  });
});
