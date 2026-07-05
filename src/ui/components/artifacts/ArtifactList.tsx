import { useEffect, useMemo, useState } from "react";
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
    return <div className="text-[12px] text-vibestrate-fail">{error}</div>;

  if (items.length === 0) {
    return (
      <div className="text-[12px] text-vibestrate-fg-muted">
        No artifacts yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
          artifacts
        </span>
        <button
          type="button"
          onClick={() => setShowInternals((v) => !v)}
          className="text-[11px] text-vibestrate-fg-muted hover:text-vibestrate-fg"
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
              className="vibestrate-mono mb-0.5 flex w-full items-center gap-1 text-[10.5px] text-vibestrate-fg-muted hover:text-vibestrate-fg"
            >
              <span className="inline-block w-2 text-center">
                {isCollapsed ? "›" : "⌄"}
              </span>
              {group === "run" ? "run" : `step · ${group}`}
              <span className="opacity-60">({entries.length})</span>
            </button>
            {isCollapsed ? null : (
            <ol className="space-y-px">
              {entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    onClick={() => onSelect(entry.path)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-vibestrate-panel-2 ${
                      selectedPath === entry.path ? "bg-vibestrate-panel-2" : ""
                    }`}
                  >
                    <span className="vibestrate-mono flex-1 truncate text-[12px] text-vibestrate-fg">
                      {entry.path.replace(/^flows\/[^/]+\//, "")}
                    </span>
                    <span className="vibestrate-mono text-[11px] text-vibestrate-fg-muted">
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
