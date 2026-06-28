import { useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, Plus, X } from "lucide-react";
import { api } from "../../lib/api.js";
import type { PersonaSummary, PersonaPreference } from "../../lib/types.js";
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
              onChanged={() => void load()}
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
  onChanged,
}: {
  persona: PersonaSummary;
  isDefault: boolean;
  onChanged: () => void;
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

      <PreferencesEditor
        personaId={p.id}
        preferences={p.preferences}
        onChanged={onChanged}
      />
    </div>
  );
}

/**
 * Owner preferences the reviewer checks for (preference-gates.ts). UI parity for
 * `vibe preferences add/list/remove` - an owner add is live immediately. Optional
 * by design: a persona with none shows just the one-line add affordance.
 */
function PreferencesEditor({
  personaId,
  preferences,
  onChanged,
}: {
  personaId: string;
  preferences: PersonaPreference[];
  onChanged: () => void;
}) {
  const [statement, setStatement] = useState("");
  const [fix, setFix] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function slugId(text: string): string {
    const base = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);
    return base || `pref-${Date.now()}`;
  }

  async function add() {
    const s = statement.trim();
    if (!s) return;
    setBusy(true);
    setError(null);
    try {
      await api.addPreference(personaId, {
        id: slugId(s),
        statement: s,
        correction: fix.trim() || null,
      });
      setStatement("");
      setFix("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function mutate(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const remove = (prefId: string) => mutate(() => api.removePreference(personaId, prefId));
  const confirm = (prefId: string) => mutate(() => api.confirmPreference(personaId, prefId));
  const reject = (prefId: string) => mutate(() => api.rejectPreference(personaId, prefId));

  const pending = preferences.filter((p) => !p.confirmedAt);
  const active = preferences.filter((p) => p.confirmedAt);

  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <div className="text-[11.5px] text-violet-soft">
        Preferences the reviewer checks for
      </div>
      {preferences.length === 0 ? (
        <p className="mt-1.5 text-[11.5px] text-fog-400">
          None yet. Optional - a plain run needs none.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {pending.length > 0 ? (
            <ul className="space-y-1.5">
              {pending.map((pref) => (
                <li key={pref.id} className="flex items-start gap-2 text-[12px]">
                  <span className="mt-0.5 shrink-0 text-amber-300">proposed</span>
                  <span className="flex-1 text-fog-200">
                    {pref.statement}
                    {pref.correction ? (
                      <span className="text-fog-400"> &rarr; {pref.correction}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => void confirm(pref.id)}
                    disabled={busy}
                    className="shrink-0 border border-emerald-400/40 bg-emerald-500/10 px-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => void reject(pref.id)}
                    disabled={busy}
                    className="mt-0.5 shrink-0 text-fog-500 hover:text-rose-300 disabled:opacity-50"
                    aria-label={`Reject ${pref.id}`}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {active.length > 0 ? (
            <ul className="space-y-1.5">
              {active.map((pref) => (
                <li key={pref.id} className="flex items-start gap-2 text-[12px]">
                  <button
                    type="button"
                    onClick={() => void remove(pref.id)}
                    disabled={busy}
                    className="mt-0.5 shrink-0 text-fog-500 hover:text-rose-300 disabled:opacity-50"
                    aria-label={`Remove ${pref.id}`}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                  <span className="text-fog-200">
                    {pref.statement}
                    {pref.correction ? (
                      <span className="text-fog-400"> &rarr; {pref.correction}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <input
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="Rule, e.g. use a hyphen, not an em-dash"
          className="min-w-[200px] flex-1 border border-white/10 bg-ink-200 px-2 py-1 text-[12px] text-fog-100 placeholder:text-fog-500 focus:border-violet-soft/50 focus:outline-none"
        />
        <input
          value={fix}
          onChange={(e) => setFix(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="Fix (optional)"
          className="w-[150px] border border-white/10 bg-ink-200 px-2 py-1 text-[12px] text-fog-100 placeholder:text-fog-500 focus:border-violet-soft/50 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || !statement.trim()}
          className="flex h-[26px] items-center gap-1 border border-violet-soft/40 bg-violet-soft/10 px-2 text-[12px] text-violet-soft hover:bg-violet-soft/20 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
          Add
        </button>
      </div>
      {error ? (
        <div className="mt-1.5 text-[11.5px] text-rose-300">{error}</div>
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
