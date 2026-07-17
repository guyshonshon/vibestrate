import { useEffect, useState } from "react";
import { FileCode, Lock } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../../app/App.js";
import type { ChangedFile, Task } from "../../lib/types.js";
import { cn } from "../design/cn.js";
import { Section } from "../layout/PageShell.js";
import { CARD } from "./sectionChrome.js";

export function FilesSection({ task }: { task: Task }) {
  const [runFiles, setRunFiles] = useState<ChangedFile[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const out: ChangedFile[] = [];
      for (const runId of task.runIds) {
        try {
          const snap = await api.getDiff(runId);
          if (snap) {
            for (const f of snap.files) out.push(f);
          }
        } catch {
          // skip stale runs
        }
      }
      if (!cancelled) setRunFiles(dedupe(out));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [task.runIds.join(",")]);

  if (
    task.touchedFiles.length === 0 &&
    runFiles.length === 0
  ) {
    return null;
  }

  return (
    <Section title="Files">
      <div className={CARD}>
        {task.touchedFiles.length > 0 ? (
          <div>
            <div className="text-[11px] font-medium text-violet-soft">
              Declared (touchedFiles)
            </div>
            <ul className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {task.touchedFiles.map((p) => (
                <li key={`d-${p}`}>
                  <FileLink path={p} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {runFiles.length > 0 ? (
          <div className="mt-3">
            <div className="text-[11px] font-medium text-violet-soft">
              Changed by linked runs
            </div>
            <ul className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {runFiles.map((f) => (
                <li key={`r-${f.path}`}>
                  <FileLink
                    path={f.path}
                    status={f.status}
                    redacted={f.isSecretLike}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function dedupe(files: ChangedFile[]): ChangedFile[] {
  const map = new Map<string, ChangedFile>();
  for (const f of files) {
    if (!map.has(f.path)) map.set(f.path, f);
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function FileLink({
  path,
  status,
  redacted,
}: {
  path: string;
  status?: string;
  redacted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        redacted
          ? undefined
          : navigate({
              kind: "codebase",
              filePath: path,
              line: null,
              runId: null,
            })
      }
      disabled={redacted}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500 px-2.5 py-1.5 text-left text-[11.5px] transition",
        redacted
          ? "text-amber-soft opacity-80"
          : "text-chalk-300 hover:border-violet-soft/40 hover:text-chalk-100",
      )}
      title={redacted ? "Secret file - contents redacted" : path}
    >
      {redacted ? (
        <Lock className="h-3 w-3 shrink-0" strokeWidth={1.9} />
      ) : (
        <FileCode className="h-3 w-3 shrink-0" strokeWidth={1.9} />
      )}
      <span className="truncate font-mono">{path}</span>
      {status ? (
        <span className="ml-auto font-mono text-[10px] text-chalk-400">
          {status}
        </span>
      ) : null}
    </button>
  );
}
