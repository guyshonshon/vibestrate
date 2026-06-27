import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../../app/App.js";

/**
 * Inline new-run composer for Mission Control, in the soft-dark language.
 * Condensed by design: type a task, launch. The full option set (flow, crew,
 * profile, permission, params) lives on the compose page via "More options".
 * Launches a real run with sensible defaults, then lands on the control page.
 */
export function MissionComposer() {
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launch = async () => {
    const t = task.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.spawnRun({ task: t });
      navigate({ kind: "control", runId: r.runId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[22px] border border-white/[0.06] bg-coal-600 p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-chalk-100">New run</h2>
        <button
          onClick={() => navigate({ kind: "compose" })}
          className="flex items-center gap-1 text-[12.5px] font-semibold text-violet-soft hover:text-violet-soft/80"
        >
          More options <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void launch();
        }}
        rows={3}
        placeholder="Describe the change to run. e.g. Add retry with backoff to the uploader."
        className="w-full resize-none rounded-[14px] border border-white/[0.08] bg-coal-800 px-4 py-3 text-[14px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
      />
      {error ? <div className="mt-2 text-[12.5px] text-rose-300">{error}</div> : null}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => void launch()}
          disabled={!task.trim() || busy}
          className="flex items-center gap-2 rounded-[12px] bg-violet-soft px-4 py-2.5 text-[13.5px] font-bold text-coal-900 hover:bg-violet-soft/90 disabled:opacity-40"
        >
          {busy ? (
            "Launching…"
          ) : (
            <>
              Launch run <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
        <span className="text-[12px] text-chalk-400">&#8984;&#8629; to launch</span>
      </div>
    </div>
  );
}
