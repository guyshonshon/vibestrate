import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { readUiLock, writeUiLock, releaseUiLock } from "../src/workspace/ui-lock.js";
import { readProjectRuntime } from "../src/workspace/workspace-runtime.js";

async function mkRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-uil-"));
  await fs.mkdir(path.join(root, ".vibestrate"), { recursive: true });
  return root;
}

describe("ui-lock", () => {
  it("writes and reads back a lock", async () => {
    const root = await mkRoot();
    expect(await readUiLock(root)).toBeNull();
    const written = await writeUiLock(root, { pid: process.pid, port: 4321 });
    expect(written.host).toBe(os.hostname());
    const read = await readUiLock(root);
    expect(read?.pid).toBe(process.pid);
    expect(read?.port).toBe(4321);
  });

  it("release only removes a lock this process owns (unless forced)", async () => {
    const root = await mkRoot();
    await writeUiLock(root, { pid: 999_999, port: 5000 }); // not our pid
    await releaseUiLock(root, { pid: process.pid }); // not the owner → left alone
    expect(await readUiLock(root)).not.toBeNull();
    await releaseUiLock(root, { pid: process.pid, force: true }); // force → gone
    expect(await readUiLock(root)).toBeNull();
  });

  it("readProjectRuntime: alive pid ⇒ running; dead pid ⇒ not running", async () => {
    const root = await mkRoot();
    await writeUiLock(root, { pid: process.pid, port: 6000 });
    const alive = await readProjectRuntime(root);
    expect(alive.running).toBe(true);
    expect(alive.port).toBe(6000);

    // A pid that is almost certainly not alive.
    await writeUiLock(root, { pid: 2_147_483_646, port: 6000 });
    const dead = await readProjectRuntime(root);
    expect(dead.running).toBe(false);
    expect(dead.port).toBe(6000); // port still readable, just not running
  });

  it("no lock ⇒ not running", async () => {
    const root = await mkRoot();
    const rt = await readProjectRuntime(root);
    expect(rt.running).toBe(false);
    expect(rt.port).toBeNull();
  });
});
