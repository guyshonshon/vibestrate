import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import type { TodoOverview, TodoView } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { Checkbox } from "../../components/design/Checkbox.js";
import { Chip } from "../../components/design/Chip.js";
import { Select } from "../../components/design/Select.js";
import { SegmentedControl } from "../../components/design/SegmentedControl.js";
import { StatTile } from "../../components/design/StatTile.js";
import { PageShell } from "../../components/layout/PageShell.js";
import { PageHero } from "../../components/layout/PageHero.js";
import { Deck, Cell } from "../../components/layout/Deck.js";
import { ErrorView } from "../../lib/error-view.js";

const INPUT =
  "w-full rounded-[8px] border border-[color:var(--line-strong)] bg-coal-800 px-2 py-1 text-[12.5px] text-chalk-100 outline-none focus:border-violet-soft/50";

type Tab = "promotable" | "on_board" | "dismissed";

const MARKER_TONE: Record<string, "rose" | "amber" | "violet" | "neutral"> = {
  FIXME: "rose",
  BUG: "rose",
  TODO: "violet",
  HACK: "amber",
  XXX: "amber",
};

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

type Override = { title?: string; priority?: "low" | "medium" | "high" };

export function TodosPage({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const [view, setView] = useState<TodoOverview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>("promotable");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  async function load() {
    try {
      setView(await api.getTodos());
      setError(null);
    } catch (err) {
      setError(err);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const items = useMemo(
    () => (view?.items ?? []).filter((t) => t.state === tab && !t.lowSignal),
    [view, tab],
  );

  // Grouped by area: a flat list of sixty rows is the chore this replaces.
  const groups = useMemo(() => {
    const byArea = new Map<string, TodoView[]>();
    for (const item of items) {
      byArea.set(item.area, [...(byArea.get(item.area) ?? []), item]);
    }
    return [...byArea.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  // Selection is scoped to what is on screen: switching tabs must not carry a
  // stale pick into an action it does not apply to.
  const visibleSelected = useMemo(
    () => items.filter((t) => selected.has(t.fingerprint)),
    [items, selected],
  );

  function toggle(fingerprint: string, next: boolean) {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(fingerprint);
      else copy.delete(fingerprint);
      return copy;
    });
  }

  function toggleGroup(group: TodoView[], next: boolean) {
    setSelected((prev) => {
      const copy = new Set(prev);
      for (const item of group) {
        if (next) copy.add(item.fingerprint);
        else copy.delete(item.fingerprint);
      }
      return copy;
    });
  }

  async function act(fn: () => Promise<unknown>, describe: (r: never) => string) {
    setBusy(true);
    setOutcome(null);
    try {
      const result = await fn();
      setOutcome(describe(result as never));
      setSelected(new Set());
      setOverrides({});
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function promote() {
    await act(
      () =>
        api.promoteTodos({
          selections: visibleSelected.map((t) => ({
            fingerprint: t.fingerprint,
            overrides: overrides[t.fingerprint],
          })),
        }),
      (r: { promoted: unknown[]; skipped: unknown[]; failed: unknown[] }) => {
        // All three buckets, always. A partial promote that only reports its
        // successes reads as a clean run and hides the rest.
        const parts = [`${r.promoted.length} promoted`];
        if (r.skipped.length) parts.push(`${r.skipped.length} skipped`);
        if (r.failed.length) parts.push(`${r.failed.length} failed`);
        return parts.join(", ");
      },
    );
  }

  if (error) {
    return (
      <PageShell>
        <ErrorView err={error} onRetry={() => void load()} />
      </PageShell>
    );
  }

  if (!view) {
    // A static skeleton, not a pulsing one: breathing animations are on the
    // contract's hard-no list and `tests/ui-design-drift.test.ts` enforces it.
    return (
      <PageShell>
        <div className="flex h-40 items-center justify-center rounded-[16px] border border-[color:var(--line)] bg-coal-600 text-[12.5px] text-chalk-400">
          Reading the scan.
        </div>
      </PageShell>
    );
  }

  const counts = view.counts;

  return (
    <PageShell>
      <Deck>
        <Cell size="full" reason="masthead">
          <PageHero
            state={{
              value: counts.promotable,
              caption: "To review",
              tone: counts.promotable > 0 ? "amber" : "emerald",
            }}
            title="TODOs in your code"
            purpose="Your codebase already lists work. Pick the real ones and they become cards."
            actions={
              <div className="flex items-center gap-2">
                <SegmentedControl<Tab>
                  value={tab}
                  onChange={(next) => {
                    setTab(next);
                    setSelected(new Set());
                  }}
                  options={[
                    { value: "promotable", label: `To review (${counts.promotable})` },
                    { value: "on_board", label: `On the board (${counts.onBoard})` },
                    { value: "dismissed", label: `Dismissed (${counts.dismissed})` },
                  ]}
                />
              </div>
            }
            metrics={[
              { value: counts.promotable, label: "to review" },
              { value: counts.onBoard, label: "on the board", tone: "good" },
              { value: counts.lowSignal, label: "too vague" },
            ]}
            footer={
              view.stale
                ? "Scanned at an older commit. Run vibe learn to refresh."
                : `Scanned ${view.generatedAt ? new Date(view.generatedAt).toLocaleString() : "never"}.`
            }
          />
        </Cell>

        {!view.present ? (
          <Cell size="full" reason="masthead">
            <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 px-6 py-10 text-center">
              <div className="text-[13px] text-chalk-200">
                No scan yet. Learning the codebase finds the TODO markers already in it.
              </div>
              <Button
                className="mt-3"
                variant="primary"
                iconLeft={<RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />}
                onClick={() =>
                  void act(
                    () => api.refreshCodebaseMap(),
                    () => "Scanned.",
                  )
                }
              >
                Learn the codebase
              </Button>
            </div>
          </Cell>
        ) : items.length === 0 ? (
          <Cell size="full" reason="masthead">
            <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 px-6 py-10 text-center text-[13px] text-chalk-300">
              {tab === "promotable"
                ? counts.lowSignal > 0
                  ? `Nothing left to review. ${counts.lowSignal} marker${counts.lowSignal === 1 ? " was" : "s were"} too vague to offer, like "// TODO: fix".`
                  : "Nothing left to review."
                : tab === "on_board"
                  ? "Nothing has been promoted yet."
                  : "Nothing is dismissed."}
            </div>
          </Cell>
        ) : (
          <Cell size="full" reason="masthead">
            <div className="flex flex-col gap-3">
              {groups.map(([area, group]) => {
                const allPicked = group.every((t) => selected.has(t.fingerprint));
                const somePicked = group.some((t) => selected.has(t.fingerprint));
                return (
                  <section
                    key={area}
                    className="overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-600"
                  >
                    <header className="flex items-center gap-2.5 border-b border-[color:var(--line)] px-3 py-2">
                      {tab === "promotable" ? (
                        <Checkbox
                          checked={allPicked}
                          indeterminate={somePicked && !allPicked}
                          onChange={(next) => toggleGroup(group, next)}
                          label={`Select every TODO in ${area}`}
                        />
                      ) : null}
                      <span className="mono text-[12px] font-semibold text-chalk-200">
                        {area}
                      </span>
                      <span className="text-[11.5px] text-chalk-400">
                        {group.length} marker{group.length === 1 ? "" : "s"}
                      </span>
                    </header>
                    <div className="divide-y divide-[color:var(--line-soft)]">
                      {group.map((item) => {
                        const picked = selected.has(item.fingerprint);
                        const ov = overrides[item.fingerprint] ?? {};
                        return (
                          <div
                            key={item.fingerprint}
                            className="flex items-start gap-2.5 px-3 py-2.5"
                          >
                            {tab === "promotable" ? (
                              <Checkbox
                                checked={picked}
                                onChange={(next) => toggle(item.fingerprint, next)}
                                label={item.suggestedTitle}
                                className="mt-1"
                              />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Chip
                                  contained
                                  tone={MARKER_TONE[item.marker] ?? "neutral"}
                                >
                                  {item.marker}
                                </Chip>
                                {picked ? (
                                  <input
                                    value={ov.title ?? item.suggestedTitle}
                                    onChange={(e) =>
                                      setOverrides((prev) => ({
                                        ...prev,
                                        [item.fingerprint]: {
                                          ...prev[item.fingerprint],
                                          title: e.target.value,
                                        },
                                      }))
                                    }
                                    aria-label="Card title"
                                    className={INPUT}
                                  />
                                ) : (
                                  <span className="min-w-0 flex-1 truncate text-[13px] text-chalk-100">
                                    {item.suggestedTitle}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                <span className="mono text-[11.5px] text-chalk-400">
                                  {item.path}:{item.line}
                                </span>
                                {item.taskId ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenTask(item.taskId!)}
                                    className="inline-flex items-center gap-1 text-[11.5px] text-violet-soft hover:underline"
                                  >
                                    Open card
                                    <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {picked ? (
                              <Select
                                value={ov.priority ?? item.suggestedPriority}
                                onChange={(value) =>
                                  setOverrides((prev) => ({
                                    ...prev,
                                    [item.fingerprint]: {
                                      ...prev[item.fingerprint],
                                      priority: value as "low" | "medium" | "high",
                                    },
                                  }))
                                }
                                options={PRIORITIES}
                                ariaLabel="Card priority"
                                className="w-28 shrink-0"
                              />
                            ) : (
                              <StatTile
                                value={item.suggestedPriority}
                                label="priority"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </Cell>
        )}

        {view.notes.length > 0 ? (
          <Cell size="full" reason="masthead">
            <div className="rounded-[12px] border border-amber-soft/40 bg-amber-soft/10 px-3 py-2 text-[12px] text-amber-soft">
              {view.notes.map((n, i) => (
                <div key={i}>{n}</div>
              ))}
            </div>
          </Cell>
        ) : null}
      </Deck>

      {/* Action bar appears only with a selection, so the page is calm at rest.
        * The right padding clears the floating consult orb, which sits in the
        * same bottom-right corner and otherwise covers the primary button. */}
      {visibleSelected.length > 0 ? (
        <div className="sticky bottom-4 mt-4 flex items-center gap-2 rounded-[14px] border border-[color:var(--line-strong)] bg-coal-700 py-2.5 pl-3 pr-20">
          <span className="text-[12.5px] text-chalk-200">
            {visibleSelected.length} selected
          </span>
          <div className="flex-1" />
          {tab === "promotable" ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void act(
                    () =>
                      api.dismissTodos(visibleSelected.map((t) => t.fingerprint)),
                    () => `${visibleSelected.length} dismissed`,
                  )
                }
              >
                Dismiss
              </Button>
              <Button variant="primary" size="sm" disabled={busy} onClick={promote}>
                {busy ? "Promoting…" : `Promote ${visibleSelected.length}`}
              </Button>
            </>
          ) : tab === "dismissed" ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                void act(
                  () =>
                    api.undismissTodos(visibleSelected.map((t) => t.fingerprint)),
                  () => `${visibleSelected.length} brought back`,
                )
              }
            >
              Bring back
            </Button>
          ) : null}
        </div>
      ) : null}

      {outcome ? (
        <div className="mt-3 text-[12.5px] text-chalk-300">{outcome}</div>
      ) : null}
    </PageShell>
  );
}
