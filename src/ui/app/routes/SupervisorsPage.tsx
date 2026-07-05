import { useEffect, useState } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import type { PersonaSummary } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { StatTile } from "../../components/design/StatTile.js";
import {
  PageShell,
  PageHeader,
  Section,
} from "../../components/layout/PageShell.js";
import { cn } from "../../components/design/cn.js";

/**
 * Supervisors viewer - the read-only dashboard catalog of supervisor personas
 * (the orchestrator's judgment posture). Mirrors `vibe supervisor list` and the
 * run composer's selector: which personas exist, what each aims the reviewers
 * at, and which is the project default. Read-only; personas are authored in
 * `.vibestrate/project.yml` (`personas:` + `defaultPersona`).
 */
export function SupervisorsPage() {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [defaultPersona, setDefaultPersona] =
    useState<string>("staff-engineer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.listPersonas();
      setPersonas(r.personas);
      setDefaultPersona(r.defaultPersona);
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

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck
              className="h-6 w-6 text-violet-soft"
              strokeWidth={1.9}
              aria-hidden
            />
            Supervisors
          </span>
        }
        actions={
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
        }
      >
        <p className="mt-3 max-w-[74ch] text-[13px] leading-[1.55] text-chalk-300">
          The orchestrator's judgment postures. A supervisor decides how hard to
          look at a run - which lenses the independent reviewers are aimed at,
          which flow risky work is upgraded to, and the safety posture it
          suggests. Pick one per run on the compose page; set the project
          default in <span className="mono text-chalk-100">project.yml</span>.
          The same catalog backs{" "}
          <span className="mono text-chalk-100">vibe supervisor list</span>.
        </p>
      </PageHeader>

      {error ? (
        <div className="mb-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
          {error} - retry the refresh, or check{" "}
          <span className="mono text-rose-200">project.yml</span> is readable.
        </div>
      ) : null}

      {!loaded && !error ? (
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-4 py-6 text-[12.5px] text-chalk-300">
          Loading supervisors…
        </div>
      ) : personas.length === 0 && !error ? (
        // Empty state is a CTA, not a dead end - supervisors are authored in
        // project.yml, so point at the file and offer a re-scan.
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-6 py-8 text-center">
          <p className="text-[13px] text-chalk-300">
            No supervisors yet. Add a{" "}
            <span className="mono text-chalk-100">personas:</span> entry to{" "}
            <span className="mono text-chalk-100">.vibestrate/project.yml</span>,
            then re-scan to pick it up here.
          </p>
          <div className="mt-3 flex justify-center">
            <Button
              variant="primary"
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
              {busy ? "Re-scanning…" : "Re-scan project.yml"}
            </Button>
          </div>
        </div>
      ) : (
        <Section>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {personas.map((p) => (
              <PersonaCard
                key={p.id}
                persona={p}
                isDefault={p.id === defaultPersona}
              />
            ))}
          </div>
        </Section>
      )}
    </PageShell>
  );
}

function PersonaCard({
  persona: p,
  isDefault,
}: {
  persona: PersonaSummary;
  isDefault: boolean;
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
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-chalk-100">
              {p.label}
            </span>
            <span className="mono text-[11px] text-chalk-400">{p.id}</span>
          </div>
          {p.description ? (
            <p className="mt-1 line-clamp-2 max-w-[60ch] text-[12.5px] text-chalk-300">
              {p.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2.5 text-[11px] font-semibold">
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
          <summary className="cursor-pointer list-none text-[11.5px] font-semibold text-chalk-300 transition hover:text-chalk-100">
            Spec-up posture (aims the planning agents)
          </summary>
          <p className="mt-1.5 whitespace-pre-wrap border-l border-violet-soft/30 pl-3 text-[12px] text-chalk-300">
            {p.specUpPosture}
          </p>
        </details>
      ) : null}
    </div>
  );
}
