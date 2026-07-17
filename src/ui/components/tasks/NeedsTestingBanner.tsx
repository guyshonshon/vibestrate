import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { api } from "../../lib/api.js";
import type { Task } from "../../lib/types.js";
import { Button } from "../design/Button.js";

export function NeedsTestingBanner({
  task,
  onResolved,
}: {
  task: Task;
  onResolved: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verdict(v: "pass" | "fail") {
    setBusy(v);
    setError(null);
    try {
      await api.resolveNeedsTesting(task.id, v);
      await onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-[22px] border border-amber-soft/25 bg-coal-600 p-5">
      <div className="flex items-start gap-2.5">
        <FlaskConical
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-soft"
          strokeWidth={1.9}
        />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-amber-soft">
            Needs testing - a human should check this
          </div>
          <div className="mt-1 text-[12.5px] text-chalk-200">
            {task.needsTestingReason ||
              "A run finished but flagged something for human review (e.g. visual / UX the model can't perceive)."}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => verdict("pass")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-emerald-500/15 px-3 py-1.5 text-[12.5px] font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {busy === "pass" ? "…" : "Looks good → Done"}
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => verdict("fail")}
              disabled={busy !== null}
            >
              {busy === "fail" ? "…" : "Needs work → Reopen"}
            </Button>
          </div>
          {error ? (
            <div className="mt-1.5 text-[11px] text-rose-300">{error}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
