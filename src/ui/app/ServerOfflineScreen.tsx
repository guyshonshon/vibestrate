import { useEffect, useState } from "react";
import { Power, RefreshCw } from "lucide-react";

/**
 * Poll the server's liveness.
 *
 * Only a NETWORK failure counts as offline. An HTTP error means the server is
 * answering - that is a route or a permission problem and belongs to the panel
 * that made the request, not to a full-screen takeover.
 *
 * A single miss is not offline either: a laptop waking, a rebuild restarting the
 * process, or one dropped request would otherwise blank the whole app. It takes
 * two consecutive failures, and recovery is immediate on the first success.
 */
export function useServerAlive(): boolean {
  const [alive, setAlive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let misses = 0;

    const check = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (cancelled) return;
        // Answering at all - even a 401 or 404 - means the process is up.
        void res;
        misses = 0;
        setAlive(true);
      } catch {
        if (cancelled) return;
        misses += 1;
        if (misses >= 2) setAlive(false);
      }
    };

    void check();
    const id = window.setInterval(check, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return alive;
}

/**
 * What the dashboard shows when its server is gone.
 *
 * The UI is a client for a local process: with that process stopped every panel
 * fails independently and the screen fills with the same network error a dozen
 * times, none of which say the one useful thing - start the app again. This
 * replaces that with a single screen that names the cause and the command.
 */
export function ServerOfflineScreen() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText("vibe ui");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard is a convenience; the command is on screen either way */
    }
  }

  return (
    <div className="font-jakarta flex h-screen w-screen items-center justify-center bg-coal-800 px-6 text-chalk-100">
      <div className="w-full max-w-[560px] overflow-hidden rounded-[22px] border border-[color:var(--line)] bg-coal-600">
        <div className="flex items-start gap-4 px-7 pb-6 pt-7">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-amber-soft/10">
            <Power className="h-5 w-5 text-amber-soft" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">
              Vibestrate isn't running
            </h1>
            <p className="mt-2 text-[14px] leading-[1.55] text-chalk-300">
              This dashboard is a window onto a local Vibestrate process, and that
              process has stopped. Nothing here can load until it is back - your
              runs, tasks and config are on disk and untouched.
            </p>
          </div>
        </div>

        <div className="border-t border-[color:var(--line)] px-7 py-6">
          <p className="mb-2.5 text-[13px] font-semibold text-violet-vivid">
            Start it from your project directory
          </p>
          <div className="flex items-center gap-2 rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-4 py-3">
            <code className="mono min-w-0 flex-1 truncate text-[14px] text-chalk-100">
              vibe ui
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              className="shrink-0 rounded-[9px] px-2.5 py-1.5 text-[13px] font-semibold text-violet-soft transition hover:bg-violet-soft/10"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-[13px] leading-[1.5] text-chalk-300">
            This page reconnects on its own the moment the server answers, so you
            can leave it open.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--line)] bg-coal-500/45 px-7 py-4">
          <span className="text-[13px] text-chalk-300">Already restarted it?</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 rounded-[10px] bg-coal-500 px-3 py-1.5 text-[13px] font-semibold text-chalk-100 transition hover:bg-coal-400"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.9} />
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
