/**
 * Compact supervisor-assist popover, anchored to the orb in the New-run task box.
 * Instead of opening the full consult chat, the orb drops this small panel that
 * reads back what you'd plausibly pick up next - recent work to review and open
 * todo/roadmap items - and turns any of them into a task brief with one click.
 *
 * Data is real: api.listRuns (recent finished runs), api.suggestNext (the
 * supervisor's next-task picks) and api.listRoadmap (open roadmap items). There
 * is no AI "draft from scratch" endpoint, so this assembles a brief from real
 * context rather than fabricating one.
 */
import { useEffect, useState } from "react";
import { ListTodo, RotateCcw, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { ConsultOrb } from "../consult/ConsultOrb.js";
import type { RoadmapItem, RunState, TaskSuggestion } from "../../lib/types.js";

const FINISHED = new Set(["merge_ready", "failed", "aborted"]);

export function AssistPopover({
  suggestions,
  onPick,
  onClose,
}: {
  suggestions: TaskSuggestion[];
  onPick: (task: string) => void;
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [r, rm] = await Promise.all([
        api.listRuns().catch(() => [] as RunState[]),
        api.listRoadmap().catch(() => [] as RoadmapItem[]),
      ]);
      if (cancelled) return;
      setRuns(r);
      setRoadmap(rm);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = (r: RunState) => r.displayName || r.task;
  const recent = runs
    .filter((r) => FINISHED.has(r.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 2);
  const todos = [
    ...suggestions.map((s) => ({ key: `s:${s.taskId}`, title: s.title, reason: s.reason })),
    ...roadmap
      .filter((i) => i.status === "planned" || i.status === "idea")
      .map((i) => ({ key: `r:${i.id}`, title: i.title, reason: "On your roadmap" })),
  ].slice(0, 3);

  const empty = recent.length === 0 && todos.length === 0;

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} aria-hidden />
      <div
        className="fade-up absolute right-0 top-[54px] z-30 w-[340px] rounded-[14px] border border-[color:var(--line-strong)] p-3 shadow-2xl backdrop-blur-xl"
        style={{ background: "color-mix(in srgb, var(--popover) 94%, transparent)" }}
        role="dialog"
        aria-label="Supervisor assist"
      >
        <div className="mb-2.5 flex items-center gap-2.5">
          <ConsultOrb size={26} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-chalk-100">Need a starting point?</div>
            <div className="text-[11px] text-chalk-400">Here&apos;s what I&apos;d pick up.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-6 w-6 place-items-center rounded-md text-chalk-400 transition hover:bg-coal-500 hover:text-chalk-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {recent.length > 0 ? (
          <div className="mb-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-vivid">
              Pick up where you left off
            </div>
            <div className="flex flex-col gap-1">
              {recent.map((r) => (
                <button
                  key={r.runId}
                  type="button"
                  onClick={() =>
                    onPick(
                      `Review the changes from "${name(r)}"${
                        r.branchName ? ` (${r.branchName})` : ""
                      } and suggest improvements.`,
                    )
                  }
                  className="flex items-start gap-2 rounded-[10px] border border-[color:var(--line)] px-2.5 py-2 text-left transition hover:border-[color:var(--line-strong)] hover:bg-coal-500/60"
                >
                  <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chalk-400" strokeWidth={1.8} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-chalk-100">
                      You worked on {name(r)}
                    </span>
                    <span className="block text-[11px] text-chalk-400">Run a review on it?</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {todos.length > 0 ? (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-vivid">
              On your list
            </div>
            <div className="flex flex-col gap-1">
              {todos.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onPick(t.title)}
                  title={t.reason}
                  className="flex items-start gap-2 rounded-[10px] border border-[color:var(--line)] px-2.5 py-2 text-left transition hover:border-[color:var(--line-strong)] hover:bg-coal-500/60"
                >
                  <ListTodo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chalk-400" strokeWidth={1.8} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-chalk-100">{t.title}</span>
                    <span className="block truncate text-[11px] text-chalk-400">{t.reason}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {empty ? (
          <div className="px-1 py-2 text-[12px] leading-[1.5] text-chalk-400">
            Nothing queued yet. Describe a change above and launch a run - I&apos;ll have suggestions once
            there&apos;s history.
          </div>
        ) : null}
      </div>
    </>
  );
}
