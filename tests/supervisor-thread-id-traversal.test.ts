import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { SupervisorConversationStore } from "../src/supervisor/conversation-store.js";

// The thread id comes off the URL (`/api/supervisor/threads/:threadId/...`) and
// ends up in a `path.join`. Read AND write reach it, so an id that walks out of
// the project would let an HTTP caller write a JSON file anywhere the server
// process can. Validated where it becomes a path, which is the only place it
// does.
describe("supervisor thread ids cannot escape the project", () => {
  const evil = [
    "../../../../tmp/vibestrate-escape",
    "..",
    "a/../../b",
    "sub/dir",
    ".hidden",
    "",
  ];

  it("refuses a traversing id on read", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-thr-"));
    const store = new SupervisorConversationStore(root);
    for (const id of evil) {
      await expect(store.read(id), `read must refuse ${JSON.stringify(id)}`).rejects.toThrow(
        /valid conversation id/,
      );
    }
  });

  it("refuses a traversing id on append, and writes nothing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-thr-"));
    const store = new SupervisorConversationStore(root);
    const target = path.join(os.tmpdir(), "vibestrate-escape.json");
    await fs.rm(target, { force: true });

    await expect(
      store.append("../../../../tmp/vibestrate-escape", { role: "user", text: "hi" }),
    ).rejects.toThrow(/valid conversation id/);

    await expect(fs.access(target), "nothing may be written outside the project").rejects.toThrow();
  });

  it("still accepts the ids it actually mints", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-thr-"));
    const store = new SupervisorConversationStore(root);
    const thread = await store.create(null);
    const again = await store.read(thread.id);
    expect(again?.id).toBe(thread.id);
  });
});
