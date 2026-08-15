import { useEffect, useState } from "react";
import { RefreshCw, Check, Trash2, Plus } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  PersonaSummary,
  SupervisorArchetypeView,
} from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { ErrorView } from "../../lib/error-view.js";
import { settle } from "../../lib/settled.js";
import { StatTile } from "../../components/design/StatTile.js";
import { PageShell } from "../../components/layout/PageShell.js";
import { Deck, Cell } from "../../components/layout/Deck.js";
import { PageHero } from "../../components/layout/PageHero.js";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonText,
} from "../../components/design/Skeleton.js";
import { HeroNumber } from "./page-skeletons.js";
import { cn } from "../../components/design/cn.js";
import { useToast, ToastView } from "../../components/design/useToast.js";

/**
 * Supervisors - the authoring surface for supervisor personas (the orchestrator's
 * judgment posture). Browse the resolved catalog (built-ins + project) and:
 *  - set the project's default supervisor,
 *  - remove a project (non-built-in) persona,
 *  - adopt a curated archetype (writes a persona into project.yml).
 * Every write mirrors a `vibe supervisor` subcommand over the same service; the
 * client only ever sends an id (persona definitions are server-owned).
 */
export function SupervisorsPage({ onAddSupervisor }: { onAddSupervisor: () => void }) {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  // null = the fetch failed, which must not read as "there are none".
  const [archetypes, setArchetypes] = useState<SupervisorArchetypeView[] | null>([]);
  const [defaultPersona, setDefaultPersona] = useState<string>("staff-engineer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { toast, showToast: flash } = useToast();

  async function load() {
    setBusy(true);
    setError(null);
    try {
      // The archetype count is allowed to fail without taking the page down,
      // but a swallowed failure would render as "0 archetypes" - a claim that
      // none exist, which is the opposite of what happened.
      const [cat, arch] = await Promise.all([
        api.listPersonas(),
        settle(api.getSupervisorArchetypes()),
      ]);
      setPersonas(cat.personas);
      setDefaultPersona(cat.defaultPersona);
      setArchetypes(arch.ok ? arch.value.archetypes : null);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function makeDefault(id: string) {
    if (id === defaultPersona) return;
    setAction(`default:${id}`);
    try {
      await api.setDefaultPersona(id);
      setDefaultPersona(id);
      flash({ kind: "ok", text: `"${id}" is now the default supervisor.` });
    } catch (e) {
      flash({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setAction(null);
    }
  }

  async function remove(id: string) {
    setAction(`remove:${id}`);
    try {
      await api.removePersona(id);
      flash({ kind: "ok", text: `Removed supervisor "${id}".` });
      await load();
    } catch (e) {
      flash({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setAction(null);
    }
  }


  const defaultLabel = personas.find((p) => p.id === defaultPersona)?.label ?? null;
  const builtIns = personas.filter((p) => p.builtin).length;
  const projectOwned = personas.length - builtIns;

  return (
    <PageShell>
      <Deck>
        <Cell size="full" reason="masthead">
          <PageHero
            state={{
              value: loaded ? personas.length : <HeroNumber />,
              caption: personas.length === 1 ? "Supervisor" : "Supervisors",
              note: !loaded
                ? undefined
                : defaultLabel
                  ? `${defaultLabel} judges every run unless one is picked per run.`
                  : "One judges every run unless you pick another per run.",
              tone: "violet",
            }}
            title="Supervisors"
            purpose="A supervisor decides how hard to check a run, and how careful to be."
            actions={
              <>
                <Button variant="primary" size="sm" onClick={onAddSupervisor}>
                  Add supervisor
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void load()}
                  iconLeft={
                    <RefreshCw
                      className={cn("h-3.5 w-3.5", busy && "animate-spin")}
                      strokeWidth={1.9}
                    />
                  }
                >
                  {busy ? "Refreshing…" : "Refresh"}
                </Button>
              </>
            }
            metrics={[
              { value: loaded ? personas.length : <HeroNumber />, label: "available" },
              { value: loaded ? builtIns : <HeroNumber />, label: "built-in" },
              { value: loaded ? projectOwned : <HeroNumber />, label: "project" },
              {
                value: !loaded ? (
                  <HeroNumber />
                ) : archetypes ? (
                  archetypes.length
                ) : (
                  "-"
                ),
                label: "archetypes",
              },
            ]}
            footer={
              !loaded
                ? "Pick a different supervisor per run on the compose page."
                : defaultLabel
                  ? `Default: ${defaultLabel}. Pick a different one per run on the compose page.`
                  : "No default set - the built-in staff engineer judges every run."
            }
          />
        </Cell>

        {error ? (
          <Cell size="full" reason="masthead">
            <ErrorView compact err={error} onRetry={() => void load()} />
          </Cell>
        ) : null}

        {!loaded && !error ? (
          <Cell size="full" reason="nested-deck">
            <Skeleton label="Loading supervisors">
              <Deck align="stretch">
                {[0, 1, 2].map((i) => (
                  <Cell key={i} size="card">
                    {/* min-h matches PersonaCard, so the row keeps its height
                     * when the real cards replace these. */}
                    <div className="flex min-h-[188px] flex-col gap-3 rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-5 py-6">
                      <SkeletonBlock h={18} w="52%" />
                      <SkeletonText lines={3} size={13} />
                      <div className="mt-auto flex gap-2">
                        <SkeletonBlock w={88} h={28} bordered />
                        <SkeletonBlock w={64} h={28} bordered />
                      </div>
                    </div>
                  </Cell>
                ))}
              </Deck>
            </Skeleton>
          </Cell>
        ) : (
          <>
            {personas.map((p) => (
              <Cell key={p.id} size="card">
                <PersonaCard
                  persona={p}
                  isDefault={p.id === defaultPersona}
                  settingDefault={action === `default:${p.id}`}
                  removing={action === `remove:${p.id}`}
                  onSetDefault={() => void makeDefault(p.id)}
                  onRemove={() => void remove(p.id)}
                />
              </Cell>
            ))}

            {/* The add affordance sits IN the collection, as the next card in the
             * row, so adding reads as part of the set rather than an action
             * stranded in the header. */}
            <Cell size="card">
              <button
                type="button"
                onClick={onAddSupervisor}
                className="flex h-full min-h-[188px] w-full flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-[color:var(--line-strong)] bg-transparent px-5 py-6 text-center transition hover:border-violet-soft/50 hover:bg-violet-soft/[0.06]"
              >
                <Plus className="h-5 w-5 text-violet-soft" strokeWidth={2} />
                <span className="text-[16px] font-semibold text-chalk-100">
                  Add supervisor
                </span>
                <span className="max-w-[34ch] text-[13px] leading-[1.45] text-chalk-300">
                  Start from a curated archetype, or write your own judgment posture.
                </span>
              </button>
            </Cell>
          </>
        )}
      </Deck>

      <ToastView toast={toast} />
    </PageShell>
  );
}

function PersonaCard({
  persona: p,
  isDefault,
  settingDefault,
  removing,
  onSetDefault,
  onRemove,
}: {
  persona: PersonaSummary;
  isDefault: boolean;
  settingDefault: boolean;
  removing: boolean;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  const tiles: { value: string; label: string }[] = [
    {
      value: p.reviewLenses.length ? p.reviewLenses.join(", ") : "default",
      label: p.reviewLenses.length === 1 ? "review lens" : "review lenses",
    },
    ...(p.prefersFlows && p.prefersFlows.length
      ? [{ value: p.prefersFlows.join(", "), label: "prefers flow" }]
      : []),
    ...(p.reviewerProfile
      ? [{ value: p.reviewerProfile, label: "reviewer profile" }]
      : []),
    ...(p.prefersPosture
      ? [{ value: p.prefersPosture, label: "suggests posture" }]
      : []),
  ];

  return (
    <div className="flex flex-col rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-chalk-100">
              {p.label}
            </span>
            <span className="mono text-meta text-chalk-400">{p.id}</span>
          </div>
          {p.description ? (
            <p className="mt-1 line-clamp-2 max-w-[60ch] text-[12.5px] text-chalk-300">
              {p.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2.5 text-meta font-semibold">
          {isDefault ? (
            <span className="text-emerald-400">default</span>
          ) : null}
          <span className={p.builtin ? "text-chalk-400" : "text-violet-soft"}>
            {p.builtin ? "built-in" : "project"}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-stretch gap-1">
        {tiles.map((t, i) => (
          <StatTile key={i} value={t.value} label={t.label} />
        ))}
      </div>

      {p.specUpPosture ? (
        <details className="mt-3">
          <summary className="cursor-pointer list-none text-meta font-semibold text-chalk-300 transition hover:text-chalk-100">
            Spec-up posture (aims the planning agents)
          </summary>
          <p className="mt-1.5 whitespace-pre-wrap border-l border-violet-soft/30 pl-3 text-[12px] text-chalk-300">
            {p.specUpPosture}
          </p>
        </details>
      ) : null}

      <div className="mt-4 flex items-center gap-1.5 border-t border-[color:var(--line-soft)] pt-3">
        {isDefault ? (
          <span className="inline-flex items-center gap-1.5 text-meta font-semibold text-emerald-400">
            <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
            Runs by default
          </span>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={settingDefault || removing}
            onClick={onSetDefault}
            iconLeft={<Check className="h-3.5 w-3.5" strokeWidth={2} />}
          >
            {settingDefault ? "Setting…" : "Set default"}
          </Button>
        )}
        {!p.builtin && !isDefault ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={removing || settingDefault}
            onClick={onRemove}
            iconLeft={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />}
          >
            {removing ? "Removing…" : "Remove"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
