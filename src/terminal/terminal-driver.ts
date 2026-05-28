import type {
  TerminalDriver,
  TerminalProcess,
  DriverSpawnOpts,
} from "./terminal-types.js";

/**
 * Factory for the production driver. Dynamically imports `node-pty` so a
 * missing native binding (build toolchain unavailable, unsupported arch)
 * never crashes the rest of Vibestrate — the service surfaces an honest
 * "unavailable" state instead. Cached after first resolution.
 */
let cached: TerminalDriver | null = null;

export async function loadNodePtyDriver(): Promise<TerminalDriver> {
  if (cached) return cached;
  try {
    const mod = await import("node-pty");
    const spawn: (
      file: string,
      args: string[],
      opts: {
        name: string;
        cols: number;
        rows: number;
        cwd: string;
        env: Record<string, string>;
      },
    ) => unknown = (mod as { spawn: typeof spawn }).spawn;
    if (typeof spawn !== "function") {
      cached = unavailable("node-pty loaded but spawn() is missing.");
      return cached;
    }
    cached = {
      available: true,
      unavailableReason: null,
      spawn(input: DriverSpawnOpts): TerminalProcess {
        const term = spawn(input.shell, [], {
          name: "xterm-256color",
          cols: input.cols,
          rows: input.rows,
          cwd: input.cwd,
          env: input.env,
        }) as {
          pid: number;
          write: (s: string) => void;
          resize: (c: number, r: number) => void;
          kill: (sig?: string) => void;
          onData: (cb: (s: string) => void) => { dispose: () => void };
          onExit: (
            cb: (info: { exitCode: number; signal?: number }) => void,
          ) => { dispose: () => void };
        };
        return {
          pid: term.pid,
          write: (data) => term.write(data),
          resize: (c, r) => term.resize(c, r),
          kill: (signal) => term.kill(signal),
          onData: (cb) => {
            const sub = term.onData(cb);
            return () => sub.dispose();
          },
          onExit: (cb) => {
            const sub = term.onExit((info) =>
              cb({ exitCode: info.exitCode, signal: info.signal ?? null }),
            );
            return () => sub.dispose();
          },
        };
      },
    };
    return cached;
  } catch (err) {
    cached = unavailable(
      err instanceof Error
        ? `node-pty did not load: ${err.message}`
        : "node-pty did not load.",
    );
    return cached;
  }
}

function unavailable(reason: string): TerminalDriver {
  return {
    available: false,
    unavailableReason: reason,
    spawn() {
      throw new Error(`Terminal driver unavailable: ${reason}`);
    },
  };
}

/** Reset the cached driver. Only used by tests. */
export function _resetDriverCacheForTests(): void {
  cached = null;
}
