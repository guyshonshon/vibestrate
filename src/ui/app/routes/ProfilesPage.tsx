import { useEffect, useState } from "react";
import { Cpu, Save, SlidersHorizontal } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ProfileView } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { SectionEyebrow } from "../../components/design/SectionEyebrow.js";
import { cn } from "../../components/design/cn.js";

type Toast = { kind: "ok" | "err"; text: string } | null;

const INPUT_CLS =
  "rounded-md border border-white/10 bg-ink-200/70 px-2 py-1.5 text-[12.5px] text-fog-100 outline-none focus:border-violet-soft/40 w-full";

// A Profile's editable shape (strings for form inputs; "" = null).
type Draft = {
  provider: string;
  label: string;
  model: string;
  power: string;
  budget: string;
  maxTokens: string;
  timeoutMs: string;
};

function toDraft(p: ProfileView): Draft {
  return {
    provider: p.provider,
    label: p.label,
    model: p.model ?? "",
    power: p.power ?? "",
    budget: p.budget ?? "",
    maxTokens: p.maxTokens === null ? "" : String(p.maxTokens),
    timeoutMs: p.timeoutMs === null ? "" : String(p.timeoutMs),
  };
}

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileView[] | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  async function load() {
    try {
      const [profRes, meta] = await Promise.all([
        api.getProfiles(),
        api.getProjectMetadata().catch(() => null),
      ]);
      setProfiles(profRes.profiles);
      const fromMeta = meta?.providers.map((p) => p.id) ?? [];
      const fromProfiles = profRes.profiles.map((p) => p.provider);
      setProviders([...new Set([...fromMeta, ...fromProfiles])].sort());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function flash(t: Toast) {
    setToast(t);
    if (t) window.setTimeout(() => setToast(null), 3200);
  }

  return (
    <div className="relative z-10 mx-auto max-w-[980px] px-8 pt-6 pb-16 fade-up">
      <section className="mt-1">
        <div className="eyebrow mb-1.5 flex items-center gap-1.5">
          <SlidersHorizontal className="h-3 w-3" strokeWidth={1.8} /> Profiles
        </div>
        <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
          Runtime profiles
        </h1>
        <p className="text-fog-300 text-[13px] mt-1.5 max-w-[70ch]">
          A <strong className="text-fog-100">Profile</strong> is how strong and
          expensive a role runs — it picks a Provider plus model, power, and
          budget. Crew roles point at a profile; reuse one across roles, or make
          a stronger one for heavier seats. Power is provider-specific.
        </p>
      </section>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {!profiles ? (
        <div className="mt-6 text-fog-400 text-[13px]">Loading profiles…</div>
      ) : profiles.length === 0 ? (
        <div className="mt-6 text-fog-400 text-[13px]">
          No profiles configured. Add one under <span className="mono">profiles:</span>{" "}
          in <span className="mono">.vibestrate/project.yml</span>.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              providers={providers}
              onSaved={() => void load()}
              onFlash={flash}
            />
          ))}
        </div>
      )}

      {toast ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-30 rounded-lg border px-3.5 py-2 text-[12.5px] shadow-2xl",
            toast.kind === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/30 bg-rose-500/10 text-rose-200",
          )}
        >
          {toast.kind === "ok" ? "✓ " : "✗ "}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

function ProfileCard({
  profile,
  providers,
  onSaved,
  onFlash,
}: {
  profile: ProfileView;
  providers: string[];
  onSaved: () => void;
  onFlash: (t: Toast) => void;
}) {
  const [draft, setDraft] = useState<Draft>(toDraft(profile));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(profile));

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const num = (s: string): number | null => {
        const t = s.trim();
        if (t === "") return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
      };
      await api.patchProfile(profile.id, {
        provider: draft.provider,
        label: draft.label.trim() || profile.id,
        model: draft.model.trim() || null,
        power: draft.power.trim() || null,
        budget: draft.budget.trim() || null,
        maxTokens: num(draft.maxTokens),
        timeoutMs: num(draft.timeoutMs),
      });
      onFlash({ kind: "ok", text: `Saved profile ${profile.id}.` });
      onSaved();
    } catch (err) {
      onFlash({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass rounded-xl border border-white/[0.08] p-4">
      <SectionEyebrow
        right={
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]",
              profile.providerConfigured
                ? "border-white/10 bg-ink-200/40 text-fog-300"
                : "border-rose-400/30 bg-rose-500/10 text-rose-300",
            )}
          >
            <Cpu className="h-3 w-3 text-violet-soft" strokeWidth={1.7} />
            {profile.provider}
            {!profile.providerConfigured ? " (not set up)" : ""}
          </span>
        }
      >
        {profile.id}
      </SectionEyebrow>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <FormField label="Provider">
          <select
            value={draft.provider}
            onChange={(e) => set("provider", e.target.value)}
            className={INPUT_CLS}
          >
            {[...new Set([...providers, draft.provider])].map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Label">
          <input
            value={draft.label}
            onChange={(e) => set("label", e.target.value)}
            placeholder={profile.id}
            className={INPUT_CLS}
          />
        </FormField>
        <FormField label="Model">
          <input
            value={draft.model}
            onChange={(e) => set("model", e.target.value)}
            placeholder="provider default"
            className={INPUT_CLS}
          />
        </FormField>
        <FormField label="Power" hint="provider-specific (e.g. balanced / deep)">
          <input
            value={draft.power}
            onChange={(e) => set("power", e.target.value)}
            placeholder="none"
            className={INPUT_CLS}
          />
        </FormField>
        <FormField label="Budget">
          <select
            value={draft.budget}
            onChange={(e) => set("budget", e.target.value)}
            className={INPUT_CLS}
          >
            {["", "low", "medium", "high"].map((b) => (
              <option key={b || "none"} value={b}>
                {b || "—"}
              </option>
            ))}
            {!["", "low", "medium", "high"].includes(draft.budget) ? (
              <option value={draft.budget}>{draft.budget}</option>
            ) : null}
          </select>
        </FormField>
        <FormField label="Max tokens">
          <input
            value={draft.maxTokens}
            onChange={(e) => set("maxTokens", e.target.value)}
            inputMode="numeric"
            placeholder="—"
            className={INPUT_CLS}
          />
        </FormField>
        <FormField label="Timeout (ms)">
          <input
            value={draft.timeoutMs}
            onChange={(e) => set("timeoutMs", e.target.value)}
            inputMode="numeric"
            placeholder="—"
            className={INPUT_CLS}
          />
        </FormField>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant={dirty ? "primary" : "ghost"}
          disabled={!dirty || saving}
          onClick={() => void save()}
          iconLeft={<Save className="h-3 w-3" />}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      {children}
      {hint ? <span className="text-[10px] text-fog-500">{hint}</span> : null}
    </label>
  );
}
