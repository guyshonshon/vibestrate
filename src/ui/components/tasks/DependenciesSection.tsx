import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../../lib/api.js";
import type { Task } from "../../lib/types.js";
import { Select } from "../design/Select.js";
import { cn } from "../design/cn.js";
import { Section } from "../layout/PageShell.js";
import { CARD } from "./sectionChrome.js";

export function DependenciesSection({
  task,
  allTasks,
  onOpenTask,
  onChanged,
}: {
  task: Task;
  allTasks: Task[];
  onOpenTask: (taskId: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const blockers = task.dependencies
    .map((id) => allTasks.find((t) => t.id === id) ?? null)
    .filter((t): t is Task => t !== null);
  const missingBlockers = task.dependencies.filter(
    (id) => !allTasks.find((t) => t.id === id),
  );
  const unlocks = allTasks.filter((t) => t.dependencies.includes(task.id));
  // Candidates to depend on: any other task not already a blocker.
  const candidates = allTasks.filter(
    (t) => t.id !== task.id && !task.dependencies.includes(t.id),
  );

  const isDone = (s: Task["status"]) => s === "done" || s === "cancelled";

  async function setDeps(next: string[]) {
    setBusy(true);
    setError(null);
    try {
      await api.patchTask(task.id, { dependencies: next });
      setAdding(false);
      await onChanged();
    } catch (err) {
      // The server rejects a cycle / self / unknown dependency with a 400.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Blockers"
      action={
        candidates.length > 0 ? (
          <button
            onClick={() => {
              setError(null);
              setAdding((v) => !v);
            }}
            className="text-[12.5px] font-semibold text-violet-soft transition hover:text-violet-soft/80"
          >
            {adding ? "Cancel" : "+ Add blocker"}
          </button>
        ) : null
      }
    >
      <div className={CARD}>
        <div className="mb-2.5 text-[11px] text-chalk-400">
          What must finish before this can run, and what finishing this unblocks.
        </div>
        {adding ? (
          <div className="mb-2 flex items-center gap-2">
            <Select
              value=""
              disabled={busy}
              ariaLabel="This task is blocked by"
              placeholder="This task is blocked by..."
              className="min-w-0 flex-1"
              onChange={(v) => {
                if (v) void setDeps([...task.dependencies, v]);
              }}
              options={candidates.map((c) => ({ value: c.id, label: c.title }))}
            />
          </div>
        ) : null}
        {error ? (
          <div className="mb-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-medium text-violet-soft">
              Blocked by ({blockers.length + missingBlockers.length})
            </div>
            {blockers.length === 0 && missingBlockers.length === 0 ? (
              <div className="mt-1.5 flex flex-col items-start gap-1.5">
                <div className="text-[12px] text-emerald-400">
                  Nothing's blocking this - it can run.
                </div>
                {candidates.length > 0 ? (
                  <button
                    onClick={() => {
                      setError(null);
                      setAdding(true);
                    }}
                    className="text-[11.5px] font-semibold text-violet-soft transition hover:text-violet-soft/80"
                  >
                    + Add a blocker
                  </button>
                ) : null}
              </div>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {blockers.map((b) => {
                  const open = !isDone(b.status);
                  return (
                    <li key={b.id} className="flex items-center gap-1">
                      <button
                        onClick={() => onOpenTask(b.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500 px-2.5 py-1.5 text-left transition hover:bg-coal-400"
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            open ? "bg-amber-soft" : "bg-emerald-400",
                          )}
                        />
                        <span className="flex-1 truncate text-[12px] text-chalk-100">
                          {b.title}
                        </span>
                        <span className="font-mono text-[10.5px] text-chalk-400">
                          {b.status}
                        </span>
                      </button>
                      <button
                        title="Remove this blocker"
                        disabled={busy}
                        onClick={() =>
                          void setDeps(task.dependencies.filter((d) => d !== b.id))
                        }
                        className="shrink-0 px-1.5 py-1 text-chalk-400 transition hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                      </button>
                    </li>
                  );
                })}
                {missingBlockers.map((id) => (
                  <li key={id} className="flex items-center gap-1">
                    <span className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-rose-400/30 bg-rose-500/[0.07] px-2.5 py-1.5 text-[12px] text-rose-300">
                      <span className="flex-1 truncate font-mono">{id}</span>
                      <span className="font-mono text-[10.5px]">missing</span>
                    </span>
                    <button
                      title="Remove this blocker"
                      disabled={busy}
                      onClick={() =>
                        void setDeps(task.dependencies.filter((d) => d !== id))
                      }
                      className="shrink-0 px-1.5 py-1 text-chalk-400 transition hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-[11px] font-medium text-violet-soft">
              Unlocks ({unlocks.length})
            </div>
            {unlocks.length === 0 ? (
              <div className="mt-1.5 text-[12px] text-chalk-400">
                Nothing's waiting on this one yet.
              </div>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {unlocks.map((u) => (
                  <li key={u.id}>
                    <button
                      onClick={() => onOpenTask(u.id)}
                      className="flex w-full items-center gap-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500 px-2.5 py-1.5 text-left transition hover:bg-coal-400"
                    >
                      <span className="flex-1 truncate text-[12px] text-chalk-100">
                        {u.title}
                      </span>
                      <span className="font-mono text-[10.5px] text-chalk-400">
                        {u.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
