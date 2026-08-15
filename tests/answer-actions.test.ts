import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  ANSWER_ACTIONS_MAX,
  ANSWER_ACTION_LABEL_MAX,
  ANSWER_ACTION_PROMPT_MAX,
  ANSWER_ACTION_IDS_NONE,
  answerActionSchema,
  answerActionsField,
  parseAnswerActions,
  type AnswerAction,
  type AnswerActionIds,
} from "../src/core/assist/answer-actions.js";
import { SupervisorConversationStore } from "../src/supervisor/conversation-store.js";
import { supervisorThreadPath } from "../src/utils/paths.js";

const IDS: AnswerActionIds = {
  taskIds: ["task-real"],
  runIds: ["run-real"],
  flowIds: ["flow-real"],
  crewIds: ["crew-real"],
  proposalIds: ["proposal-real"],
};

function navigate(route: unknown, label = "Open") {
  return { kind: "navigate", label, route };
}

describe("answer actions: what survives", () => {
  it("parses a parameterless navigate", () => {
    const out = parseAnswerActions([navigate({ kind: "crew-editor", crewId: null }, "New crew")], IDS);
    expect(out).toEqual([
      { kind: "navigate", label: "New crew", route: { kind: "crew-editor", crewId: null } },
    ]);
  });

  it("parses a page that takes nothing at all", () => {
    const out = parseAnswerActions([navigate({ kind: "flows" }, "Pick a flow")], IDS);
    expect(out).toEqual([
      { kind: "navigate", label: "Pick a flow", route: { kind: "flows" } },
    ]);
  });

  it("parses an id-bearing navigate when the server vouched for the id", () => {
    const out = parseAnswerActions([navigate({ kind: "task", taskId: "task-real" })], IDS);
    expect(out[0]).toEqual({
      kind: "navigate",
      label: "Open",
      route: { kind: "task", taskId: "task-real" },
    });
  });

  it("parses a prompt action and gives it no route", () => {
    const out = parseAnswerActions(
      [{ kind: "prompt", label: "Ask about the failure", text: "Why did the review step fail?" }],
      IDS,
    );
    expect(out).toHaveLength(1);
    const action = out[0] as AnswerAction;
    expect(action.kind).toBe("prompt");
    expect(action).not.toHaveProperty("route");
    expect(Object.keys(action).sort()).toEqual(["kind", "label", "text"]);
  });
});

describe("answer actions: a model-authored route is untrusted", () => {
  it("drops an invented route kind", () => {
    expect(parseAnswerActions([navigate({ kind: "billing" }, "Billing")], IDS)).toEqual([]);
  });

  it("drops a route that is a bare URL string", () => {
    expect(parseAnswerActions([navigate("/billing", "Billing")], IDS)).toEqual([]);
    expect(parseAnswerActions([navigate("#/settings", "Settings")], IDS)).toEqual([]);
  });

  it("drops an id the server never handed out", () => {
    expect(parseAnswerActions([navigate({ kind: "task", taskId: "task-invented" })], IDS)).toEqual([]);
    expect(parseAnswerActions([navigate({ kind: "run", runId: "../../etc/passwd" })], IDS)).toEqual([]);
    expect(parseAnswerActions([navigate({ kind: "flow", flowId: "flow-invented" })], IDS)).toEqual([]);
  });

  it("drops every id-bearing route when no ids are known, and keeps the pages", () => {
    const out = parseAnswerActions(
      [
        navigate({ kind: "task", taskId: "task-real" }, "Task"),
        navigate({ kind: "settings" }, "Settings"),
      ],
      ANSWER_ACTION_IDS_NONE,
    );
    expect(out).toEqual([
      { kind: "navigate", label: "Settings", route: { kind: "settings" } },
    ]);
  });

  it("drops a parameterless kind that arrives carrying parameters", () => {
    expect(parseAnswerActions([navigate({ kind: "settings", runId: "run-real" })], IDS)).toEqual([]);
    expect(parseAnswerActions([navigate({ kind: "flows", flowId: "flow-real" })], IDS)).toEqual([]);
  });

  it("refuses a codebase route that names a file, since no allowlist can vouch for a path", () => {
    expect(
      parseAnswerActions([navigate({ kind: "codebase", filePath: "../../.env", line: 1, runId: null })], IDS),
    ).toEqual([]);
    expect(parseAnswerActions([navigate({ kind: "codebase" }, "Browse code")], IDS)).toEqual([
      {
        kind: "navigate",
        label: "Browse code",
        route: { kind: "codebase", filePath: null, line: null, runId: null },
      },
    ]);
  });

  it("drops a route param outside its closed value set", () => {
    expect(parseAnswerActions([navigate({ kind: "runs", status: "everything" })], IDS)).toEqual([]);
    expect(parseAnswerActions([navigate({ kind: "source", tab: "blame", runId: null })], IDS)).toEqual([]);
    expect(parseAnswerActions([navigate({ kind: "runs", status: "failed" })], IDS)).toHaveLength(1);
  });

  it("drops the legacy route aliases", () => {
    for (const kind of ["git", "git-tree", "merge"]) {
      expect(parseAnswerActions([navigate({ kind })], IDS)).toEqual([]);
    }
  });
});

describe("answer actions: labels and text are text", () => {
  it("refuses an over-long label", () => {
    const label = "x".repeat(ANSWER_ACTION_LABEL_MAX + 1);
    expect(parseAnswerActions([navigate({ kind: "settings" }, label)], IDS)).toEqual([]);
    const atLimit = "x".repeat(ANSWER_ACTION_LABEL_MAX);
    expect(parseAnswerActions([navigate({ kind: "settings" }, atLimit)], IDS)).toHaveLength(1);
  });

  it("refuses a label carrying markup or control characters", () => {
    expect(parseAnswerActions([navigate({ kind: "settings" }, "<b>Open</b>")], IDS)).toEqual([]);
    expect(parseAnswerActions([navigate({ kind: "settings" }, "Open\nSettings")], IDS)).toEqual([]);
    expect(parseAnswerActions([navigate({ kind: "settings" }, "Open\u0007Settings")], IDS)).toEqual([]);
  });

  it("refuses an empty or non-string label", () => {
    expect(parseAnswerActions([navigate({ kind: "settings" }, "   ")], IDS)).toEqual([]);
    expect(parseAnswerActions([{ kind: "navigate", label: 7, route: { kind: "settings" } }], IDS)).toEqual([]);
    expect(parseAnswerActions([{ kind: "navigate", route: { kind: "settings" } }], IDS)).toEqual([]);
  });

  it("refuses an over-long prompt and keeps one at the limit", () => {
    const tooLong = { kind: "prompt", label: "Ask", text: "y".repeat(ANSWER_ACTION_PROMPT_MAX + 1) };
    expect(parseAnswerActions([tooLong], IDS)).toEqual([]);
    const atLimit = { kind: "prompt", label: "Ask", text: "y".repeat(ANSWER_ACTION_PROMPT_MAX) };
    expect(parseAnswerActions([atLimit], IDS)).toHaveLength(1);
  });

  it("keeps newlines in prompt text but refuses other control characters", () => {
    const multiline = parseAnswerActions(
      [{ kind: "prompt", label: "Ask", text: "line one\r\nline two" }],
      IDS,
    );
    expect(multiline[0]).toEqual({ kind: "prompt", label: "Ask", text: "line one\nline two" });
    expect(parseAnswerActions([{ kind: "prompt", label: "Ask", text: "bad\u0007bell" }], IDS)).toEqual([]);
  });

  it("drops a prompt action that also carries a route", () => {
    expect(
      parseAnswerActions(
        [{ kind: "prompt", label: "Ask", text: "hello", route: { kind: "settings" } }],
        IDS,
      ),
    ).toEqual([]);
  });

  it("drops an unknown action kind", () => {
    expect(parseAnswerActions([{ kind: "run_it", label: "Go", text: "go" }], IDS)).toEqual([]);
    expect(parseAnswerActions([{ label: "Go" }], IDS)).toEqual([]);
  });
});

describe("answer actions: the cap holds", () => {
  it("keeps at most the cap, in order", () => {
    const many = Array.from({ length: 12 }, (_, i) => navigate({ kind: "settings" }, `Open ${i}`));
    const out = parseAnswerActions(many, IDS);
    expect(out).toHaveLength(ANSWER_ACTIONS_MAX);
    expect(out.map((a) => a.label)).toEqual(["Open 0", "Open 1", "Open 2", "Open 3"]);
  });

  it("counts only what survived validation", () => {
    const out = parseAnswerActions(
      [
        navigate({ kind: "billing" }, "Bogus one"),
        navigate({ kind: "settings" }, "Real one"),
        navigate({ kind: "task", taskId: "nope" }, "Bogus two"),
        navigate({ kind: "policies" }, "Real two"),
      ],
      IDS,
    );
    expect(out.map((a) => a.label)).toEqual(["Real one", "Real two"]);
  });

  it("returns nothing for a non-array, and never throws", () => {
    expect(parseAnswerActions(null, IDS)).toEqual([]);
    expect(parseAnswerActions("open settings", IDS)).toEqual([]);
    expect(parseAnswerActions({ kind: "navigate" }, IDS)).toEqual([]);
    expect(parseAnswerActions([null, undefined, 3, [], "x"], IDS)).toEqual([]);
  });
});

describe("answer actions: the persisted shape runs the same gate", () => {
  it("accepts a validated action and rejects an invented route", () => {
    expect(
      answerActionSchema.safeParse({
        kind: "navigate",
        label: "Settings",
        route: { kind: "settings" },
      }).success,
    ).toBe(true);
    expect(
      answerActionSchema.safeParse({
        kind: "navigate",
        label: "Billing",
        route: { kind: "billing" },
      }).success,
    ).toBe(false);
  });

  it("degrades a corrupt list to no buttons rather than failing the field", () => {
    expect(answerActionsField.parse(undefined)).toEqual([]);
    expect(answerActionsField.parse([{ kind: "navigate", label: "x", route: { kind: "billing" } }])).toEqual([]);
    const overCap = Array.from({ length: ANSWER_ACTIONS_MAX + 1 }, () => ({
      kind: "navigate",
      label: "Settings",
      route: { kind: "settings" },
    }));
    expect(answerActionsField.parse(overCap)).toEqual([]);
  });
});

describe("answer actions on a supervisor message", () => {
  async function tempProject(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), "answer-actions-"));
  }

  it("round-trips through the conversation store", async () => {
    const root = await tempProject();
    const store = new SupervisorConversationStore(root);
    const thread = await store.create(null);
    await store.append(thread.id, { role: "user", text: "how do I add a crew?" });
    await store.append(thread.id, {
      role: "supervisor",
      text: "Compose one in the crew editor.",
      answerActions: parseAnswerActions(
        [navigate({ kind: "crew-editor", crewId: null }, "New crew")],
        IDS,
      ),
    });

    const read = await store.read(thread.id);
    expect(read?.messages).toHaveLength(2);
    expect(read?.messages[0]?.answerActions).toEqual([]);
    expect(read?.messages[1]?.answerActions).toEqual([
      { kind: "navigate", label: "New crew", route: { kind: "crew-editor", crewId: null } },
    ]);
  });

  it("keeps the message when a hand-edited thread carries a bogus route", async () => {
    const root = await tempProject();
    const store = new SupervisorConversationStore(root);
    const thread = await store.create(null);
    await store.append(thread.id, { role: "supervisor", text: "here you go" });

    const file = supervisorThreadPath(root, thread.id);
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    raw.messages[0].answerActions = [
      { kind: "navigate", label: "Billing", route: { kind: "billing" } },
    ];
    await fs.writeFile(file, JSON.stringify(raw, null, 2));

    const read = await store.read(thread.id);
    expect(read?.messages).toHaveLength(1);
    expect(read?.messages[0]?.text).toBe("here you go");
    expect(read?.messages[0]?.answerActions).toEqual([]);
  });
});
