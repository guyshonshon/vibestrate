import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api, type SnapshotPrunePlan } from "../../lib/api.js";

type Phase = "idle" | "previewing" | "confirm" | "pruning" | "done" | "error";

/**
 * Dashboard half of `vibe runs prune` (ISSUE-001 P1). Explicitly reclaims
 * rewind-snapshot refs for runs whose directory is gone (orphans) - the
 * clearly-uncrucial cleanup. Previews first (a dry run), then deletes only on
 * the user's confirmation. The tool never purges on its own; this is the user
 * pulling the trigger.
 */
export function PruneSnapshotsButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [plan, setPlan] = useState<SnapshotPrunePlan | null>(null);
  const [msg, setMsg] = useState<string>("");

  async function preview() {
    setPhase("previewing");
    setMsg("");
    try {
      const r = await api.pruneSnapshots({ orphans: true, dryRun: true });
      setPlan(r.plan);
      if (r.plan.runs.length === 0) {
        setPhase("done");
        setMsg(
          r.plan.totalRunsWithSnapshots === 0
            ? "No rewind snapshots to prune."
            : "No orphaned snapshots — nothing to prune.",
        );
      } else {
        setPhase("confirm");
      }
    } catch (e) {
      setPhase("error");
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function execute() {
    setPhase("pruning");
    try {
      const r = await api.pruneSnapshots({ orphans: true });
      setPhase("done");
      setMsg(`Pruned snapshot refs for ${r.pruned?.length ?? 0} run(s).`);
    } catch (e) {
      setPhase("error");
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  const btn =
    "rounded-md border border-white/10 px-2.5 py-1 text-[12px] text-fog-300 hover:text-fog-100 hover:border-white/20 disabled:opacity-50";

  if (phase === "confirm" && plan) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-fog-300">
        <span>
          Prune {plan.orphanRuns.length} orphaned run(s)? (refs only; artifacts
          untouched)
        </span>
        <button type="button" className={btn} onClick={() => void execute()}>
          Prune
        </button>
        <button type="button" className={btn} onClick={() => setPhase("idle")}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={`${btn} inline-flex items-center gap-1.5`}
        disabled={phase === "previewing" || phase === "pruning"}
        onClick={() => void preview()}
        title="Reclaim rewind-snapshot refs for runs whose directory is gone"
      >
        <Trash2 size={12} />
        {phase === "previewing"
          ? "Checking…"
          : phase === "pruning"
            ? "Pruning…"
            : "Prune snapshots"}
      </button>
      {msg ? (
        <span
          className={
            phase === "error" ? "text-[11px] text-rose-300" : "text-[11px] text-fog-500"
          }
        >
          {msg}
        </span>
      ) : null}
    </div>
  );
}
