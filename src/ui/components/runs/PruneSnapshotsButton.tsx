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
    "inline-flex items-center gap-1.5 rounded-[10px] bg-coal-500 px-3 py-1.5 text-[12.5px] font-semibold text-chalk-100 transition hover:bg-coal-400 disabled:cursor-not-allowed disabled:opacity-50";
  const destructiveBtn =
    "inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50";

  if (phase === "confirm" && plan) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-chalk-300">
        <span>
          Prune {plan.orphanRuns.length} orphaned run(s)? (refs only; artifacts
          untouched)
        </span>
        <button type="button" className={destructiveBtn} onClick={() => void execute()}>
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
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
        className={btn}
        disabled={phase === "previewing" || phase === "pruning"}
        onClick={() => void preview()}
        title="Reclaim rewind-snapshot refs for runs whose directory is gone"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
        {phase === "previewing"
          ? "Checking…"
          : phase === "pruning"
            ? "Pruning…"
            : "Prune snapshots"}
      </button>
      {msg ? (
        <span
          className={
            phase === "error" ? "text-[11.5px] text-rose-300" : "text-[11.5px] text-chalk-400"
          }
        >
          {msg}
        </span>
      ) : null}
    </div>
  );
}
