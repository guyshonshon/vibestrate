import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { ValidationCommandResult } from "./ValidationCommandResult.js";

type Item = {
  command: string;
  exitCode: number;
  status: "passed" | "failed" | "environment";
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
};

type ValidationFile = {
  commands: Item[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    environment?: number;
  };
  note?: string;
};

export function ValidationSummary({ runId }: { runId: string }) {
  const [data, setData] = useState<ValidationFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tryLoad = async () => {
      // Try the latest validation file: in fix loops it'll be under loops/loop-N/.
      // We grab artifacts list and find the most recent validation-results.json.
      try {
        const list = await api.listArtifacts(runId);
        const candidates = list.filter((a) =>
          a.path.endsWith("validation-results.json"),
        );
        if (candidates.length === 0) {
          if (!cancelled) {
            setData(null);
            setError(null);
          }
          return;
        }
        const latest = candidates[candidates.length - 1]!;
        const raw = await api.readArtifact(runId, latest.path);
        const parsed = JSON.parse(raw) as ValidationFile;
        if (!cancelled) {
          setData(parsed);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void tryLoad();
    const interval = setInterval(tryLoad, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId]);

  if (error)
    return (
      <div className="rounded-[14px] border border-rose-400/30 bg-rose-500/10 p-3 text-[12px] text-rose-300">
        {error}
      </div>
    );

  return (
    <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11.5px] font-semibold text-chalk-300">
          Validation
        </div>
        {data ? (
          <span className="mono text-[11px] text-chalk-300">
            {data.summary.passed}/{data.summary.total} passed
            {(data.summary.environment ?? 0) > 0
              ? ` · ${data.summary.environment} env-unavailable`
              : ""}
          </span>
        ) : null}
      </div>
      {!data ? (
        <div className="mt-2 text-[12px] text-chalk-400">
          Validation has not run yet.
        </div>
      ) : data.commands.length === 0 ? (
        <div className="mt-2 text-[12px] text-chalk-400">
          {data.note ?? "No validation commands configured."}
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          {data.commands.map((c) => (
            <ValidationCommandResult key={c.command} item={c} />
          ))}
        </div>
      )}
    </div>
  );
}
