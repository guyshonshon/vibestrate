import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import type { ProviderRow } from "../../lib/api.js";
import { Button } from "../design/Button.js";

/** Pull the backtick-wrapped commands out of an install hint sentence. */
function extractCommands(hint: string | null): string[] {
  if (!hint) return [];
  return (hint.match(/`([^`]+)`/g) ?? []).map((s) => s.slice(1, -1));
}

/**
 * Flowd install for a popular provider. Shows the exact install + login
 * commands to run locally and a re-check - it never runs anything itself
 * (the browser spawns no commands; everything happens in the user's own
 * terminal, on their machine, with their credentials).
 */
export function InstallWizard({
  provider: p,
  onClose,
  onRecheck,
}: {
  provider: ProviderRow;
  onClose: () => void;
  onRecheck: () => Promise<void>;
}) {
  const [rechecking, setRechecking] = useState(false);
  const installCmds = extractCommands(p.installHint);

  async function recheck() {
    setRechecking(true);
    try {
      await onRecheck();
    } finally {
      setRechecking(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 font-jakarta"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-violet-vivid">
              Install - runs on your machine
            </div>
            <h2 className="mt-0.5 text-[18px] font-extrabold tracking-[-0.02em] text-chalk-100">
              {p.label}
            </h2>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            iconLeft={<X size={13} />}
          >
            Close
          </Button>
        </div>

        {p.available ? (
          <div className="mt-4 flex items-start gap-1.5 rounded-[12px] border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-200">
            <Check size={14} className="mt-px shrink-0" />
            <span>
              {p.command} detected{p.version ? ` (v${p.version})` : ""}. Close
              this, then <span className="text-chalk-100">Set up</span> and{" "}
              <span className="text-chalk-100">Test</span>.
            </span>
          </div>
        ) : null}

        <ol className="mt-4 space-y-3.5">
          <li>
            <div className="text-[12.5px] font-medium text-chalk-200">
              1 - Install the CLI
            </div>
            {installCmds.length > 0 ? (
              installCmds.map((c, i) => <CopyLine key={i} cmd={c} />)
            ) : (
              <p className="mt-1 text-[12px] text-chalk-300">
                See {p.label}'s site for install instructions.
              </p>
            )}
          </li>
          <li>
            <div className="text-[12.5px] font-medium text-chalk-200">
              2 - Authenticate
            </div>
            {p.loginCommand ? <CopyLine cmd={p.loginCommand} /> : null}
            <p className="mt-1 text-[11.5px] text-chalk-400">{p.loginNote}</p>
          </li>
          <li>
            <div className="text-[12.5px] font-medium text-chalk-200">
              3 - Verify
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={rechecking}
              iconLeft={<Check size={13} />}
              onClick={() => void recheck()}
              className="mt-1.5"
            >
              {rechecking ? "Checking…" : "Re-check"}
            </Button>
          </li>
        </ol>

        <p className="mt-4 text-[11px] text-chalk-400">
          Install and login run entirely on your machine - Vibestrate never runs
          them for you and never sees your credentials.
        </p>
      </div>
    </div>
  );
}

function CopyLine({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 flex items-center gap-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-800 px-2 py-1.5">
      <code className="mono flex-1 truncate text-[12px] text-chalk-100">{cmd}</code>
      <button
        type="button"
        title="Copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {
            /* ignore */
          }
        }}
        className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-semibold text-chalk-400 transition hover:text-chalk-100"
      >
        <Copy size={12} /> {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
