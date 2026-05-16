// Imperative shell loop: open the alt-screen buffer, raw stdin, then
// poll the on-disk snapshot every second and re-render. Keystrokes
// drive selection + actions. All actions go through the same write
// paths the existing CLI uses (pause-service, abort), so the
// orchestrator picks them up via its normal polling.

import { buildShellSnapshot, type ShellSnapshot } from "./shell-snapshot.js";
import {
  renderShell,
  type ShellUiState,
  type ShellSize,
} from "./shell-render.js";
import { pauseRun, resumeRun, abortRun } from "./shell-actions.js";

const ALT_SCREEN_ENTER = "\x1b[?1049h";
const ALT_SCREEN_LEAVE = "\x1b[?1049l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR = "\x1b[2J\x1b[H";

export type StartShellOptions = {
  projectRoot: string;
  refreshMs?: number;
  /** Used by tests to inject a fake terminal. */
  io?: {
    stdin: NodeJS.ReadStream;
    stdout: NodeJS.WriteStream;
    isRawTty: boolean;
  };
};

export async function runShell(opts: StartShellOptions): Promise<number> {
  const refreshMs = opts.refreshMs ?? 1000;
  const io = opts.io ?? {
    stdin: process.stdin,
    stdout: process.stdout,
    isRawTty:
      process.stdin.isTTY === true &&
      typeof (process.stdin as NodeJS.ReadStream).setRawMode === "function",
  };

  if (!io.isRawTty) {
    io.stdout.write(
      "amaco shell requires an interactive TTY (stdin must be a terminal).\n",
    );
    return 1;
  }

  const ui: ShellUiState = {
    selectedIndex: 0,
    view: "runs",
    toast: null,
    pendingConfirm: null,
  };

  let stopRequested = false;
  let snapshot: ShellSnapshot | null = null;
  let lastFrame: string | null = null;

  const setRawMode = (
    io.stdin as NodeJS.ReadStream & { setRawMode?: (b: boolean) => void }
  ).setRawMode?.bind(io.stdin);

  io.stdout.write(ALT_SCREEN_ENTER + HIDE_CURSOR + CLEAR);
  if (setRawMode) setRawMode(true);
  io.stdin.resume();
  io.stdin.setEncoding("utf8");

  const cleanup = () => {
    if (setRawMode) {
      try {
        setRawMode(false);
      } catch {
        // ignore — stdin may already be closed
      }
    }
    io.stdin.pause();
    io.stdout.write(SHOW_CURSOR + ALT_SCREEN_LEAVE);
  };

  const size = (): ShellSize => ({
    cols: io.stdout.columns ?? 100,
    rows: io.stdout.rows ?? 30,
  });

  const draw = (): void => {
    if (!snapshot) {
      const placeholder = "amaco shell · loading…";
      if (lastFrame !== placeholder) {
        io.stdout.write(CLEAR + placeholder);
        lastFrame = placeholder;
      }
      return;
    }
    const frame = renderShell({ snapshot, ui, size: size() });
    if (frame === lastFrame) return;
    io.stdout.write(CLEAR + frame);
    lastFrame = frame;
  };

  const refresh = async (): Promise<void> => {
    try {
      snapshot = await buildShellSnapshot(opts.projectRoot);
      // Clamp selection if the run list shrank.
      if (ui.selectedIndex >= snapshot.runs.length) {
        ui.selectedIndex = Math.max(0, snapshot.runs.length - 1);
      }
    } catch (err) {
      ui.toast = {
        kind: "err",
        message: `snapshot error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    draw();
  };

  const ticker = setInterval(() => {
    void refresh();
  }, refreshMs);

  // Initial draw immediately so the user doesn't stare at a blank screen.
  await refresh();

  const setToast = (kind: "ok" | "err" | "info", message: string): void => {
    ui.toast = { kind, message };
    // Clear toast after a short delay so it doesn't linger forever.
    setTimeout(() => {
      if (ui.toast && ui.toast.message === message) ui.toast = null;
      draw();
    }, 3000);
  };

  const selectedRunId = (): string | null => {
    if (!snapshot) return null;
    const row = snapshot.runs[ui.selectedIndex];
    return row ? row.runId : null;
  };

  const onKey = async (chunk: string): Promise<void> => {
    if (stopRequested) return;
    if (ui.pendingConfirm?.action === "abort") {
      const runId = ui.pendingConfirm.runId;
      ui.pendingConfirm = null;
      if (chunk === "y" || chunk === "Y") {
        const r = await abortRun(opts.projectRoot, runId);
        setToast(r.ok ? "ok" : "err", r.message);
      } else {
        setToast("info", "abort cancelled.");
      }
      await refresh();
      return;
    }

    // Ctrl+C or 'q' → quit cleanly.
    if (chunk === "" || chunk === "q" || chunk === "Q") {
      stopRequested = true;
      clearInterval(ticker);
      cleanup();
      return;
    }
    if (chunk === "?" ) {
      ui.view = ui.view === "help" ? "runs" : "help";
      draw();
      return;
    }
    if (chunk === "\x1b[A" || chunk === "k") {
      ui.selectedIndex = Math.max(0, ui.selectedIndex - 1);
      draw();
      return;
    }
    if (chunk === "\x1b[B" || chunk === "j") {
      const max = (snapshot?.runs.length ?? 1) - 1;
      ui.selectedIndex = Math.min(Math.max(0, max), ui.selectedIndex + 1);
      draw();
      return;
    }
    if (chunk === "p" || chunk === "P") {
      const id = selectedRunId();
      if (!id) return;
      const r = await pauseRun(opts.projectRoot, id);
      setToast(r.ok ? "ok" : "err", r.message);
      await refresh();
      return;
    }
    if (chunk === "r" || chunk === "R") {
      const id = selectedRunId();
      if (!id) return;
      const r = await resumeRun(opts.projectRoot, id);
      setToast(r.ok ? "ok" : "err", r.message);
      await refresh();
      return;
    }
    if (chunk === "a" || chunk === "A") {
      const id = selectedRunId();
      if (!id) return;
      ui.pendingConfirm = { action: "abort", runId: id };
      draw();
      return;
    }
    if (chunk === "i" || chunk === "I") {
      ui.view = ui.view === "inspector" ? "runs" : "inspector";
      draw();
      return;
    }
  };

  return new Promise<number>((resolve) => {
    const handleData = (chunk: string | Buffer): void => {
      const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      void onKey(s).then(() => {
        if (stopRequested) {
          io.stdin.off("data", handleData);
          resolve(0);
        }
      });
    };
    io.stdin.on("data", handleData);
    process.once("SIGINT", () => {
      stopRequested = true;
      clearInterval(ticker);
      cleanup();
      io.stdin.off("data", handleData);
      resolve(130);
    });
    process.once("SIGTERM", () => {
      stopRequested = true;
      clearInterval(ticker);
      cleanup();
      io.stdin.off("data", handleData);
      resolve(143);
    });
  });
}
