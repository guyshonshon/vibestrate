import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  SupervisorConversationStore,
  deriveThreadTitle,
} from "../src/supervisor/conversation-store.js";

async function scratch() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-sup-"));
  return { root, store: new SupervisorConversationStore(root) };
}

describe("supervisor threads persist a conversation", () => {
  it("appends messages in order and survives a reread", async () => {
    const { root, store } = await scratch();
    const t = await store.create();
    await store.append(t.id, { role: "user", text: "add a title to the landing page" });
    await store.append(t.id, { role: "supervisor", text: "Added it." });

    const fresh = await new SupervisorConversationStore(root).read(t.id);
    expect(fresh?.messages.map((m) => m.role)).toEqual(["user", "supervisor"]);
    expect(fresh?.messages[0]!.text).toContain("landing page");
  });

  it("titles the thread from the first user message, then leaves it alone", async () => {
    const { store } = await scratch();
    const t = await store.create();
    expect(t.title).toBe("New conversation");
    const after = await store.append(t.id, { role: "user", text: "wire up the pricing page" });
    expect(after.title).toBe("wire up the pricing page");
    const later = await store.append(t.id, { role: "user", text: "actually never mind" });
    expect(later.title, "a later message must not rename the thread").toBe(
      "wire up the pricing page",
    );
  });

  it("does not lose a message when two appends race", async () => {
    // The failure this guards: read-then-write outside a lock lets a concurrent
    // append land between the two and get overwritten. Two open browser tabs is
    // all it takes.
    const { store } = await scratch();
    const t = await store.create();
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        store.append(t.id, { role: "user", text: `message ${i}` }),
      ),
    );
    const final = await store.read(t.id);
    expect(final?.messages).toHaveLength(12);
    const texts = new Set(final!.messages.map((m) => m.text));
    expect(texts.size, "every message must survive").toBe(12);
  });

  it("records what an action touched, including a refusal", async () => {
    const { store } = await scratch();
    const t = await store.create();
    await store.append(t.id, {
      role: "supervisor",
      text: "I could not queue that.",
      action: {
        intent: "run.start",
        summary: "refused to start a run",
        targetKind: "none",
        targetId: null,
        ok: false,
        error: "policy denied",
        undone: false,
      },
    });
    const got = await store.read(t.id);
    // A refused action stays in the thread. Dropping it is how someone believes
    // work was queued that never was.
    expect(got?.messages[0]!.action?.ok).toBe(false);
    expect(got?.messages[0]!.action?.error).toBe("policy denied");
  });

  it("marks an action undone without deleting the history of it", async () => {
    const { store } = await scratch();
    const t = await store.create();
    const withAction = await store.append(t.id, {
      role: "supervisor",
      text: "Added 3 TODOs.",
      action: {
        intent: "checklist.add",
        summary: "added 3 TODOs to Landing page",
        targetKind: "checklist",
        targetId: "task-1",
        ok: true,
        undone: false,
      },
    });
    const id = withAction.messages[0]!.id;
    const after = await store.markActionUndone(t.id, id);
    expect(after?.messages[0]!.action?.undone).toBe(true);
    expect(after?.messages[0]!.action?.summary).toContain("3 TODOs");
  });

  it("lists threads newest first and skips a corrupt file", async () => {
    const { root, store } = await scratch();
    const a = await store.create();
    await store.append(a.id, { role: "user", text: "first" });
    const b = await store.create();
    await store.append(b.id, { role: "user", text: "second" });

    await fs.writeFile(
      path.join(root, ".vibestrate", "supervisor", "threads", "broken.json"),
      "{ not json",
      "utf8",
    );

    const list = await store.list();
    expect(list.map((t) => t.id)).toEqual([b.id, a.id]);
  });

  it("reads a missing thread as absent rather than throwing", async () => {
    const { store } = await scratch();
    expect(await store.read("nope")).toBeNull();
    expect(await store.list()).toEqual([]);
  });
});

describe("thread titles", () => {
  it("collapses whitespace and truncates long briefs", () => {
    expect(deriveThreadTitle("  add   a\n title ")).toBe("add a title");
    expect(deriveThreadTitle("x".repeat(100))).toHaveLength(60);
    expect(deriveThreadTitle("   ")).toBe("New conversation");
  });
});
