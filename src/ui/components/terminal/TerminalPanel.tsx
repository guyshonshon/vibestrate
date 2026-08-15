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
import { Button } from "../design/Button.js";
import { Skeleton, SkeletonBlock, SkeletonText } from "../design/Skeleton.js";
import { navigate } from "../../app/App.js";

/**
 * Per-run terminal panel. Renders an xterm.js view of a PTY spawned in the
 * run's worktree. Hard rules - these are the same ones the server enforces;
 * the UI is responsible only for never sending a command string over HTTP:
 *
 *   - The terminal does NOT exist until the user clicks "Open terminal".
 *   - The browser only sends keystrokes (and a JSON {type:"resize"} control
 *     frame) over a WebSocket to an already-created PTY.
 *   - The xterm instance does NOT prefill or auto-run anything.
 *   - No transcript is persisted; closing the panel kills the PTY.
 *   - When the policy is off or node-pty is missing, we render a disabled
 *     state with the reason the server gave us - no UI workaround.
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
      // matching keyword unless something weird is happening - and even
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
          // not JSON - fall through
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
      <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-meta text-rose-300">
        {error}
      </div>
    );

  if (!availability)
    return (
      // Every resolved shape here - the off note, the open-terminal CTA - is a
      // short paragraph over a control, so the bones are that.
      <Skeleton label="Loading the terminal" className="flex flex-col gap-2">
        <SkeletonText lines={3} size={11} gap={8} />
        <SkeletonBlock h={28} w={196} />
      </Skeleton>
    );

  if (!availability.policyEnabled || !availability.driverAvailable) {
    // Calm info tone - this is the intended-off state, not an error.
    return (
      <div
        role="note"
        className="flex items-start gap-2 rounded-[16px] border border-[color:var(--line)] bg-coal-600/40 p-3 text-meta"
      >
        <Lock
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chalk-400"
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="space-y-1">
          <p className="text-chalk-100">
            Interactive terminal is off for this project
          </p>
          <p className="text-chalk-400">
            {availability.reason ?? "Terminal feature unavailable."}
          </p>
          {!availability.policyEnabled ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-chalk-400">
                Off by default - vibestrate never opens a shell unless this is
                explicitly turned on. Enable{" "}
                <code className="rounded-[6px] bg-coal-800 px-1 font-mono text-[12.5px]">
                  Interactive terminal
                </code>{" "}
                under Execution in Policies.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate({ kind: "policies" })}
              >
                Open Policies
              </Button>
            </div>
          ) : !availability.driverAvailable ? (
            <p className="text-chalk-400">
              The optional{" "}
              <code className="rounded-[6px] bg-coal-800 px-1 font-mono text-[12.5px]">
                node-pty
              </code>{" "}
              native module isn't installed in this environment, so PTYs can't
              be spawned. Install it (or skip the terminal feature) and restart{" "}
              <code className="rounded-[6px] bg-coal-800 px-1 font-mono text-[12.5px]">
                vibe ui
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
      <div className="space-y-2 text-meta">
        <p className="text-chalk-400">
          Open an interactive shell inside this run's worktree. The session
          runs locally on your machine, scoped to the worktree directory.
          Closing the panel or this run kills the shell. No transcript is
          recorded.
        </p>
        <Button
          variant="primary"
          size="sm"
          disabled={creating}
          onClick={() => void startSession()}
        >
          {creating ? "Opening…" : "Open terminal in this worktree"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between text-meta text-chalk-400">
        <span className="truncate font-mono text-[12.5px]">
          {session.shell} · {session.cwd}
        </span>
        <Button variant="secondary" size="sm" onClick={() => void closeSession()}>
          Close
        </Button>
      </div>
      <div
        ref={hostRef}
        // bg-[#0b0e13] intentionally matches the xterm `theme.background`
        // above (same terminal colour scheme, not app chrome) so there is no
        // colour flash around the canvas while xterm mounts.
        className="flex-1 overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-[#0b0e13]"
        style={{ minHeight: 240 }}
      />
    </div>
  );
}

function wsUrlFor(sessionId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/terminal/sessions/${encodeURIComponent(sessionId)}/ws`;
}
