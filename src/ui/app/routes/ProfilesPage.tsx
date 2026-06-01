import { useEffect, useState } from "react";
import { Copy, Cpu, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ProfileView, ProviderCatalog } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { SectionEyebrow } from "../../components/design/SectionEyebrow.js";
import { SuggestInput } from "../../components/design/SuggestInput.js";
import { cn } from "../../components/design/cn.js";

const EMPTY_CAPS = { models: [], powerLevels: [], budgetLevels: ["low", "medium", "high"] };

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

const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileView[] | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<ProviderCatalog>({});
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const [profRes, meta, cat] = await Promise.all([
        api.getProfiles(),
        api.getProjectMetadata().catch(() => null),
        api.getProviderCatalog().catch(() => ({ catalog: {} as ProviderCatalog })),
      ]);
      setProfiles(profRes.profiles);
      setCatalog(cat.catalog);
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

  // Group by provider so "claude" presets (claude, claude-cheap, …) sit together.
  const groups = new Map<string, ProfileView[]>();
  for (const p of profiles ?? []) {
    const list = groups.get(p.provider) ?? [];
    list.push(p);
    groups.set(p.provider, list);
  }
  const groupedProviders = [...groups.keys()].sort();

  return (
    <div className="relative z-10 mx-auto max-w-[980px] px-8 pt-6 pb-16 fade-up">
      <section className="mt-1 flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow mb-1.5 flex items-center gap-1.5">
            <SlidersHorizontal className="h-3 w-3" strokeWidth={1.8} /> Profiles
          </div>
          <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
            Runtime presets
          </h1>
          <p className="text-fog-300 text-[13px] mt-1.5 max-w-[70ch]">
            A <strong className="text-fog-100">Profile</strong> is a reusable preset
            of how strong and expensive a run is - a provider plus model, power, and
            budget. Keep several per provider (say <span className="mono">claude</span>{" "}
            and <span className="mono">claude-cheap</span>); Crew roles point at one.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus size={13} />}
          onClick={() => setCreating((v) => !v)}
        >
          New profile
        </Button>
      </section>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {creating ? (
        <CreateProfile
          providers={providers}
          catalog={catalog}
          existingIds={new Set((profiles ?? []).map((p) => p.id))}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
          onFlash={flash}
        />
      ) : null}

      {!profiles ? (
        <div className="mt-6 text-fog-400 text-[13px]">Loading profiles…</div>
      ) : profiles.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-ink-100/50 px-5 py-8 text-center">
          <p className="text-[13.5px] text-fog-300">No profiles yet.</p>
          <p className="mx-auto mt-1 max-w-[48ch] text-[12.5px] text-fog-500">
            Create one to give your crew's roles a provider, model, and budget to run
            on.
          </p>
          <div className="mt-4 flex justify-center">
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus size={13} />}
              onClick={() => setCreating(true)}
            >
              New profile
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-7 space-y-7">
          {groupedProviders.map((prov) => (
            <div key={prov}>
              <div className="mb-2.5 flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.7} />
                <span className="mono text-[12.5px] text-fog-200">{prov}</span>
                <span className="text-[11.5px] text-fog-500">
                  {groups.get(prov)!.length} preset
                  {groups.get(prov)!.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-3">
                {groups.get(prov)!.map((p) => (
                  <ProfileCard
                    key={p.id}
                    profile={p}
                    providers={providers}
                    catalog={catalog}
                    onSaved={() => void load()}
                    onFlash={flash}
                  />
                ))}
              </div>
            </div>
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
          {toast.kind === "ok" ? "Saved " : "Error "}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

function CreateProfile({
  providers,
  catalog,
  existingIds,
  onCancel,
  onCreated,
  onFlash,
}: {
  providers: string[];
  catalog: ProviderCatalog;
  existingIds: Set<string>;
  onCancel: () => void;
  onCreated: () => void;
  onFlash: (t: Toast) => void;
}) {
  const [id, setId] = useState("");
  const [draft, setDraft] = useState<Draft>({
    provider: providers[0] ?? "",
    label: "",
    model: "",
    power: "",
    budget: "",
    maxTokens: "",
    timeoutMs: "",
  });
  const [busy, setBusy] = useState(false);
  const caps = catalog[draft.provider] ?? EMPTY_CAPS;
  const idTaken = existingIds.has(id.trim());
  const valid = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id.trim()) && !idTaken && !!draft.provider;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function create() {
    setBusy(true);
    try {
      await api.createProfile({
        id: id.trim(),
        provider: draft.provider,
        label: draft.label.trim() || undefined,
        model: draft.model.trim() || undefined,
        power: draft.power.trim() || undefined,
        budget: draft.budget.trim() || undefined,
        maxTokens: numOrNull(draft.maxTokens) ?? undefined,
        timeoutMs: numOrNull(draft.timeoutMs) ?? undefined,
      });
      onFlash({ kind: "ok", text: `Created profile ${id.trim()}.` });
      onCreated();
    } catch (err) {
      onFlash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 glass rounded-xl border border-violet-soft/25 p-4">
      <div className="eyebrow mb-3">New profile</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FormField label="Id" hint={idTaken ? "id already exists" : "e.g. claude-cheap"}>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="claude-cheap"
            className={cn(INPUT_CLS, idTaken && "border-rose-400/40")}
            autoFocus
          />
        </FormField>
        <FormField label="Provider">
          <select
            value={draft.provider}
            onChange={(e) => set("provider", e.target.value)}
            className={INPUT_CLS}
          >
            {providers.length === 0 ? <option value="">(no providers)</option> : null}
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Label">
          <input value={draft.label} onChange={(e) => set("label", e.target.value)} placeholder={id || "optional"} className={INPUT_CLS} />
        </FormField>
        <FormField label="Model">
          <SuggestInput value={draft.model} onChange={(v) => set("model", v)} suggestions={caps.models} placeholder="provider default" className={INPUT_CLS} />
        </FormField>
        <FormField label="Power" hint={caps.powerLevels.length ? "provider-specific" : "this provider has no effort levels"}>
          <SuggestInput value={draft.power} onChange={(v) => set("power", v)} suggestions={caps.powerLevels} placeholder="none" className={INPUT_CLS} />
        </FormField>
        <FormField label="Budget">
          <select value={draft.budget} onChange={(e) => set("budget", e.target.value)} className={INPUT_CLS}>
            {["", ...caps.budgetLevels].map((b) => (
              <option key={b || "none"} value={b}>{b || "-"}</option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={!valid || busy} onClick={() => void create()} iconLeft={<Plus className="h-3 w-3" />}>
          {busy ? "Creating…" : "Create profile"}
        </Button>
      </div>
    </div>
  );
}

function ProfileCard({
  profile,
  providers,
  catalog,
  onSaved,
  onFlash,
}: {
  profile: ProfileView;
  providers: string[];
  catalog: ProviderCatalog;
  onSaved: () => void;
  onFlash: (t: Toast) => void;
}) {
  const [draft, setDraft] = useState<Draft>(toDraft(profile));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(profile));
  const usedBy = profile.usedBy ?? [];
  const caps = catalog[draft.provider] ?? EMPTY_CAPS;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await api.patchProfile(profile.id, {
        provider: draft.provider,
        label: draft.label.trim() || profile.id,
        model: draft.model.trim() || null,
        power: draft.power.trim() || null,
        budget: draft.budget.trim() || null,
        maxTokens: numOrNull(draft.maxTokens),
        timeoutMs: numOrNull(draft.timeoutMs),
      });
      onFlash({ kind: "ok", text: `Saved profile ${profile.id}.` });
      onSaved();
    } catch (err) {
      onFlash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    const newId = window.prompt(`Duplicate "${profile.id}" as:`, `${profile.id}-copy`);
    if (!newId) return;
    try {
      await api.duplicateProfile(profile.id, { newId: newId.trim() });
      onFlash({ kind: "ok", text: `Duplicated to ${newId.trim()}.` });
      onSaved();
    } catch (err) {
      onFlash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function remove() {
    const inUse = usedBy.length > 0;
    const msg = inUse
      ? `"${profile.id}" is used by ${usedBy.length} role(s) (${usedBy
          .map((u) => `${u.crewId}/${u.roleId}`)
          .join(", ")}). Delete anyway? Those roles will need a new profile.`
      : `Delete profile "${profile.id}"?`;
    if (!window.confirm(msg)) return;
    try {
      await api.deleteProfile(profile.id, { force: inUse });
      onFlash({ kind: "ok", text: `Deleted ${profile.id}.` });
      onSaved();
    } catch (err) {
      onFlash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="glass rounded-xl border border-white/[0.08] p-4">
      <SectionEyebrow
        right={
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]",
              usedBy.length > 0
                ? "border-white/10 bg-ink-200/40 text-fog-300"
                : "border-white/10 bg-ink-200/40 text-fog-500",
            )}
            title={usedBy.map((u) => `${u.crewId}/${u.roleId}`).join(", ") || "not used by any role"}
          >
            {usedBy.length > 0
              ? `used by ${usedBy.length} role${usedBy.length === 1 ? "" : "s"}`
              : "unused"}
          </span>
        }
      >
        {profile.id}
      </SectionEyebrow>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <FormField label="Provider">
          <select value={draft.provider} onChange={(e) => set("provider", e.target.value)} className={INPUT_CLS}>
            {[...new Set([...providers, draft.provider])].map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Label">
          <input value={draft.label} onChange={(e) => set("label", e.target.value)} placeholder={profile.id} className={INPUT_CLS} />
        </FormField>
        <FormField label="Model">
          <SuggestInput value={draft.model} onChange={(v) => set("model", v)} suggestions={caps.models} placeholder="provider default" className={INPUT_CLS} />
        </FormField>
        <FormField label="Power" hint={caps.powerLevels.length ? "provider-specific (e.g. balanced / deep)" : "this provider has no effort levels"}>
          <SuggestInput value={draft.power} onChange={(v) => set("power", v)} suggestions={caps.powerLevels} placeholder="none" className={INPUT_CLS} />
        </FormField>
        <FormField label="Budget">
          <select value={draft.budget} onChange={(e) => set("budget", e.target.value)} className={INPUT_CLS}>
            {["", ...caps.budgetLevels].map((b) => (
              <option key={b || "none"} value={b}>{b || "-"}</option>
            ))}
            {![...caps.budgetLevels, ""].includes(draft.budget) ? (
              <option value={draft.budget}>{draft.budget}</option>
            ) : null}
          </select>
        </FormField>
        <FormField label="Max tokens">
          <input value={draft.maxTokens} onChange={(e) => set("maxTokens", e.target.value)} inputMode="numeric" placeholder="-" className={INPUT_CLS} />
        </FormField>
        <FormField label="Timeout (ms)">
          <input value={draft.timeoutMs} onChange={(e) => set("timeoutMs", e.target.value)} inputMode="numeric" placeholder="-" className={INPUT_CLS} />
        </FormField>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => void duplicate()} iconLeft={<Copy className="h-3 w-3" />}>
          Duplicate
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void remove()} iconLeft={<Trash2 className="h-3 w-3" />}>
          Delete
        </Button>
        <Button size="sm" variant={dirty ? "primary" : "ghost"} disabled={!dirty || saving} onClick={() => void save()} iconLeft={<Save className="h-3 w-3" />}>
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
