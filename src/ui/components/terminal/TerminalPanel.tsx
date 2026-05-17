import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Lock } from "lucide-react";
import { api, ApiError } from "../../lib/api.js";
import type {
  TerminalAvailability,
  TerminalSession,
} from "../../lib/types.js";

/**
 * Per-run terminal panel. Renders an xterm.js view of a PTY spawned in the
 * run's worktree. Hard rules — these are the same ones the server enforces;
 * the UI is responsible only for never sending a command string over HTTP:
 *
 *   - The terminal does NOT exist until the user clicks "Open terminal".
 *   - The browser only sends keystrokes (and a JSON {type:"resize"} control
 *     frame) over a WebSocket to an already-created PTY.
 *   - The xterm instance does NOT prefill or auto-run anything.
 *   - No transcript is persisted; closing the panel kills the PTY.
 *   - When the policy is off or node-pty is missing, we render a disabled
 *     state with the reason the server gave us — no UI workaround.
 */
export function TerminalPanel({ runId }: { runId: string }) {
  const [availability, setAvailability] = useState<TerminalAvailability | null>(
    null,
  );
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getTerminalAvailability()
      .then((r) => {
        if (!cancelled) setAvailability(r);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Spin xterm up when a session exists.
  useEffect(() => {
    if (!session || !hostRef.current) return;
    const term = new Terminal({
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
      fontSize: 12.5,
      theme: {
        background: "#0b0e13",
        foreground: "#cfd8e3",
        cursor: "#cfd8e3",
      },
      cursorBlink: true,
      scrollback: 2000,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const wsUrl = wsUrlFor(session.id);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      // JSON control frames vs raw output. A safety guard: only parse
      // strings that look like JSON. PTY bytes never start with "{" + a
      // matching keyword unless something weird is happening — and even
      // then we just ignore mis-parsed control frames.
      if (ev.data.length > 1 && ev.data[0] === "{") {
        try {
          const parsed = JSON.parse(ev.data) as {
            type?: string;
            exitCode?: number;
            message?: string;
          };
          if (parsed && parsed.type === "exit") {
            term.write(`\r\n[2m[pty exited: ${parsed.exitCode}][0m\r\n`);
            return;
          }
          if (parsed && parsed.type === "error") {
            term.write(`\r\n[31m[error: ${parsed.message}][0m\r\n`);
            return;
          }
        } catch {
          // not JSON — fall through
        }
      }
      term.write(ev.data);
    };
    ws.onclose = () => {
      term.write(`\r\n[2m[disconnected][0m\r\n`);
    };
    ws.onerror = () => {
      setError("WebSocket error while attaching terminal.");
    };

    // Keystrokes → PTY stdin. Plain text only; the server treats anything
    // that isn't an explicit JSON control frame as keystrokes.
    const onData = term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });

    // Resize on container changes.
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        const cols = term.cols;
        const rows = term.rows;
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      } catch {
        // ignore
      }
    });
    if (hostRef.current) ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      onData.dispose();
      try {
        ws.close();
      } catch {
        // ignore
      }
      try {
        term.dispose();
      } catch {
        // ignore
      }
      termRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
  }, [session]);

  async function startSession() {
    if (!availability || !availability.policyEnabled || !availability.driverAvailable)
      return;
    setCreating(true);
    setError(null);
    try {
      const cols = 80;
      const rows = 24;
      const s = await api.createTerminalSession({ runId, cols, rows });
      setSession(s);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setCreating(false);
    }
  }

  async function closeSession() {
    if (!session) return;
    try {
      await api.closeTerminalSession(session.id);
    } catch {
      // best-effort
    }
    setSession(null);
  }

  if (error)
    return (
      <div className="rounded border border-amaco-fail/40 bg-amaco-fail/10 px-2 py-1 text-amaco-fail text-[11.5px]">
        {error}
      </div>
    );

  if (!availability)
    return (
      <div className="text-amaco-fg-muted text-[11.5px]">
        Checking terminal availability…
      </div>
    );

  if (!availability.policyEnabled || !availability.driverAvailable) {
    // Calm info tone — this is the intended-off state, not an error.
    return (
      <div
        role="note"
        className="flex items-start gap-2 rounded border border-amaco-border bg-amaco-panel-2/40 p-3 text-[11.5px]"
      >
        <Lock
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amaco-fg-muted"
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="space-y-1">
          <p className="text-amaco-fg">
            Interactive terminal is off for this project
          </p>
          <p className="text-amaco-fg-muted">
            {availability.reason ?? "Terminal feature unavailable."}
          </p>
          {!availability.policyEnabled ? (
            <p className="text-amaco-fg-muted">
              Set{" "}
              <code className="amaco-mono rounded bg-amaco-panel px-1">
                policies.allowInteractiveTerminal: true
              </code>{" "}
              in{" "}
              <code className="amaco-mono rounded bg-amaco-panel px-1">
                .amaco/project.yml
              </code>{" "}
              to enable. amaco never opens a shell unless this is explicitly on.
            </p>
          ) : !availability.driverAvailable ? (
            <p className="text-amaco-fg-muted">
              The optional{" "}
              <code className="amaco-mono rounded bg-amaco-panel px-1">
                node-pty
              </code>{" "}
              native module isn't installed in this environment, so PTYs can't
              be spawned. Install it (or skip the terminal feature) and restart{" "}
              <code className="amaco-mono rounded bg-amaco-panel px-1">
                amaco ui
              </code>
              .
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-2 text-[11.5px]">
        <p className="text-amaco-fg-muted">
          Open an interactive shell inside this run's worktree. The session
          runs locally on your machine, scoped to the worktree directory.
          Closing the panel or this run kills the shell. No transcript is
          recorded.
        </p>
        <button
          type="button"
          onClick={() => void startSession()}
          disabled={creating}
          className="rounded border border-amaco-accent/40 bg-amaco-accent-soft/30 px-2 py-1 text-amaco-fg hover:bg-amaco-accent-soft/50 disabled:opacity-60"
        >
          {creating ? "Opening…" : "Open terminal in this worktree"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-amaco-fg-muted">
        <span className="amaco-mono truncate">
          {session.shell} · {session.cwd}
        </span>
        <button
          type="button"
          onClick={() => void closeSession()}
          className="rounded border border-amaco-border px-2 py-0.5 text-amaco-fg-dim hover:bg-amaco-panel-2"
        >
          Close
        </button>
      </div>
      <div
        ref={hostRef}
        className="flex-1 overflow-hidden rounded border border-amaco-border bg-[#0b0e13]"
        style={{ minHeight: 240 }}
      />
    </div>
  );
}

function wsUrlFor(sessionId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/terminal/sessions/${encodeURIComponent(sessionId)}/ws`;
}
