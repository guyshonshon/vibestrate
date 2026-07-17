// Dry-run preview modal: shows the snapshot a real run would instantiate
// (seats, enabled steps, gates) - no run starts. The page owns the resolve
// call and its busy/error state; this only renders it.
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../design/cn.js";
import { FlowGraph, isGraphSteps } from "../workflow/FlowGraph.js";
import type { ResolvedFlowSnapshot } from "../../lib/types.js";
import { PromptComposition } from "./StepInspector.js";

export function DryRunModal({
  snapshot,
  busy,
  error,
  flowId,
  onClose,
}: {
  snapshot: ResolvedFlowSnapshot | null;
  busy: boolean;
  error: string | null;
  flowId: string;
  onClose: () => void;
}) {
  // Which step's prompt-composition is expanded (one at a time).
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 w-full max-w-[640px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold text-violet-vivid">Dry-run · resolved, not started</div>
            <h2 className="text-[18px] font-bold text-chalk-100 mt-0.5">{snapshot?.label ?? "Resolving…"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[color:var(--line-strong)] px-2 py-1 text-[12px] text-chalk-300 hover:text-chalk-100 transition"
          >
            Close
          </button>
        </div>

        {busy ? (
          <div className="mt-4 text-[13px] text-chalk-400">Resolving the flow…</div>
        ) : error ? (
          <div className="mt-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
            {error}
          </div>
        ) : snapshot ? (
          <>
            <div className="mt-4">
              <div className="text-[12px] font-semibold text-violet-vivid mb-1.5">
                Seats · crew {snapshot.crewId}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {snapshot.seats.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500 px-2 py-1 text-[11.5px] text-chalk-300"
                    title={s.description ?? undefined}
                  >
                    <span className="text-chalk-100">{s.label}</span>{" "}
                    <span className="mono text-chalk-400">({s.id})</span>
                  </span>
                ))}
              </div>
            </div>
            {isGraphSteps(snapshot.steps) ? (
              <div className="mt-3">
                <FlowGraph
                  title="Graph · steps in a dashed box run in parallel"
                  checklistSegment={snapshot.checklistSegment ?? null}
                  steps={snapshot.steps
                    .filter((s) => s.enabled)
                    .map((s) => ({
                      id: s.id,
                      label: s.label,
                      kind: s.kind,
                      seat: s.seat,
                      needs: s.needs,
                      instructions: s.instructions,
                    }))}
                />
              </div>
            ) : null}
            <div className="mt-3">
              <div className="text-[12px] font-semibold text-violet-vivid mb-1.5">
                Steps · {snapshot.steps.filter((s) => s.enabled).length} enabled
                <span className="ml-1.5 font-normal text-chalk-400">
                  - open a step to see how its prompt is composed
                </span>
              </div>
              <ol className="space-y-1">
                {snapshot.steps.map((s, i) => {
                  const rowKey = `${s.id}-${i}`;
                  const canPreview = s.enabled && !!s.seat;
                  const open = expanded === rowKey;
                  return (
                    <li
                      key={rowKey}
                      className={cn(
                        "rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500 text-[12px]",
                        s.enabled ? "" : "opacity-45",
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5",
                          canPreview && "cursor-pointer",
                        )}
                        onClick={
                          canPreview ? () => setExpanded(open ? null : rowKey) : undefined
                        }
                        title={canPreview ? "Show how this step's prompt is composed" : undefined}
                      >
                        <span className="mono w-5 shrink-0 text-right text-[11px] text-chalk-400">{i + 1}</span>
                        <span className="truncate text-chalk-100">{s.label}</span>
                        <span className="mono text-[10.5px] text-chalk-400">{s.kind}</span>
                        {s.resolvedRoleLabel ? (
                          <span className="mono text-[10.5px] text-chalk-300">
                            → {s.resolvedRoleLabel}
                          </span>
                        ) : null}
                        {s.profileId ? (
                          <span className="mono text-[10.5px] text-violet-soft">
                            {s.profileId}
                            {s.providerId ? ` · ${s.providerId}` : ""}
                          </span>
                        ) : null}
                        {!s.enabled ? (
                          <span className="ml-auto text-[10.5px] text-chalk-400">skipped</span>
                        ) : s.approval ? (
                          <span className="ml-auto text-[10.5px] text-amber-soft">approval gate</span>
                        ) : null}
                        {canPreview ? (
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 text-chalk-400 transition-transform",
                              s.approval ? "" : "ml-auto",
                              open && "rotate-90",
                            )}
                            strokeWidth={1.9}
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      {open ? (
                        <div className="border-t border-[color:var(--line-soft)] px-2.5 pb-2.5">
                          <PromptComposition snapshot={snapshot} step={s} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
            <p className="mt-3 text-[11.5px] text-chalk-400">
              No run started. This is what{" "}
              <code className="text-chalk-300">vibe run "…" --flow {flowId}</code>{" "}
              would instantiate (reflects the saved flow).
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
