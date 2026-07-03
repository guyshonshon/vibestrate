import { useEffect, useState } from "react";
import { Copy, Cpu, Plus, Save, Trash2 } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ProfileView, ProviderCatalog } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { SuggestInput } from "../../components/design/SuggestInput.js";
import { EffortScale } from "../../components/design/EffortScale.js";
import { StatTile } from "../../components/design/StatTile.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
import { cn } from "../../components/design/cn.js";

// Contract input recipe (primitives-contract §6): rounded coal field, hairline
// border that turns violet on focus - no box-shadow ring. Shared by the native
// <select>, free-text <input>, and the SuggestInput this page renders.
const INPUT_CLS =
  "w-full rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 outline-none focus:border-violet-soft/50";

function EffortField({
  levels,
  value,
  onChange,
}: {
  levels: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-3">
      <span className="mb-1.5 block text-[11px] font-semibold text-violet-soft">
        Effort
      </span>
      {levels.length ? (
        <EffortScale levels={levels} value={value} onChange={onChange} />
      ) : (
        <span className="text-[11.5px] text-chalk-300">
          This provider exposes no effort control.
        </span>
      )}
    </div>
  );
}

const EMPTY_CAPS = { models: [], modelEnabled: false, powerLevels: [] };

type Toast = { kind: "ok" | "err"; text: string } | null;

// Per-provider accent, keyed by name hash - colour where it carries meaning
// (provider identity), like the board's tinted column headers. Only the group
// heading's icon + count carry the tone; the cards below stay neutral coal so
// the form inputs keep their contrast.
const PROVIDER_TONES = [
  "text-violet-soft",
  "text-sky-glow",
  "text-emerald-400",
  "text-amber-soft",
] as const;
function providerTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PROVIDER_TONES[h % PROVIDER_TONES.length]!;
}

// A Profile's editable shape (strings for form inputs; "" = null).
type Draft = {
  provider: string;
  label: string;
  model: string;
  power: string;
  maxTokens: string;
  timeoutMs: string;
};

function toDraft(p: ProfileView): Draft {
  return {
    provider: p.provider,
    label: p.label,
    model: p.model ?? "",
    power: p.power ?? "",
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
        api
          .getProviderCatalog()
          .catch(() => ({ catalog: {} as ProviderCatalog, overlay: { present: false, path: "" }, sources: {} })),
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
  const total = profiles?.length ?? 0;

  return (
    <PageShell className="fade-up">
      <PageHeader
        title="Profiles"
        actions={
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus size={13} />}
            onClick={() => setCreating((v) => !v)}
          >
            New profile
          </Button>
        }
      >
        {/* Contained header: what a Profile is + the running count, framed
            instead of a loose grey subtitle floating on the canvas. */}
        <div className="mt-4 rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-chalk-100">Runtime presets</h2>
            <span className="num-tabular text-[12px] text-chalk-400">
              {profiles ? total : ""}
            </span>
          </div>
          <p className="mt-1.5 max-w-[72ch] text-[13px] leading-[1.55] text-chalk-300">
            A{" "}
            <strong className="font-semibold text-chalk-100">Profile</strong> is a
            reusable preset of how strong and expensive a run is - a provider plus
            model and effort. Keep several per provider (say{" "}
            <span className="font-semibold text-chalk-100">claude</span> and{" "}
            <span className="font-semibold text-chalk-100">claude-cheap</span>);
            Crew roles point at one.
          </p>
        </div>
      </PageHeader>

      {error ? (
        <div className="mb-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
          {error} - reload the page, or check that the provider config is readable.
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
        <div className="text-[13px] text-chalk-300">Loading profiles…</div>
      ) : profiles.length === 0 ? (
        <div className="rounded-[20px] border border-[color:var(--line)] bg-coal-600 px-6 py-10 text-center">
          <p className="text-[14px] font-semibold text-chalk-100">No profiles yet.</p>
          <p className="mx-auto mt-1.5 max-w-[48ch] text-[12.5px] leading-[1.5] text-chalk-300">
            Create one to give your crew's roles a provider, model, and effort to
            run on.
          </p>
          <div className="mt-5 flex justify-center">
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus size={13} />}
              onClick={() => setCreating(true)}
            >
              Create your first profile
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {groupedProviders.map((prov) => {
            const list = groups.get(prov)!;
            const tone = providerTone(prov);
            return (
              <Section
                key={prov}
                title={
                  <span className="inline-flex items-center gap-2">
                    <Cpu className={cn("h-4 w-4", tone)} strokeWidth={1.9} aria-hidden />
                    <span>{prov}</span>
                    <span className="num-tabular text-[12px] font-medium text-chalk-400">
                      {list.length} preset{list.length === 1 ? "" : "s"}
                    </span>
                  </span>
                }
              >
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {list.map((p) => (
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
              </Section>
            );
          })}
        </div>
      )}

      {toast ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-30 rounded-[12px] border px-3.5 py-2 text-[12.5px] shadow-2xl",
            toast.kind === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/30 bg-rose-500/10 text-rose-200",
          )}
        >
          {toast.kind === "ok" ? "Saved " : "Error "}
          {toast.text}
        </div>
      ) : null}
    </PageShell>
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
    maxTokens: "",
    timeoutMs: "",
  });
  const [busy, setBusy] = useState(false);
  const caps = catalog[draft.provider] ?? EMPTY_CAPS;
  const idTaken = existingIds.has(id.trim());
  const idValid = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id.trim());
  const valid = idValid && !idTaken && !!draft.provider;

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

  // The disabled Create button states what's missing in its own label, rather
  // than a floating status sentence (primitives-contract §4).
  const missingLabel = !draft.provider
    ? "Pick a provider"
    : id.trim() === ""
      ? "Name the profile"
      : idTaken
        ? "Id already exists"
        : !idValid
          ? "Id has invalid characters"
          : null;

  return (
    <div className="mb-6 rounded-[16px] border border-[color:var(--line)] bg-coal-800 p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-violet-vivid">New profile</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <input
            value={draft.label}
            onChange={(e) => set("label", e.target.value)}
            placeholder={id || "optional"}
            className={INPUT_CLS}
          />
        </FormField>
        <FormField label="Model">
          {caps.modelEnabled ? (
            <SuggestInput
              value={draft.model}
              onChange={(v) => set("model", v)}
              suggestions={caps.models}
              placeholder="provider default"
              className={INPUT_CLS}
            />
          ) : (
            <span className="text-[11.5px] text-chalk-300">set in the provider config</span>
          )}
        </FormField>
      </div>
      <EffortField levels={caps.powerLevels} value={draft.power} onChange={(v) => set("power", v)} />
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!valid || busy}
          onClick={() => void create()}
          iconLeft={<Plus className="h-3 w-3" />}
        >
          {busy ? "Creating…" : (missingLabel ?? "Create profile")}
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

  const usedByTitle =
    usedBy.map((u) => `${u.crewId}/${u.roleId}`).join(", ") || "not used by any role";

  return (
    <div className="flex flex-col rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      {/* Header row: the profile id + a used-by fact toned by whether any role
          points at it (emerald = in use, neutral = unused). */}
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-chalk-100">
          {profile.id}
        </span>
        <span
          title={usedByTitle}
          className={cn(
            "shrink-0 text-[11px] font-semibold",
            usedBy.length > 0 ? "text-emerald-400" : "text-chalk-400",
          )}
        >
          {usedBy.length > 0
            ? `used by ${usedBy.length} role${usedBy.length === 1 ? "" : "s"}`
            : "unused"}
        </span>
      </div>

      {/* Facts as content-width stat tiles - the profile's settled shape reads
          as data, not a grey dot-separated meta line (primitives-contract §5a). */}
      <div className="mt-3 flex flex-wrap items-stretch gap-1">
        <StatTile value={draft.provider || "-"} label="provider" />
        <StatTile value={draft.model.trim() || "default"} label="model" />
        <StatTile value={draft.power.trim() || "unset"} label="effort" />
        <StatTile value={draft.maxTokens.trim() || "-"} label="max tokens" />
        <StatTile value={draft.timeoutMs.trim() || "-"} label="timeout ms" />
      </div>

      {/* Editable fields. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          {caps.modelEnabled ? (
            <SuggestInput
              value={draft.model}
              onChange={(v) => set("model", v)}
              suggestions={caps.models}
              placeholder="provider default"
              className={INPUT_CLS}
            />
          ) : (
            <span className="text-[11.5px] text-chalk-300">set in the provider config</span>
          )}
        </FormField>
        <FormField label="Max tokens">
          <input
            value={draft.maxTokens}
            onChange={(e) => set("maxTokens", e.target.value)}
            inputMode="numeric"
            placeholder="-"
            className={INPUT_CLS}
          />
        </FormField>
        <FormField label="Timeout (ms)">
          <input
            value={draft.timeoutMs}
            onChange={(e) => set("timeoutMs", e.target.value)}
            inputMode="numeric"
            placeholder="-"
            className={INPUT_CLS}
          />
        </FormField>
      </div>

      <EffortField levels={caps.powerLevels} value={draft.power} onChange={(v) => set("power", v)} />

      {/* Footer: real buttons in a bordered row. Save is the primary action
          once the draft is dirty. */}
      <div className="mt-4 flex items-center gap-1.5 border-t border-[color:var(--line-soft)] pt-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void duplicate()}
          iconLeft={<Copy className="h-3 w-3" />}
        >
          Duplicate
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void remove()}
          iconLeft={<Trash2 className="h-3 w-3" />}
        >
          Delete
        </Button>
        <div className="ml-auto">
          <Button
            size="sm"
            variant={dirty ? "primary" : "secondary"}
            disabled={!dirty || saving}
            onClick={() => void save()}
            iconLeft={<Save className="h-3 w-3" />}
          >
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
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
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-violet-soft">{label}</span>
      {children}
      {hint ? <span className="text-[10.5px] text-chalk-300">{hint}</span> : null}
    </label>
  );
}
