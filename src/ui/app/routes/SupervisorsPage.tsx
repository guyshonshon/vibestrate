import { useEffect, useState } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import type { PersonaSummary } from "../../lib/types.js";
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

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.listPersonas();
      setPersonas(r.personas);
      setDefaultPersona(r.defaultPersona);
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
    <div className="deep-scene relative z-10 mx-auto max-w-[1520px] px-8 pt-6 pb-16 fade-up">
      <section className="mt-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2] flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-violet-soft" strokeWidth={1.7} />
            Supervisors
          </h1>
          <p className="text-fog-300 text-[13px] mt-1.5 max-w-[72ch]">
            The orchestrator's judgment postures. A supervisor decides how hard to
            look at a run - which lenses the independent reviewers are aimed at,
            which flow risky work is upgraded to, and the safety posture it
            suggests. Pick one per run on the compose page; set the project
            default in <span className="mono">project.yml</span>. The same catalog
            backs <span className="mono">vibe supervisor list</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="mt-1 h-7 w-7 shrink-0 border border-white/10 bg-ink-200 hover:bg-ink-100 flex items-center justify-center disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5 text-fog-300", busy && "animate-spin")}
            strokeWidth={1.7}
          />
        </button>
      </section>

      {error ? (
        <div className="mt-4 border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      ) : null}

      {personas.length === 0 && !error ? (
        <div className="slab mt-6 px-4 py-6 text-[12.5px] text-fog-300">
          Loading supervisors…
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {personas.map((p) => (
            <PersonaCard
              key={p.id}
              persona={p}
              isDefault={p.id === defaultPersona}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonaCard({
  persona: p,
  isDefault,
}: {
  persona: PersonaSummary;
  isDefault: boolean;
}) {
  return (
    <div className="slab p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium text-fog-100">
              {p.label}
            </span>
            <span className="mono text-[11px] text-fog-500">{p.id}</span>
          </div>
          {p.description ? (
            <p className="mt-1 max-w-[60ch] text-[12.5px] text-fog-300">
              {p.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10.5px]">
          {isDefault ? <span className="text-emerald-300">default</span> : null}
          <span className={p.builtin ? "text-fog-500" : "text-violet-soft"}>
            {p.builtin ? "built-in" : "project"}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-[12px]">
        <Row
          label="review lenses"
          value={p.reviewLenses.length ? p.reviewLenses.join("  ·  ") : "default"}
        />
        {p.prefersFlows && p.prefersFlows.length ? (
          <Row label="prefers flow" value={p.prefersFlows.join("  ·  ")} />
        ) : null}
        {p.reviewerProfile ? (
          <Row label="reviewer profile" value={p.reviewerProfile} />
        ) : null}
        {p.prefersPosture ? (
          <Row label="suggests posture" value={p.prefersPosture} />
        ) : null}
      </div>

      {p.specUpPosture ? (
        <details className="mt-3">
          <summary className="cursor-pointer list-none text-[11.5px] text-fog-400 hover:text-fog-200">
            Spec-up posture (aims the planning agents)
          </summary>
          <p className="mt-1.5 whitespace-pre-wrap border-l border-violet-soft/30 pl-3 text-[12px] text-fog-300">
            {p.specUpPosture}
          </p>
        </details>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-32 shrink-0 text-fog-500">{label}</span>
      <span className="mono text-fog-200">{value}</span>
    </div>
  );
}
