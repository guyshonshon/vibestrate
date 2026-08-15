import { useEffect, useState } from "react";
import { ArrowLeft, Check, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../../lib/api.js";
import type { SupervisorArchetypeView } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { FormField } from "../../components/design/FormField.js";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonText,
} from "../../components/design/Skeleton.js";
import { PageShell } from "../../components/layout/PageShell.js";
import { Deck, Cell, Stack } from "../../components/layout/Deck.js";
import { PageHero } from "../../components/layout/PageHero.js";
import { ErrorView } from "../../lib/error-view.js";
import { cn } from "../../components/design/cn.js";

type Mode = "archetype" | "custom";

const POSTURES = [
  { value: "", label: "No posture preference" },
  { value: "sandbox-suggested", label: "Suggest a sandbox on risky work" },
  { value: "approval-suggested", label: "Suggest an approval gate on risky work" },
] as const;

/**
 * Author a supervisor: adopt a curated archetype, or write one.
 *
 * Both paths end at the same place - a `personas:` entry in project.yml - but
 * they are different trust classes and the page says so. An archetype's
 * definition is server-owned and only its id travels; a custom one is entirely
 * owner input, validated server-side against the persona schema and refused
 * rather than coerced.
 */
export function SupervisorNewPage({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>("archetype");
  const [archetypes, setArchetypes] = useState<SupervisorArchetypeView[]>([]);
  // "No archetypes available" is a real, actionable verdict - it must not be
  // what the page says while the catalog is still being read.
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [riskSignals, setRiskSignals] = useState("");
  const [prefersFlows, setPrefersFlows] = useState("");
  const [posture, setPosture] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const r = await api.getSupervisorArchetypes();
        setArchetypes(r.archetypes);
      } catch (e) {
        setError(e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  async function adopt(archetypeId: string) {
    setBusy(archetypeId);
    setError(null);
    try {
      await api.adoptArchetype(archetypeId);
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  const list = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  const canSave = id.trim().length > 0 && label.trim().length > 0;

  async function save() {
    setBusy("custom");
    setError(null);
    try {
      await api.createPersona(id.trim(), {
        label: label.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        riskSignals: list(riskSignals),
        prefersFlows: list(prefersFlows),
        reviewerProfile: null,
        prefersPosture: posture ? posture : null,
      });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell>
      <Deck>
        <Cell size="full" reason="masthead">
          <PageHero
            state={{
              value: <ShieldCheck className="h-9 w-9" strokeWidth={1.6} />,
              caption: "New supervisor",
              note: "Nothing is enforced until you set it as the project default, or pick it on a run.",
              tone: "violet",
            }}
            title="Add a supervisor"
            purpose="A supervisor decides how hard to check a run. Adopt one, or write your own."
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={onDone}
                iconLeft={<ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.9} />}
              >
                Back to supervisors
              </Button>
            }
            footer="Either way it lands in project.yml, for you to review."
          />
        </Cell>

        {error ? (
          <Cell size="full" reason="masthead">
            <ErrorView compact err={error} />
          </Cell>
        ) : null}

        <Cell size="full" reason="masthead">
          <div className="inline-flex items-center gap-1 rounded-[12px] border border-[color:var(--line)] bg-coal-700 p-1">
            {(["archetype", "custom"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-[9px] px-3.5 py-2 text-[13px] font-semibold transition",
                  mode === m
                    ? "bg-coal-500 text-chalk-100"
                    : "text-chalk-300 hover:text-chalk-100",
                )}
              >
                {m === "archetype" ? "From an archetype" : "Write your own"}
              </button>
            ))}
          </div>
        </Cell>

        {mode === "archetype" ? (
          !loaded ? (
            [0, 1, 2].map((i) => (
              <Cell key={i} size="card">
                <Skeleton
                  label="Loading supervisor archetypes"
                  className="flex h-full flex-col rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <SkeletonBlock w={16} h={16} radius={6} />
                    <SkeletonBlock h={16} w="52%" />
                  </div>
                  <SkeletonText className="mb-3 flex-1" lines={3} size={13} />
                  <div className="border-t border-[color:var(--line-soft)] pt-3">
                    <SkeletonBlock w={80} h={28} bordered />
                  </div>
                </Skeleton>
              </Cell>
            ))
          ) : archetypes.length === 0 ? (
            <Cell size="full" reason="masthead">
              <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-5 py-6 text-[13px] text-chalk-300">
                No archetypes available.
              </div>
            </Cell>
          ) : (
            archetypes.map((a) => (
              <Cell key={a.id} size="card">
                <div className="flex h-full flex-col rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 text-violet-soft" strokeWidth={1.9} />
                    <h3 className="text-[16px] font-semibold text-chalk-100">{a.label}</h3>
                  </div>
                  <p className="mb-3 flex-1 text-[13px] leading-[1.5] text-chalk-300">
                    {a.description}
                  </p>
                  <div className="border-t border-[color:var(--line-soft)] pt-3">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy === a.id}
                      onClick={() => void adopt(a.id)}
                      iconLeft={<Check className="h-3.5 w-3.5" strokeWidth={2} />}
                    >
                      {busy === a.id ? "Adopting…" : "Adopt"}
                    </Button>
                  </div>
                </div>
              </Cell>
            ))
          )
        ) : (
          <>
            <Cell size="wide">
              <Stack>
                <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5">
                  <h3 className="mb-4 text-[16px] font-semibold text-chalk-100">Identity</h3>
                  <div className="flex flex-col gap-4">
                    <FormField label="Id">
                      <span className="mb-1.5 block text-[13px] leading-[1.45] text-chalk-300">Letters, digits, dashes and underscores. This is what a run references.</span>
                      <input
                        value={id}
                        onChange={(e) => setId(e.target.value)}
                        placeholder="perf-hawk"
                        className="h-9 w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-3 text-[14px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
                      />
                    </FormField>
                    <FormField label="Label">
                      <span className="mb-1.5 block text-[13px] leading-[1.45] text-chalk-300">How it reads in the UI.</span>
                      <input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Performance hawk"
                        className="h-9 w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-3 text-[14px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
                      />
                    </FormField>
                    <FormField label="Description">
                      <span className="mb-1.5 block text-[13px] leading-[1.45] text-chalk-300">One line on what this posture looks at first.</span>
                      <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Hot paths, allocations, and query cost first."
                        className="h-9 w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-3 text-[14px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
                      />
                    </FormField>
                  </div>
                </div>

                <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5">
                  <h3 className="mb-1 text-[16px] font-semibold text-chalk-100">Behaviour</h3>
                  <p className="mb-4 text-[13px] leading-[1.5] text-chalk-300">
                    Risk signals only ever upgrade a run to heavier review, never
                    downgrade it, so a false match costs time rather than safety.
                  </p>
                  <div className="flex flex-col gap-4">
                    <FormField label="Risk signals">
                      <span className="mb-1.5 block text-[13px] leading-[1.45] text-chalk-300">Comma separated. Lowercased substrings of the task text.</span>
                      <input
                        value={riskSignals}
                        onChange={(e) => setRiskSignals(e.target.value)}
                        placeholder="cache, hot path, query"
                        className="h-9 w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-3 text-[14px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
                      />
                    </FormField>
                    <FormField label="Preferred flows">
                      <span className="mb-1.5 block text-[13px] leading-[1.45] text-chalk-300">Comma separated. The first available one is the upgrade target.</span>
                      <input
                        value={prefersFlows}
                        onChange={(e) => setPrefersFlows(e.target.value)}
                        placeholder="panel-review"
                        className="h-9 w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-3 text-[14px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
                      />
                    </FormField>
                    <FormField label="Suggested posture">
                      <span className="mb-1.5 block text-[13px] leading-[1.45] text-chalk-300">Advisory only. Surfaced to you, never enforced by itself.</span>
                      <select
                        value={posture}
                        onChange={(e) => setPosture(e.target.value)}
                        className="h-9 w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-3 text-[14px] text-chalk-100 focus:border-violet-soft/50 focus:outline-none"
                      >
                        {POSTURES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                  <div className="mt-5 flex items-center gap-2 border-t border-[color:var(--line-soft)] pt-4">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!canSave || busy === "custom"}
                      onClick={() => void save()}
                    >
                      {busy === "custom" ? "Saving…" : "Save supervisor"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={onDone}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Stack>
            </Cell>

            <Cell size="card">
              <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5">
                <h3 className="mb-3 text-[16px] font-semibold text-chalk-100">
                  {label.trim() || "Your supervisor"}
                </h3>
                <p className="mb-4 text-[13px] leading-[1.5] text-chalk-300">
                  {description.trim() || "No description yet."}
                </p>
                <dl className="flex flex-col gap-3 border-t border-[color:var(--line-soft)] pt-4">
                  <Preview label="id" value={id.trim() || "-"} mono />
                  <Preview
                    label="risk signals"
                    value={list(riskSignals).join(", ") || "none"}
                  />
                  <Preview
                    label="prefers flows"
                    value={list(prefersFlows).join(", ") || "none"}
                  />
                  <Preview
                    label="suggests posture"
                    value={POSTURES.find((p) => p.value === posture)?.label ?? "none"}
                  />
                </dl>
                <p className="mt-4 border-t border-[color:var(--line-soft)] pt-3 text-[13px] leading-[1.5] text-chalk-300">
                  Saving writes this into project.yml. It judges nothing until you
                  make it the default or pick it on a run.
                </p>
              </div>
            </Cell>
          </>
        )}
      </Deck>
    </PageShell>
  );
}

function Preview({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[13px] font-semibold text-violet-vivid">{label}</dt>
      <dd
        className={cn(
          "min-w-0 flex-1 text-right text-[13px] text-chalk-300",
          mono && "mono",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
