import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../../lib/api.js";
import { filterRuns } from "../../lib/run-outcome.js";
import { relTime } from "../design/format.js";
import { RunStatusBadge } from "./RunStatusBadge.js";
import type { RunState } from "../../lib/types.js";

/**
 * Global "jump to run" quick switcher (Cmd/Ctrl-K). Lists recent runs and lets
 * you filter by task, runId, or status and jump straight to one - so reaching a
 * run never requires going through the full "all runs" page.
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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 py-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[620px] overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-coal-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[color:var(--line)] px-4 py-3">
          <Search className="h-4 w-4 text-chalk-300" strokeWidth={1.9} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a run - task, id, or status…"
            // The modal is the focus context (command-palette idiom); the
            // search field itself takes no ring. Inline style overrides the
            // global unlayered :focus-visible outline, which would otherwise
            // float a stray violet pill around the transparent input.
            style={{ outline: "none" }}
            className="w-full bg-transparent text-[14px] text-chalk-100 outline-none placeholder:text-chalk-400"
          />
          <span className="mono text-[11px] text-chalk-400">esc</span>
        </div>
        <div className="max-h-[46vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12.5px] text-chalk-300">
              {runs.length === 0 ? "No runs yet." : "No runs match."}
            </div>
          ) : (
            filtered.map((r, i) => (
              <button
                key={r.runId}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => onSelect(r.runId)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left transition ${
                  i === active ? "bg-coal-500" : "hover:bg-coal-500/60"
                }`}
              >
                <span className="shrink-0">
                  <RunStatusBadge status={r.status} compact />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-chalk-100">
                  {r.task}
                </span>
                <span className="mono shrink-0 text-[11px] text-chalk-400">
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
