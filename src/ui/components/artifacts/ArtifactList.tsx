import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api } from "../../lib/api.js";
import { usePersistedState } from "../../lib/usePersistedState.js";
import type { ArtifactEntry } from "../../lib/types.js";

// ── Curated artifact browser ────────────────────────────
// A run writes a LOT of plumbing per step (context packets, prompt record
// copies, diff snapshots, the resolved-flow + selection + participant records,
// validation stdout) - listing it flat buried the few artifacts a human
// actually reads (outputs, reports, decisions, findings). Default view: grouped
// by step (collapsible), internals hidden behind one persisted toggle.

/** Plumbing a human rarely needs - hidden unless "internals" is on. Deliverables
 *  (output.md, report.md, idea.md, outcomes.md) and evidence (validation
 *  results, findings, finding-responses, decision-summary, diffs, patches) stay
 *  visible. */
function isInternal(p: string): boolean {
  return (
    // Per-turn plumbing.
    /(^|\/)context-packet\.json$/.test(p) ||
    /(^|\/)prompt\.(md|txt)$/.test(p) ||
    /-prompt\.(md|txt)$/.test(p) || // NN-role-prompt.md record copies
    /(^|\/)diff-snapshot\.json$/.test(p) ||
    // Run-level orchestration records (the engine's own bookkeeping).
    /(^|\/)selection\.json$/.test(p) ||
    /(^|\/)flow\.json$/.test(p) ||
    /(^|\/)participants\.json$/.test(p) ||
    /(^|\/)context\//.test(p) || // context/sources.json and friends
    // Raw validation streams (the rolled-up validation-results.json stays).
    /(^|\/)validation\/.+\.(stdout|stderr)\.txt$/.test(p) ||
    /(^|\/)mcp\//.test(p)
  );
}

/** Group key: the step dir for flows/<step>/..., else a top-level bucket. */
function groupOf(p: string): string {
  const m = /^flows\/([^/]+)\//.exec(p);
  if (m) return m[1]!;
  return "run";
}

export function ArtifactList({
  runId,
  selectedPath,
  onSelect,
}: {
  runId: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [items, setItems] = useState<ArtifactEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Persisted per browser; default off.
  const [showInternals, setShowInternals] = usePersistedState(
    "vibestrate.artifacts.showInternals",
    false,
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await api.listArtifacts(runId);
        if (!cancelled) {
          setItems(list);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId]);

  const { groups, hiddenCount } = useMemo(() => {
    const visible = showInternals ? items : items.filter((i) => !isInternal(i.path));
    const hidden = items.length - visible.length;
    const byGroup = new Map<string, ArtifactEntry[]>();
    for (const entry of visible) {
      const g = groupOf(entry.path);
      const list = byGroup.get(g) ?? [];
      list.push(entry);
      byGroup.set(g, list);
    }
    return { groups: [...byGroup.entries()], hiddenCount: hidden };
  }, [items, showInternals]);

  if (error)
    return (
      <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[12px] text-rose-300">
        {error}
      </div>
    );

  if (items.length === 0) {
    return (
      <div className="text-[12px] text-chalk-400">No artifacts yet.</div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11.5px] font-semibold text-chalk-300">
          Artifacts
        </span>
        <button
          type="button"
          onClick={() => setShowInternals((v) => !v)}
          className="text-[11px] font-medium text-chalk-400 transition hover:text-chalk-100"
          title="Prompts, context packets, diff snapshots, validation output files - the run's plumbing"
        >
          {showInternals
            ? "hide internals"
            : hiddenCount > 0
              ? `show internals (${hiddenCount})`
              : "show internals"}
        </button>
      </div>
      <div className="space-y-2.5">
        {groups.map(([group, entries]) => {
          const isCollapsed = collapsed.has(group);
          return (
          <div key={group}>
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(group)) next.delete(group);
                  else next.add(group);
                  return next;
                })
              }
              className="mono mb-0.5 flex w-full items-center gap-1 text-[10.5px] text-chalk-400 transition hover:text-chalk-100"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3" strokeWidth={2} aria-hidden />
              ) : (
                <ChevronDown className="h-3 w-3" strokeWidth={2} aria-hidden />
              )}
              {group === "run" ? "run" : `step · ${group}`}
              <span className="opacity-60">({entries.length})</span>
            </button>
            {isCollapsed ? null : (
            <ol className="space-y-px">
              {entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    onClick={() => onSelect(entry.path)}
                    className={`flex w-full items-center gap-2 rounded-[10px] px-2 py-1 text-left transition hover:bg-coal-500 ${
                      selectedPath === entry.path ? "bg-coal-500" : ""
                    }`}
                  >
                    <span className="mono flex-1 truncate text-[12px] text-chalk-100">
                      {entry.path.replace(/^flows\/[^/]+\//, "")}
                    </span>
                    <span className="mono text-[11px] text-chalk-400">
                      {entry.size}b
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
