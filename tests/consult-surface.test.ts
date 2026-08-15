// The surface is the difference between an answer someone can act on and an
// answer that is merely true. Asked "how can I make a new flow?" from the
// dashboard, consult replied with `vibe config view`, `vibe config view --json`,
// `vibe config show` and "add a flow to .vibestrate/project.yml by hand" - four
// things a reader in a browser cannot do, while the flow editor sat one click
// away.
//
// These tests assert on the ASSEMBLED PROMPT and on the retrieval output, never
// on a hand-fed fixture. A test that hands the retriever its own input proves
// the retriever, not the feature; what matters is what a real caller sends.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { startServer, type StartedServer } from "../src/server/server.js";
import { runConsult, type ConsultSurface } from "../src/consult/consult.js";
import {
  retrieveHandbook,
  isCommandReference,
  asksAboutCommands,
  stripCommandExamples,
} from "../src/consult/handbook/handbook-retrieval.js";
import { renderSurfaceScreens } from "../src/consult/consult-surface.js";
import type { AssistProviderRunner } from "../src/core/assist/assist-runner.js";
import type { ProviderRunInput } from "../src/providers/provider-types.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

/** A `vibe <subcommand>` invocation - the shape the owner objected to seeing in
 *  a browser. Written once so every assertion below means the same thing. */
const VIBE_COMMAND = /\bvibe\s+[a-z][a-z-]*/g;

const OK_ANSWER = JSON.stringify({
  answer: "x",
  confidence: "low",
  caveats: [],
  usedContext: [],
  recommendedActions: [],
  proposedManualUpdate: null,
});

function capturingRunner(sink: { prompt: string }): AssistProviderRunner {
  return async (_p, input: ProviderRunInput) => {
    sink.prompt = input.prompt;
    return { exitCode: 0, normalized: { responseText: OK_ANSWER, metrics: null } };
  };
}

async function makeProject(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

describe("the surface changes what reaches the model", () => {
  let projectRoot: string;
  beforeAll(async () => {
    projectRoot = await makeProject("vibestrate-surface-");
  }, 60_000);

  const promptFor = async (surface: ConsultSurface, question: string): Promise<string> => {
    const sink = { prompt: "" };
    await runConsult({ projectRoot, surface, question, runner: capturingRunner(sink) });
    return sink.prompt;
  };

  it("a dashboard how-do-I question reaches the model with no `vibe` command in it", async () => {
    const prompt = await promptFor("dashboard", "How can I make a new flow?");
    const found = prompt.match(VIBE_COMMAND) ?? [];
    expect(found, `the dashboard prompt recommended: ${found.join(", ")}`).toEqual([]);
  });

  it("the same dashboard question is given the flow editor screen to point at", async () => {
    const prompt = await promptFor("dashboard", "How can I make a new flow?");
    expect(prompt).toContain("Dashboard screens");
    // The ROUTE KIND, not the step's authored title. The kind is checked against
    // the app's Route union at compile time, so it is the stable identity of the
    // screen; a title is copy and rewording it should not break this.
    expect(prompt).toContain("[screen: flow-editor]");
    expect(prompt).toContain("[screen: flows]");
  });

  it("the terminal still gets its commands - the CLI surface is not collateral", async () => {
    const prompt = await promptFor("cli", "How can I make a new flow?");
    expect(prompt).toContain("vibe flows");
    // And it is not handed a screen map it cannot open.
    expect(prompt).not.toContain("Dashboard screens");
  });

  it.each<ConsultSurface>(["dashboard", "cli"])(
    "a question that names a command is answered about the command on %s",
    async (surface) => {
      const prompt = await promptFor(surface, "what does `vibe flows draft` do?");
      expect(prompt).toContain("vibe flows draft");
    },
  );

  it("states the surface rule to the model as well as enforcing it", async () => {
    expect(await promptFor("dashboard", "How can I make a new flow?")).toContain(
      "Do NOT recommend a terminal command",
    );
    expect(await promptFor("cli", "How can I make a new flow?")).toContain(
      "read in a terminal",
    );
  });

  it.each<ConsultSurface>(["dashboard", "cli"])("carries a concrete length budget on %s", async (surface) => {
    const prompt = await promptFor(surface, "How can I make a new flow?");
    expect(prompt).toContain("at most 3 sentences");
    expect(prompt).toContain("Never narrate your own evidence");
  });

  it("names the surface in usedSources so the answer's provenance is honest", async () => {
    const dash = await runConsult({
      projectRoot,
      surface: "dashboard",
      question: "How can I make a new flow?",
      runner: capturingRunner({ prompt: "" }),
    });
    expect(dash.usedSources).toContain("dashboard screens");
    const cli = await runConsult({
      projectRoot,
      surface: "cli",
      question: "How can I make a new flow?",
      runner: capturingRunner({ prompt: "" }),
    });
    expect(cli.usedSources).not.toContain("dashboard screens");
  });
});

describe("retrieval is where the rule is enforced", () => {
  const cmdRefs = (surface: ConsultSurface, q: string): string[] =>
    retrieveHandbook(q, { surface })
      .filter((h) => isCommandReference(h.entry))
      .map((h) => h.entry.id);

  it.each([
    "How can I make a new flow?",
    "how do i make a crew",
    "how do I set a policy",
    "how do I change the default flow",
  ])("drops the command-reference pages on the dashboard: %s", (question) => {
    expect(cmdRefs("dashboard", question)).toEqual([]);
    // The same question keeps them in the terminal, so this is a surface rule
    // and not retrieval quietly getting worse for everyone.
    expect(cmdRefs("cli", question).length).toBeGreaterThan(0);
  });

  it("frees the dropped slot rather than shrinking the answer's evidence", () => {
    const dash = retrieveHandbook("How can I make a new flow?", { surface: "dashboard" });
    const cli = retrieveHandbook("How can I make a new flow?", { surface: "cli" });
    expect(dash.length).toBe(cli.length);
    expect(dash.map((h) => h.entry.id)).not.toEqual(cli.map((h) => h.entry.id));
  });

  it("keeps the command pages when the question names a command", () => {
    expect(cmdRefs("dashboard", "what does `vibe flows draft` do?").length).toBeGreaterThan(0);
    expect(cmdRefs("dashboard", "which command lists my flows").length).toBeGreaterThan(0);
  });

  it("recognises a command question by a real subcommand, not by the word `vibe`", () => {
    expect(asksAboutCommands("what does vibe flows draft do")).toBe(true);
    expect(asksAboutCommands("which CLI command creates a flow")).toBe(true);
    expect(asksAboutCommands("how can I make a new flow?")).toBe(false);
    // `vibe` followed by something that is not a subcommand is prose.
    expect(asksAboutCommands("I like the vibe here")).toBe(false);
  });
});

describe("stripCommandExamples", () => {
  it("removes a fence that is only Vibestrate invocations", () => {
    const out = stripCommandExamples('Run it:\n\n```\nvibe run "fix the thing"\n```\n\nDone.');
    expect(out).not.toContain("vibe run");
    expect(out).toContain("Done.");
  });

  it("keeps a config fence, which is what the dashboard config screen edits", () => {
    const yaml = "```yaml\ndefaultFlow: string | null default: null\n```";
    expect(stripCommandExamples(yaml)).toBe(yaml);
  });

  it("keeps a fence that mixes a command with anything else", () => {
    const mixed = "```\nvibe run x\nnpm test\n```";
    expect(stripCommandExamples(mixed)).toBe(mixed);
  });

  it("leaves an inline command inside a sentence alone", () => {
    // Deleting the span mid-sentence leaves "run  to check", which is worse
    // than the command being there. Enforcement is about what the answer
    // RECOMMENDS, and that is carried by the dropped reference pages, the
    // screen map, and the instruction.
    const prose = "If a run will not start, run `vibe doctor` to check the setup.";
    expect(stripCommandExamples(prose)).toBe(prose);
  });
});

describe("the screen map is derived from the app, not written again", () => {
  it("is dashboard-only and names real route kinds", () => {
    expect(renderSurfaceScreens("cli")).toBeNull();
    const screens = renderSurfaceScreens("dashboard")!;
    for (const kind of ["flow-editor", "crew-editor", "compose", "policies", "providers"]) {
      expect(screens).toContain(kind);
    }
  });
});

// The call sites are the whole point: an enforcement the callers do not opt into
// is decoration. The engine has no runtime seam that can prove which literal a
// given file passes, so this reads the one line in each.
describe("every caller states its real surface", () => {
  it.each([
    ["src/server/routes/consult.ts", "dashboard"],
    ["src/supervisor/turn-service.ts", "dashboard"],
    ["src/cli/commands/consult.ts", "cli"],
  ])("%s passes surface: %s", async (file, expected) => {
    const src = await fs.readFile(path.join(process.cwd(), file), "utf8");
    const literals = [...src.matchAll(/surface:\s*"(dashboard|cli)"/g)].map((m) => m[1]);
    expect(literals).toEqual([expected]);
  });
});

// End to end over the real HTTP route and a real provider process: the fake CLI
// writes the prompt it was handed to disk, so this asserts what the dashboard
// actually sends rather than what the route's source says it sends.
describe("POST /api/consult answers on the dashboard surface", () => {
  let server: StartedServer | null = null;
  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it("sends the screen map and no command reference", async () => {
    const dir = await makeProject("vibestrate-surface-srv-");
    const promptPath = path.join(dir, "seen-prompt.txt");
    await fs.writeFile(
      path.join(dir, "fake.js"),
      `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  require('node:fs').writeFileSync(${JSON.stringify(promptPath)}, i);
  console.log(JSON.stringify({answer:"x",confidence:"low",caveats:[],usedContext:[],recommendedActions:[],proposedManualUpdate:null}));
});
`,
      { mode: 0o755 },
    );
    await setConfigValue(
      dir,
      "providers.fake",
      JSON.stringify({
        type: "cli",
        command: "node",
        args: [path.join(dir, "fake.js")],
        input: "stdin",
      }),
    );
    await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");

    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/consult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "How can I make a new flow?" }),
    });
    expect(res.status).toBe(200);

    const seen = await fs.readFile(promptPath, "utf8");
    expect(seen).toContain("[screen: flow-editor]");
    const found = seen.match(VIBE_COMMAND) ?? [];
    expect(found, `the dashboard route recommended: ${found.join(", ")}`).toEqual([]);
  }, 60_000);

  it("refuses a client that tries to declare its own surface", async () => {
    // The surface decides what reference material the answerer may see, so a
    // client picking its own would let the browser opt back into the terminal
    // instructions this route exists to keep out of it.
    const dir = await makeProject("vibestrate-surface-body-");
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/consult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "How can I make a new flow?", surface: "cli" }),
    });
    expect(res.status).toBe(400);
  }, 60_000);
});
