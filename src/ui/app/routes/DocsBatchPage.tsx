import { useMemo, useState } from "react";
import { ArrowRight, FileText, Play, Plus, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../App.js";
import { Button } from "../../components/design/Button.js";
import {
  PageShell,
  PageHeader,
  Section,
} from "../../components/layout/PageShell.js";

/**
 * Docs batch launcher (#/docs-batch). The dashboard half of `vibe docs`: revise
 * several documentation pages concurrently, one isolated `docs` run per page.
 * Mirrors the run-composer idiom (coal/chalk/violet-soft, recessed Section
 * wells, primary Button by its title, rose error well) rather than inventing a
 * surface. Each page becomes its own run in the normal runs list.
 */
function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.?\/+/, "").replace(/\/+$/, "").trim();
}

export function DocsBatchPage() {
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<
    { runId: string; targetPath: string | null }[] | null
  >(null);

  const canLaunch = pages.length > 0 && !busy;
  const launchLabel = busy
    ? "Launching…"
    : pages.length === 0
      ? "Add pages to launch"
      : `Launch ${pages.length} run${pages.length > 1 ? "s" : ""}`;

  const dupOfDraft = useMemo(() => {
    const key = normalize(draft);
    return key.length > 0 && pages.some((p) => normalize(p) === key);
  }, [draft, pages]);

  function addPage(): void {
    const value = draft.trim();
    if (!value || dupOfDraft) return;
    setPages((prev) => [...prev, value]);
    setDraft("");
  }

  function removePage(i: number): void {
    setPages((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function launch(): Promise<void> {
    if (!canLaunch) return;
    setBusy(true);
    setError(null);
    setLaunched(null);
    const brief = instruction.trim() || "Revise this documentation page.";
    try {
      const res = await api.spawnDocsBatch({
        items: pages.map((p) => ({
          task: `${brief}\n\nTarget documentation file: ${p}`,
          targetPath: p,
        })),
      });
      setLaunched(res.launched);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Docs batch"
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate({ kind: "compose" })}>
            Single run
          </Button>
        }
      >
        <p className="mt-2 max-w-[62ch] text-[13px] text-chalk-300">
          Revise several documentation pages at once - one isolated <span className="mono text-violet-soft">docs</span> run per page, a few in parallel, each on its own branch. One failing page never blocks the others. Best for prose edits to distinct pages.
        </p>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Section title="Instruction">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              placeholder="What should each run do to its page? (e.g. tighten the intro, fix stale CLI flags). Applied to every page below."
              className="w-full resize-none rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2.5 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
            />
          </Section>

          <Section title="Pages">
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPage();
                  }
                }}
                placeholder="docs/content/concepts/seat.md"
                className="mono w-full rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[12.5px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
              />
              <Button
                variant="secondary"
                size="md"
                disabled={!draft.trim() || dupOfDraft}
                onClick={addPage}
                iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2.4} />}
              >
                Add
              </Button>
            </div>
            {dupOfDraft ? (
              <p className="mt-2 text-[11.5px] text-amber-soft">
                That page is already in the batch - each run must edit a distinct file.
              </p>
            ) : null}

            <div className="mt-3 flex flex-col gap-1.5">
              {pages.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-[color:var(--line)] bg-coal-700 px-3 py-4 text-center text-[12.5px] text-chalk-300">
                  Add the documentation pages to revise. Each becomes its own run.
                </div>
              ) : (
                pages.map((p, i) => (
                  <div
                    key={p}
                    className="flex items-center gap-2 rounded-[12px] border border-[color:var(--line)] bg-coal-600 px-3 py-2"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.9} />
                    <span className="mono flex-1 truncate text-[12.5px] text-chalk-100">{p}</span>
                    <button
                      type="button"
                      onClick={() => removePage(i)}
                      className="text-chalk-400 transition hover:text-chalk-100"
                      aria-label={`Remove ${p}`}
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                disabled={!canLaunch}
                onClick={() => launch()}
                iconLeft={<Play className="h-3.5 w-3.5" strokeWidth={2.4} />}
              >
                {launchLabel}
              </Button>
              <span className="text-[11.5px] text-chalk-400">
                Up to 4 runs in parallel. Nothing pushes or merges - each stops at merge-ready, blocked, or failed.
              </span>
            </div>
            {error ? (
              <div className="mt-3 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
                {error}
              </div>
            ) : null}
          </Section>
        </div>

        {/* Right rail: launched runs */}
        <aside className="lg:col-span-4">
          <Section title="Launched">
            {!launched ? (
              <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 px-4 py-5 text-[12.5px] text-chalk-300">
                Runs you launch appear here and in the Runs list. Each links to its own live run detail.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {launched.map((r) => (
                  <button
                    key={r.runId}
                    type="button"
                    onClick={() => navigate({ kind: "run", runId: r.runId })}
                    className="group flex items-center gap-2 rounded-[12px] border border-[color:var(--line)] bg-coal-600 px-3 py-2 text-left transition hover:border-violet-soft/50"
                  >
                    <span className="mono flex-1 truncate text-[12px] text-chalk-100">
                      {r.targetPath ?? r.runId}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-chalk-400 transition group-hover:text-violet-soft" strokeWidth={2.1} />
                  </button>
                ))}
              </div>
            )}
          </Section>
        </aside>
      </div>
    </PageShell>
  );
}
