import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { execa } from "execa";
import { z } from "zod";
import { startServer, type StartedServer } from "../src/server/server.js";
import { runAssist } from "../src/core/assist/assist-runner.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import { createJsonFieldStreamer } from "../src/supervisor/turn-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// The supervisor turn as a stream, driven through the real route and the real
// provider path with a fake CLI standing in for a model. Never a real CLI.
//
// The properties under test, in the order they cost the most if they regress:
//   - the user's message is on the wire before the model has said anything;
//   - the answer arrives in pieces rather than in one lump at the end;
//   - stopping kills the provider process and records a STOPPED message, so a
//     reopened thread cannot read a half answer as a finished one;
//   - a per-turn effort reaches the spawn and is never written to the profile.

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

/** Both legs of a turn in one script. The router leg is recognised by its own
 *  schema hint rather than by call order, so the fake cannot silently answer the
 *  wrong prompt if the turn's sequence ever changes. */
const FAKE_BOTH_LEGS = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  fs.appendFileSync(path.join(__dirname, 'argv.log'), JSON.stringify(process.argv.slice(2)) + '\\n');
  if (/"intent"/.test(input)) {
    console.log(JSON.stringify({ intent: 'answer', targetId: null, title: '', items: [], echo: '', rationale: '' }));
    return;
  }
  process.stdout.write('{"answer":"Use the ');
  setTimeout(() => {
    process.stdout.write('default flow.","confidence":"high","caveats":[],"usedContext":["project config"],"recommendedActions":[],"proposedManualUpdate":null,"proposedPreference":null}\\n');
  }, 60);
});
`;

/** Same router leg, but the answerer emits a partial answer and then refuses to
 *  finish - the shape a stop has to survive. Records the signal it was killed
 *  with, which is the only honest proof the process really died. */
/** Exits non-zero with a nameable reason, the way a real CLI does when it is
 *  not installed, refuses, or hits a cap. runConsult throws on this. */
const FAKE_FAILING_ANSWERER = `#!/usr/bin/env node
process.stdin.resume();
process.stdin.on('end', () => {
  process.stderr.write('provider refused: quota exhausted\\n');
  process.exit(3);
});
`;

const FAKE_HANGING_ANSWERER = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
process.on('SIGTERM', () => {
  fs.writeFileSync(path.join(__dirname, 'killed.txt'), 'sigterm');
  process.exit(143);
});
let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  if (/"intent"/.test(input)) {
    console.log(JSON.stringify({ intent: 'answer', targetId: null, title: '', items: [], echo: '', rationale: '' }));
    return;
  }
  process.stdout.write('{"answer":"Half of an ');
  setInterval(() => {}, 1000);
});
`;

async function makeProject(
  script: string,
  opts: { canAct?: boolean } = {},
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-supturn-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const fake = path.join(dir, "fake.js");
  await fs.writeFile(fake, script, { mode: 0o755 });
  await fs.chmod(fake, 0o755);
  // Registered under `codex` because effort is only offered where it is really
  // wired, and this is the id whose catalog entry carries effort levels.
  await setConfigValue(
    dir,
    "providers.codex",
    JSON.stringify({ type: "cli", command: "node", args: [fake], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "codex");
  // A default project is in advise mode, where the turn skips the router
  // entirely and makes ONE model call. Opting into "act" is what puts both legs
  // on the wire, which is the shape the streaming order has to hold for.
  if (opts.canAct) {
    // The config refuses "act" without a ceiling, since a chat message can then
    // start a run.
    await setConfigValue(dir, "budget.maxTurnsPerRun", "40");
    await setConfigValue(dir, "supervisorControl.autonomy", "act");
  }
  return dir;
}

type Frame = { event: string; data: Record<string, unknown> };

/** Read `event:`/`data:` frames off a streamed response body. Heartbeat comment
 *  frames carry no data line and are skipped. */
async function* sseFrames(res: Response): AsyncGenerator<Frame> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "";
      let data = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (!data) continue;
      yield { event, data: JSON.parse(data) as Record<string, unknown> };
    }
  }
}

async function openThread(server: StartedServer): Promise<string> {
  const created = await fetch(`${server.url}/api/supervisor/threads`, { method: "POST" });
  return ((await created.json()) as { thread: { id: string } }).thread.id;
}

function postTurn(
  server: StartedServer,
  threadId: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${server.url}/api/supervisor/threads/${threadId}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

type StoredMessage = { role: string; text: string; stopped: boolean };

async function readMessages(
  server: StartedServer,
  threadId: string,
): Promise<StoredMessage[]> {
  const res = await fetch(`${server.url}/api/supervisor/threads/${threadId}`);
  const body = (await res.json()) as { thread: { messages: StoredMessage[] } };
  return body.thread.messages;
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe("createJsonFieldStreamer", () => {
  it("decodes a field that arrives in pieces, escapes and all", () => {
    const take = createJsonFieldStreamer("answer");
    const out = [
      take('{"answer":"line'),
      take("\\"), // an escape split across two chunks must not be half-decoded
      take('none\\"quoted\\" and \\u00e9'),
      take('","confidence":"high"}'),
    ];
    expect(out[1]).toBe("");
    expect(out.join("")).toBe('line\none"quoted" and é');
  });

  it("emits nothing when the field never appears", () => {
    const take = createJsonFieldStreamer("answer");
    expect(take('{"intent":"answer","echo":"hello"}')).toBe("");
  });

  it("stops at the closing quote and ignores the rest", () => {
    const take = createJsonFieldStreamer("answer");
    expect(take('{"answer":"done","caveats":["not this"]}')).toBe("done");
    expect(take('{"answer":"again"}')).toBe("");
  });
});

describe("runAssist under a stop", () => {
  it("does not re-spawn the provider after the call was stopped", async () => {
    // An aborted provider comes back as exitCode -1 instead of throwing, which
    // reads to the retry loop exactly like a failed attempt. Without the abort
    // check that retry launches a second CLI the moment the first is killed -
    // a stop that costs money.
    const project = await makeProject(FAKE_BOTH_LEGS);
    const stop = new AbortController();
    let spawns = 0;

    await expect(
      runAssist({
        projectRoot: project,
        label: "stop-probe",
        instruction: "anything",
        schema: z.object({ ok: z.boolean() }),
        schemaHint: "{}",
        signal: stop.signal,
        runner: async () => {
          spawns += 1;
          stop.abort();
          return {
            exitCode: -1,
            normalized: { responseText: "", metrics: null },
            stderr: "[aborted: provider CLI was killed by vibestrate]",
          };
        },
      }),
    ).rejects.toThrow(/stopped/i);

    expect(spawns, "the default is two attempts; a stop must end at one").toBe(1);
  }, 30_000);
});

describe("POST /api/supervisor/threads/:threadId/turn (streamed)", () => {
  it("puts the user's message on the wire first, then the answer in pieces", async () => {
    const project = await makeProject(FAKE_BOTH_LEGS, { canAct: true });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const threadId = await openThread(server);

    const res = await postTurn(server, threadId, { text: "which flow should I use?" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const frames: Frame[] = [];
    for await (const f of sseFrames(res)) frames.push(f);

    // The user's own message is the first thing said, before any model ran.
    expect(frames[0]!.event).toBe("message");
    expect((frames[0]!.data.message as { role: string; text: string }).role).toBe("user");
    expect((frames[0]!.data.message as { text: string }).text).toBe(
      "which flow should I use?",
    );

    const kinds = frames.map((f) => f.event);
    expect(kinds.indexOf("phase")).toBe(1);
    expect(frames[1]!.data.phase).toBe("routing");
    expect(kinds.indexOf("answer")).toBeGreaterThan(kinds.indexOf("phase"));
    expect(kinds[kinds.length - 1]).toBe("done");

    // Two writes 60ms apart: a turn that only reported at the end would show one
    // slice, and one that showed raw output would leak the JSON wrapper.
    const answers = frames.filter((f) => f.event === "answer").map((f) => f.data.text as string);
    expect(answers.length).toBeGreaterThanOrEqual(2);
    expect(answers[0]).toBe("Use the ");
    expect(answers.join("")).toBe("Use the default flow.");

    // A plain CLI exposes no reasoning, so none is claimed.
    expect(kinds).not.toContain("thinking");

    const done = frames[frames.length - 1]!.data as {
      stopped: boolean;
      message: { role: string; text: string; stopped: boolean };
    };
    expect(done.stopped).toBe(false);
    expect(done.message.role).toBe("supervisor");
    expect(done.message.text).toBe("Use the default flow.");
    expect(done.message.stopped).toBe(false);

    const stored = await readMessages(server, threadId);
    expect(stored.map((m) => m.role)).toEqual(["user", "supervisor"]);
    expect(stored[1]!.stopped).toBe(false);
  }, 30_000);

  it("records why the answerer failed instead of claiming it had nothing to say", async () => {
    // The regression: runConsult ended `.catch(() => null)`, so a provider that
    // refused, was missing, or hit a cap produced a null, empty prose, and the
    // stored message "I had nothing to add." - a considered-sounding non-answer
    // over a failure that had a name and was never shown anywhere.
    const project = await makeProject(FAKE_FAILING_ANSWERER);
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const threadId = await openThread(server);

    const res = await postTurn(server, threadId, { text: "why did that run block?" });
    const frames: Frame[] = [];
    for await (const f of sseFrames(res)) frames.push(f);

    // The failure reaches the client, so the panel can show it rather than
    // rendering a calm answer bubble.
    const errors = frames.filter((f) => f.event === "error");
    expect(errors.length).toBe(1);
    // The REASON has to survive, not just the fact of a failure. Asserting only
    // on the count, or on the "could not answer" prefix, would still pass if the
    // reason were blanked - which is most of what was wrong before.
    expect(String(errors[0]!.data.message)).toContain("quota exhausted");

    const stored = await readMessages(server, threadId);
    expect(stored.map((m) => m.role)).toEqual(["user", "supervisor"]);
    const answer = stored[1]!;

    // It is recorded as a failure, in the durable thread, with a reason.
    expect(answer.text).toMatch(/could not answer/i);
    expect(answer.text).toContain("quota exhausted");
    // And it never passes itself off as a decision not to speak.
    expect(answer.text).not.toMatch(/nothing to add/i);
    expect(answer.text).not.toMatch(/without producing an answer/i);
    // Not a stop: nobody pressed anything.
    expect(answer.stopped).toBe(false);
  }, 30_000);

  it("stops the provider process and records the turn as stopped", async () => {
    const project = await makeProject(FAKE_HANGING_ANSWERER);
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const threadId = await openThread(server);

    const stop = new AbortController();
    const res = await postTurn(server, threadId, { text: "explain the flow" }, stop.signal);
    try {
      for await (const f of sseFrames(res)) {
        // Stop as soon as the answer has genuinely started, which is the moment
        // a user would reach for it.
        if (f.event === "answer") {
          stop.abort();
          break;
        }
      }
    } catch {
      // Aborting mid-read rejects the pending read; that IS the stop.
    }

    // The provider CLI was killed, not merely abandoned.
    const killed = path.join(project, "killed.txt");
    for (let i = 0; i < 100 && !existsSync(killed); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(existsSync(killed), "the provider CLI should have been SIGTERMed").toBe(true);

    let stored: StoredMessage[] = [];
    for (let i = 0; i < 100; i++) {
      stored = await readMessages(server, threadId);
      if (stored.length >= 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(stored.map((m) => m.role)).toEqual(["user", "supervisor"]);
    const answer = stored[1]!;
    expect(answer.stopped).toBe(true);
    // Whatever arrived is kept, but nothing is completed on the model's behalf.
    expect(answer.text).not.toContain("I had nothing to add");
    expect(answer.text.startsWith("Half of an")).toBe(true);
  }, 40_000);

  it("applies a per-turn effort to the spawn without writing it to the profile", async () => {
    const project = await makeProject(FAKE_BOTH_LEGS, { canAct: true });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const threadId = await openThread(server);
    const before = (await loadConfig(project)).config.profiles["claude-balanced"]!.power ?? null;

    const res = await postTurn(server, threadId, { text: "quick answer please", effort: "low" });
    expect(res.status).toBe(200);
    for await (const _f of sseFrames(res)) void _f;

    const argv = await fs.readFile(path.join(project, "argv.log"), "utf8");
    // Both legs run at the requested level - "instant" has to mean the whole turn.
    const spawns = argv.trim().split("\n");
    expect(spawns.length).toBe(2);
    for (const spawn of spawns) {
      expect(spawn).toContain("model_reasoning_effort=low");
    }

    const after = (await loadConfig(project)).config.profiles["claude-balanced"]!.power ?? null;
    expect(after).toBe(before);
  }, 30_000);

  it("refuses an effort the provider does not have, before the stream opens", async () => {
    const project = await makeProject(FAKE_BOTH_LEGS);
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const threadId = await openThread(server);

    const unknown = await postTurn(server, threadId, { text: "hi", effort: "turbo" });
    expect(unknown.status).toBe(400);
    expect(unknown.headers.get("content-type")).toContain("application/json");

    const malformed = await postTurn(server, threadId, { text: "hi", effort: "LOW; rm -rf /" });
    expect(malformed.status).toBe(400);

    // Nothing ran, so nothing was said.
    expect(await readMessages(server, threadId)).toHaveLength(0);
  }, 30_000);
});
