import { useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, Check, Trash2, Plus, X } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  PersonaSummary,
  SupervisorArchetypeView,
} from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { StatTile } from "../../components/design/StatTile.js";
import {
  PageShell,
  PageHeader,
  Section,
} from "../../components/layout/PageShell.js";
import { cn } from "../../components/design/cn.js";

type Toast = { kind: "ok" | "err"; text: string } | null;

/**
 * Supervisors - the authoring surface for supervisor personas (the orchestrator's
 * judgment posture). Browse the resolved catalog (built-ins + project) and:
 *  - set the project's default supervisor,
 *  - remove a project (non-built-in) persona,
 *  - adopt a curated archetype (writes a persona into project.yml).
 * Every write mirrors a `vibe supervisor` subcommand over the same service; the
 * client only ever sends an id (persona definitions are server-owned).
 */
export function SupervisorsPage() {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [archetypes, setArchetypes] = useState<SupervisorArchetypeView[]>([]);
  const [defaultPersona, setDefaultPersona] = useState<string>("staff-engineer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  function flash(t: Toast) {
    setToast(t);
    if (t) window.setTimeout(() => setToast(null), 3200);
  }

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const [cat, arch] = await Promise.all([
        api.listPersonas(),
        api.getSupervisorArchetypes().catch(() => ({ archetypes: [] })),
      ]);
      setPersonas(cat.personas);
      setDefaultPersona(cat.defaultPersona);
      setArchetypes(arch.archetypes);
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

  async function adopt(id: string) {
    setAction(`adopt:${id}`);
    try {
      await api.adoptArchetype(id);
      flash({ kind: "ok", text: `Adopted "${id}" into your supervisors.` });
      await load();
    } catch (e) {
      flash({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setAction(null);
    }
  }

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
          suggests. Set the project default here or adopt a curated archetype;
          pick one per run on the compose page. The same actions back{" "}
          <span className="mono text-chalk-100">vibe supervisor</span>.
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
      ) : (
        <>
          <Section title="Active supervisors">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {personas.map((p) => (
                <PersonaCard
                  key={p.id}
                  persona={p}
                  isDefault={p.id === defaultPersona}
                  settingDefault={action === `default:${p.id}`}
                  removing={action === `remove:${p.id}`}
                  onSetDefault={() => void makeDefault(p.id)}
                  onRemove={() => void remove(p.id)}
                />
              ))}
            </div>
          </Section>

          <ArchetypeGallery
            archetypes={archetypes}
            adoptingId={
              action?.startsWith("adopt:") ? action.slice("adopt:".length) : null
            }
            onAdopt={(id) => void adopt(id)}
          />
        </>
      )}

      {toast ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[12.5px] shadow-2xl",
            toast.kind === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/30 bg-rose-500/10 text-rose-200",
          )}
        >
          {toast.kind === "ok" ? (
            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          )}
          {toast.text}
        </div>
      ) : null}
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

      <div className="mt-4 flex items-center gap-1.5 border-t border-[color:var(--line-soft)] pt-3">
        {isDefault ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-400">
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

// ─── Archetype gallery (adopt a curated supervisor) ─────────────────────────

function ArchetypeGallery({
  archetypes,
  adoptingId,
  onAdopt,
}: {
  archetypes: SupervisorArchetypeView[];
  adoptingId: string | null;
  onAdopt: (id: string) => void;
}) {
  if (archetypes.length === 0) return null;
  return (
    <Section title="Archetypes">
      <p className="mb-3 max-w-[74ch] text-[13px] leading-[1.55] text-chalk-300">
        Curated supervisors, ready to adopt. Adopting one writes a{" "}
        <span className="mono text-chalk-100">personas:</span> entry into{" "}
        <span className="mono text-chalk-100">project.yml</span> - then set it as
        your default above or pick it per run.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {archetypes.map((a) => {
          const tiles: { value: string; label: string }[] = [
            {
              value: a.reviewLenses.join(", "),
              label: a.reviewLenses.length === 1 ? "review lens" : "review lenses",
            },
            ...(a.prefersFlows.length
              ? [{ value: a.prefersFlows.join(", "), label: "prefers flow" }]
              : []),
            ...(a.prefersPosture
              ? [{ value: a.prefersPosture, label: "suggests posture" }]
              : []),
          ];
          return (
            <div
              key={a.id}
              className="flex flex-col rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className="h-4 w-4 shrink-0 text-violet-soft"
                  strokeWidth={1.9}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-chalk-100">
                  {a.label}
                </span>
                {a.adopted ? (
                  <span className="shrink-0 text-[11px] font-semibold text-emerald-400">
                    adopted
                  </span>
                ) : null}
              </div>
              {a.description ? (
                <p className="mt-2 line-clamp-3 text-[12px] leading-snug text-chalk-300">
                  {a.description}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-stretch gap-1">
                {tiles.map((t, i) => (
                  <StatTile key={i} value={t.value} label={t.label} />
                ))}
              </div>
              <div className="mt-3.5 flex items-center gap-1.5 border-t border-[color:var(--line-soft)] pt-3">
                {a.adopted ? (
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-400">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
                    In your supervisors
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={adoptingId === a.id}
                    iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
                    onClick={() => onAdopt(a.id)}
                  >
                    {adoptingId === a.id ? "Adopting…" : "Adopt"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
