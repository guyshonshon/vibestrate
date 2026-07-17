import { useState } from "react";
import { ExternalLink, FileCode, Plus, X } from "lucide-react";
import { api } from "../../lib/api.js";
import type { Task } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { cn } from "../design/cn.js";
import { INPUT } from "./sectionChrome.js";

export function ContextSourcesSection({
  task,
  onChanged,
}: {
  task: Task;
  onChanged: () => Promise<void> | void;
}) {
  const sources = task.contextSources ?? [];
  const [kind, setKind] = useState<"file" | "url">("file");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const hasSources = sources.length > 0;

  async function save(next: { kind: "file" | "url"; ref: string }[]) {
    setBusy(true);
    setError(null);
    try {
      await api.setTaskContextSources(task.id, next);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = ref.trim();
    if (!r) return;
    await save([...sources.map((s) => ({ kind: s.kind, ref: s.ref })), { kind, ref: r }]);
    setRef("");
  }

  // Embedded grounding row - lives inside the Brief card, not a standalone
  // section. A compact "Grounding" label, the sources as inline chips, and an
  // add affordance that reveals the file/url input only when opted in.
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[11px] font-medium text-violet-soft">Grounding</span>
        {hasSources ? (
          sources.map((s, i) => (
            <span
              key={`${s.kind}-${s.ref}-${i}`}
              className="group inline-flex items-center gap-1.5 rounded-[8px] bg-coal-500/70 py-1 pl-2 pr-1.5 text-[11px]"
            >
              {s.kind === "url" ? (
                <ExternalLink className="h-3 w-3 shrink-0 text-amber-soft" strokeWidth={1.9} />
              ) : (
                <FileCode className="h-3 w-3 shrink-0 text-violet-soft" strokeWidth={1.9} />
              )}
              <span className="max-w-[220px] truncate font-mono text-chalk-200">{s.ref}</span>
              <button
                type="button"
                onClick={() =>
                  save(
                    sources
                      .filter((_, j) => j !== i)
                      .map((x) => ({ kind: x.kind, ref: x.ref })),
                  )
                }
                disabled={busy}
                title="Remove reference"
                className="shrink-0 text-chalk-500 transition hover:text-rose-300 disabled:opacity-50"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </span>
          ))
        ) : (
          <span className="text-[11px] text-chalk-400">none</span>
        )}
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-chalk-300 transition hover:text-violet-soft"
          >
            <Plus className="h-3 w-3" strokeWidth={1.9} /> Add
          </button>
        ) : null}
      </div>

      {adding ? (
        <form onSubmit={add} className="mt-2 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-[10px] border border-[color:var(--line)] bg-coal-800 p-0.5">
            {(["file", "url"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-[8px] px-2.5 py-1 text-[12px] font-semibold capitalize transition",
                  kind === k
                    ? "bg-coal-600 text-chalk-100"
                    : "text-chalk-400 hover:text-chalk-200",
                )}
              >
                {k}
              </button>
            ))}
          </div>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={kind === "file" ? "path/in/project.md" : "https://…"}
            autoFocus
            className={cn(INPUT, "min-w-[180px] flex-1")}
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={busy || !ref.trim()}
            iconLeft={<Plus className="h-3 w-3" strokeWidth={1.9} />}
          >
            Add
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
            Done
          </Button>
        </form>
      ) : null}
      {adding ? (
        <p className="mt-1.5 text-[10.5px] text-chalk-400">
          Files or URLs injected into every run (path-guarded, SSRF-guarded,
          secrets redacted).
        </p>
      ) : null}
      {error ? (
        <div className="mt-1.5 text-[11px] text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}
