import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { withFileMutex } from "../src/utils/file-mutex.js";

async function mkTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-mutex-"));
}

const lockBody = (over: Record<string, unknown>) =>
  JSON.stringify({ pid: process.pid, host: os.hostname(), token: "peer-token", at: "x", ...over });

async function backdate(file: string, ms: number) {
  const t = new Date(Date.now() - ms);
  await fs.utimes(file, t, t);
}

describe("withFileMutex", () => {
  it("serializes concurrent read-modify-write (no lost updates)", async () => {
    const dir = await mkTmp();
    try {
      const counter = path.join(dir, "counter.txt");
      const lock = path.join(dir, "counter.lock");
      await fs.writeFile(counter, "0");
      const N = 40;
      await Promise.all(
        Array.from({ length: N }, () =>
          withFileMutex(lock, async () => {
            const n = Number(await fs.readFile(counter, "utf8"));
            await new Promise((r) => setTimeout(r, 1)); // widen the race window
            await fs.writeFile(counter, String(n + 1));
          }),
        ),
      );
      expect(Number(await fs.readFile(counter, "utf8"))).toBe(N);
      await expect(fs.stat(lock)).rejects.toThrow(); // released
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("reclaims a lock owned by a DEAD same-host pid", async () => {
    const dir = await mkTmp();
    try {
      const lock = path.join(dir, "x.lock");
      await fs.writeFile(lock, lockBody({ pid: 2147483646 })); // ~never alive
      let ran = false;
      await withFileMutex(lock, async () => { ran = true; }, { timeoutMs: 2000 });
      expect(ran).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("reclaims a FOREIGN-host lock past the mtime ceiling", async () => {
    const dir = await mkTmp();
    try {
      const lock = path.join(dir, "y.lock");
      await fs.writeFile(lock, lockBody({ host: "some-other-host", pid: 999999 }));
      await backdate(lock, 120_000);
      let ran = false;
      await withFileMutex(lock, async () => { ran = true; }, { staleCeilingMs: 60_000, timeoutMs: 2000 });
      expect(ran).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("does NOT steal a live same-host holder even if its mtime is old (the key fix)", async () => {
    const dir = await mkTmp();
    try {
      const lock = path.join(dir, "live.lock");
      // Our own (alive) pid, backdated way past the ceiling. Must NOT be reclaimed.
      await fs.writeFile(lock, lockBody({ pid: process.pid }));
      await backdate(lock, 300_000);
      await expect(
        withFileMutex(lock, async () => undefined, { timeoutMs: 200, staleCeilingMs: 60_000 }),
      ).rejects.toThrow(/Timed out/);
      // The live holder's lock is untouched.
      expect(JSON.parse(await fs.readFile(lock, "utf8")).token).toBe("peer-token");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("release FAILS CLOSED - never unlinks a lock that became a peer's (different nonce)", async () => {
    const dir = await mkTmp();
    try {
      const lock = path.join(dir, "p.lock");
      let peerInstalled = false;
      await withFileMutex(lock, async () => {
        // Simulate a peer reclaiming + re-acquiring with its own nonce while we
        // were inside fn (e.g. after a crash-reclaim of a reused pid).
        await fs.writeFile(lock, lockBody({ token: "the-peer" }));
        peerInstalled = true;
      });
      expect(peerInstalled).toBe(true);
      // Our release must NOT have deleted the peer's lock.
      expect(JSON.parse(await fs.readFile(lock, "utf8")).token).toBe("the-peer");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("times out when a fresh lock is held by this live process (nested)", async () => {
    const dir = await mkTmp();
    try {
      const lock = path.join(dir, "z.lock");
      await withFileMutex(lock, async () => {
        await expect(
          withFileMutex(lock, async () => undefined, { timeoutMs: 150 }),
        ).rejects.toThrow(/Timed out/);
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("releases the lock even when fn throws", async () => {
    const dir = await mkTmp();
    try {
      const lock = path.join(dir, "e.lock");
      await expect(
        withFileMutex(lock, async () => { throw new Error("boom"); }),
      ).rejects.toThrow("boom");
      await expect(fs.stat(lock)).rejects.toThrow(); // released
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
