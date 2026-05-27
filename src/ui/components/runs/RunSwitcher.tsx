import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../../lib/api.js";
import { filterRuns } from "../../lib/run-outcome.js";
import { relTime } from "../design/format.js";
import { Chip } from "../design/Chip.js";
import type { RunState, RunStatus } from "../../lib/types.js";

function tone(
  status: RunStatus,
): "violet" | "sky" | "amber" | "emerald" | "rose" | "neutral" {
  if (status === "waiting_for_approval" || status === "paused") return "amber";
  if (status === "reviewing" || status === "verifying" || status === "validating")
    return "sky";
  if (status === "merge_ready") return "emerald";
  if (status === "failed" || status === "aborted" || status === "blocked")
    return "rose";
  return "violet";
}

/**
 * Global "jump to run" quick switcher (Cmd/Ctrl-K). Lists recent runs and lets
 * you filter by task, runId, or status and jump straight to one — so reaching a
 * run never requires going through the full "all runs" page. (Epic B / B2.)
 */
export function RunSwitcher({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (runId: string) => void;
}) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    void api
      .listRuns()
      .then((list) => {
        // Most-recently-updated first.
        setRuns(
          [...list].sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ),
        );
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(
    () => filterRuns(runs, query).slice(0, 40),
    [runs, query],
  );

  // Keep the active index in range as the filter narrows.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[active];
      if (pick) onSelect(pick.runId);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-[620px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Search className="h-4 w-4 text-fog-400" strokeWidth={1.7} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a run — task, id, or status…"
            className="w-full bg-transparent text-[14px] text-fog-100 outline-none placeholder:text-fog-500"
          />
          <span className="text-[10.5px] text-fog-500">esc</span>
        </div>
        <div className="max-h-[46vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12.5px] text-fog-500">
              {runs.length === 0 ? "No runs yet." : "No runs match."}
            </div>
          ) : (
            filtered.map((r, i) => (
              <button
                key={r.runId}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => onSelect(r.runId)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                  i === active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                }`}
              >
                <Chip tone={tone(r.status)}>{r.status}</Chip>
                <span className="min-w-0 flex-1 truncate text-[13px] text-fog-100">
                  {r.task}
                </span>
                <span className="mono shrink-0 text-[10.5px] text-fog-500">
                  {relTime(r.updatedAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
