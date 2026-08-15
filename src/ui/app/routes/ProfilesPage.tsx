import { useEffect, useRef, useState } from "react";
import { Copy, Cpu, Plus, Save, Trash2, Wrench } from "lucide-react";
import { api } from "../../lib/api.js";
import { ErrorView } from "../../lib/error-view.js";
import type {
  ProfileView,
  ProviderCatalog,
  ProviderCatalogResponse,
} from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { SuggestInput } from "../../components/design/SuggestInput.js";
import { EffortScale } from "../../components/design/EffortScale.js";
import { StatTile } from "../../components/design/StatTile.js";
import { useConfirm } from "../../components/design/ConfirmDialog.js";
import { PageShell, Section } from "../../components/layout/PageShell.js";
import { Deck, Cell } from "../../components/layout/Deck.js";
import { PageHero } from "../../components/layout/PageHero.js";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonRows,
} from "../../components/design/Skeleton.js";
import { HeroNumber } from "./page-skeletons.js";
import { cn } from "../../components/design/cn.js";
import {
  useToast,
  ToastView,
  type Toast,
} from "../../components/design/useToast.js";

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
      <span className="mb-1.5 block text-meta font-semibold text-violet-soft">
        Effort
      </span>
      {levels.length ? (
        <EffortScale levels={levels} value={value} onChange={onChange} />
      ) : (
        <span className="text-meta text-chalk-300">
          This provider exposes no effort control.
        </span>
      )}
    </div>
  );
}

const EMPTY_CAPS = { models: [], modelEnabled: false, powerLevels: [] };

type ModelListSources = ProviderCatalogResponse["sources"];

/**
 * The model field, and how hard it constrains you.
 *
 * When the provider itself produced the list - the run-start probe of its
 * bundled catalog, or an overlay the user declared - this is a picker, because
 * anything outside that list is a run that fails at launch and the server now
 * refuses to write it. When all we have is our curated fallback the field stays
 * free text: that list goes stale the day a provider ships a model, and
 * refusing an id we merely have no record of would be worse than allowing it.
 *
 * A value already on disk is always offered even when it is not in the list, so
 * opening the editor can never silently drop what is configured.
 */
function ModelField({
  models,
  derived,
  value,
  onChange,
}: {
  models: string[];
  derived: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  if (!derived || models.length === 0) {
    return (
      <SuggestInput
        value={value}
        onChange={onChange}
        suggestions={models}
        placeholder="provider default"
        className={INPUT_CLS}
      />
    );
  }
  const options = models.includes(value.trim()) || !value.trim() ? models : [value.trim(), ...models];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLS}
    >
      <option value="">provider default</option>
      {options.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}

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

// One surface for every healthy profile, so the amber below is the only thing
// that changes a card's background.
//
// Zebra striping was tried here and removed: these cards sit in a `Deck`, whose
// `card` cell packs 2 -> 3 -> 4 -> 6 per row as the page widens, so shading by
// list index tints COLUMNS, not rows. At two columns that painted the whole
// right-hand column a step lighter than the left at every row, which reads as
// "these ones are disabled". Zebra is a single-column list device (the crew
// preset list is one, and stripes correctly); on a responsive grid it cannot be
// made row-accurate without restating the Deck's breakpoint ladder here, where
// it would silently drift the day the ladder changes.
const CARD_SURFACE = "bg-coal-600";

// A profile whose model its provider does not have. Warn, not danger: nothing
// is broken until a run launches on it, and it is one dropdown away from fixed.
// Same wash the crew fit rows use, so "needs attention" looks the same app-wide.
const CARD_BROKEN = "border-amber-soft/30 bg-amber-soft/[0.06]";

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
  // Where each provider's model list came from. A list the provider itself
  // produced is picked from; a curated guess stays free text, because refusing
  // an id we merely have no record of would block every new model on release
  // day.
  const [sources, setSources] = useState<ModelListSources>({});
  const [error, setError] = useState<unknown>(null);
  const { toast, showToast: flash } = useToast();
  const [creating, setCreating] = useState(false);
  // Id of the profile the header's fix action is sending the user to. The card
  // owns the scroll and the focus (it knows where its own model control is) and
  // clears this once it has taken them, so the same button works twice.
  const [fixTarget, setFixTarget] = useState<string | null>(null);

  async function load() {
    try {
      // Safe to degrade silently: metadata and the catalog only widen the
      // provider/model dropdowns. The profiles themselves fail loudly below.
      const [profRes, meta, cat] = await Promise.all([
        api.getProfiles(),
        api.getProjectMetadata().catch(() => null),
        api
          .getProviderCatalog()
          .catch(() => ({ catalog: {} as ProviderCatalog, overlay: { present: false, path: "" }, sources: {} })),
      ]);
      setProfiles(profRes.profiles);
      setCatalog(cat.catalog);
      setSources(cat.sources);
      const fromMeta = meta?.providers.map((p) => p.id) ?? [];
      const fromProfiles = profRes.profiles.map((p) => p.provider);
      setProviders([...new Set([...fromMeta, ...fromProfiles])].sort());
      setError(null);
    } catch (err) {
      // Kept raw, not flattened to a message: describeError classifies the
      // thrown ApiError into a title, a fix and a Retry the string cannot carry.
      setError(err);
    }
  }

  useEffect(() => {
    void load();
  }, []);


  // Group by provider so "claude" profiles (claude, claude-cheap, …) sit together.
  const groups = new Map<string, ProfileView[]>();
  for (const p of profiles ?? []) {
    const list = groups.get(p.provider) ?? [];
    list.push(p);
    groups.set(p.provider, list);
  }
  const groupedProviders = [...groups.keys()].sort();
  const total = profiles?.length ?? 0;
  // A profile whose model its provider no longer has. This is drift, not a typo:
  // it can appear without anyone touching the config, when a provider ships a
  // build that drops a model.
  const broken = (profiles ?? []).filter((p) => p.modelStatus === "unknown-model");
  const first = broken[0];
  // Name the profiles, not the failure. Two ids fit; past that the header is a
  // pointer to the amber cards, not a list.
  const brokenNames =
    broken.length <= 2
      ? broken.map((p) => p.id).join(" and ")
      : `${broken[0]!.id}, ${broken[1]!.id} and ${broken.length - 2} more`;

  return (
    <PageShell className="fade-up">
      <Deck>
        <Cell size="full" reason="masthead">
          <PageHero
            state={{
              value: !profiles ? (
                <HeroNumber />
              ) : broken.length > 0 ? (
                broken.length
              ) : (
                total
              ),
              caption:
                broken.length > 0
                  ? broken.length === 1
                    ? "Broken profile"
                    : "Broken profiles"
                  : total === 1
                    ? "Profile"
                    : "Profiles",
              note: !profiles
                ? undefined
                : first
                  ? broken.length === 1
                    ? `${first.id} points at a model ${first.provider} does not have.`
                    : `${brokenNames} point at models their providers do not have.`
                  : `Across ${groupedProviders.length} provider${groupedProviders.length === 1 ? "" : "s"}. Crew roles point at one.`,
              tone: broken.length > 0 ? "amber" : "violet",
            }}
            title="Profiles"
            purpose="A profile is a model plus effort, saved to reuse. Keep a strong one and a cheap one."
            actions={
              <>
                {/* The repair, not a restatement of the fault: the fix is
                    choosing a model the provider actually has, and this puts the
                    cursor in that dropdown. It outranks "New profile" while a
                    profile is unusable, and renames itself to the next one as
                    each is fixed. */}
                {first ? (
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<Wrench size={13} />}
                    onClick={() => setFixTarget(first.id)}
                  >
                    Pick a model for {first.id}
                  </Button>
                ) : null}
                <Button
                  variant={first ? "secondary" : "primary"}
                  size="sm"
                  iconLeft={<Plus size={13} />}
                  onClick={() => setCreating((v) => !v)}
                >
                  New profile
                </Button>
              </>
            }
            metrics={[
              { value: profiles ? total : <HeroNumber />, label: "profiles" },
              {
                value: profiles ? groupedProviders.length : <HeroNumber />,
                label: "providers",
              },
              ...(broken.length
                ? [
                    {
                      value: broken.length,
                      label: "unusable",
                      tone: "warn" as const,
                    },
                  ]
                : []),
            ]}
            footer="Editing one changes every role using it, from the next run."
          />
        </Cell>

      {error ? (
        <Cell size="full" reason="masthead">
          <ErrorView err={error} compact onRetry={() => void load()} />
        </Cell>
      ) : null}

      {creating ? (
        <Cell size="full" reason="masthead">
        <CreateProfile
          providers={providers}
          catalog={catalog}
          sources={sources}
          existingIds={new Set((profiles ?? []).map((p) => p.id))}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
          onFlash={flash}
        />
        </Cell>
      ) : null}

      {!profiles ? (
        // Two provider groups of cards - the shape every non-empty project
        // resolves to - rather than one line of text under a full-height hero.
        <Cell size="full" reason="nested-deck">
          <Skeleton label="Loading profiles" className="flex flex-col gap-4">
            {[0, 1].map((group) => (
              <div key={group} className="flex flex-col gap-3">
                <SkeletonBlock h={18} w={148} />
                <Deck align="stretch">
                  {[0, 1, 2].map((i) => (
                    <Cell key={i} size="card">
                      <div className="flex min-h-[168px] flex-col gap-3 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
                        <SkeletonBlock h={16} w="56%" />
                        <SkeletonRows rows={3} meta />
                        <div className="mt-auto flex gap-2">
                          <SkeletonBlock w={72} h={26} bordered />
                          <SkeletonBlock w={56} h={26} bordered />
                        </div>
                      </div>
                    </Cell>
                  ))}
                </Deck>
              </div>
            ))}
          </Skeleton>
        </Cell>
      ) : profiles.length === 0 ? (
        <Cell size="full" reason="masthead">
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
        </Cell>
      ) : (
        groupedProviders.map((prov) => {
          const list = groups.get(prov)!;
          const tone = providerTone(prov);
          return (
            /* One provider per full-width row, its profiles as cards inside a
             * nested deck - so profiles pack 3-4 across instead of two, and a
             * provider with one profile does not strand half a row. */
            <Cell key={prov} size="full" reason="nested-deck">
              <Section
                flush
                title={
                  <span className="inline-flex items-center gap-2">
                    <Cpu className={cn("h-4 w-4", tone)} strokeWidth={1.9} aria-hidden />
                    <span>{prov}</span>
                    <span className="num-tabular text-[12px] font-medium text-chalk-400">
                      {list.length} profile{list.length === 1 ? "" : "s"}
                    </span>
                  </span>
                }
              >
                <Deck align="stretch">
                  {list.map((p) => (
                    <Cell key={p.id} size="card">
                      <ProfileCard
                        profile={p}
                        surface={CARD_SURFACE}
                        focusModel={fixTarget === p.id}
                        onFocused={() => setFixTarget(null)}
                        providers={providers}
                        catalog={catalog}
                        sources={sources}
                        onSaved={() => void load()}
                        onFlash={flash}
                      />
                    </Cell>
                  ))}
                </Deck>
              </Section>
            </Cell>
          );
        })
      )}
      </Deck>

      <ToastView
        toast={toast}
        prefix="word"
        className="fixed bottom-4 right-4 z-30 rounded-[12px] border px-3.5 py-2 text-[12.5px] shadow-2xl"
      />
    </PageShell>
  );
}

function CreateProfile({
  providers,
  catalog,
  sources,
  existingIds,
  onCancel,
  onCreated,
  onFlash,
}: {
  providers: string[];
  catalog: ProviderCatalog;
  sources: ModelListSources;
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
  const modelsDerived = sources[draft.provider] !== "built-in" && !!sources[draft.provider];
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
            <ModelField
              models={caps.models}
              derived={modelsDerived}
              value={draft.model}
              onChange={(v) => set("model", v)}
            />
          ) : (
            <span className="text-meta text-chalk-300">set in the provider config</span>
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
  surface,
  focusModel,
  onFocused,
  providers,
  catalog,
  sources,
  onSaved,
  onFlash,
}: {
  profile: ProfileView;
  /** Card background for a healthy profile; a broken one overrides it. */
  surface: string;
  /** The header sent the user here to repair the model. */
  focusModel: boolean;
  onFocused: () => void;
  providers: string[];
  catalog: ProviderCatalog;
  sources: ModelListSources;
  onSaved: () => void;
  onFlash: (t: Toast) => void;
}) {
  const [draft, setDraft] = useState<Draft>(toDraft(profile));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(profile));
  const usedBy = profile.usedBy ?? [];
  const caps = catalog[draft.provider] ?? EMPTY_CAPS;
  const modelsDerived = sources[draft.provider] !== "built-in" && !!sources[draft.provider];
  // The server judges the model against the resolved catalog and says which of
  // "wrong" and "unproven" it is - the client re-deriving that would be a second
  // opinion, and the two would drift.
  const savedIssue = profile.modelIssue;
  const savedBad = profile.modelStatus === "unknown-model";
  const { confirm, promptText } = useConfirm();
  const cardRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  // The model control is a <select> when the provider gave us its list and a
  // text input otherwise, so the field is queried rather than ref-threaded
  // through ModelField - one lookup here beats a ref prop on two primitives.
  useEffect(() => {
    if (!focusModel) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    modelRef.current?.querySelector<HTMLElement>("select, input")?.focus();
    onFocused();
  }, [focusModel, onFocused]);

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
    const newId = await promptText({
      title: `Duplicate "${profile.id}" as:`,
      initial: `${profile.id}-copy`,
      confirmLabel: "Duplicate",
      required: true,
    });
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
    const ok = inUse
      ? await confirm({
          title: `"${profile.id}" is used by ${usedBy.length} role(s) (${usedBy
            .map((u) => `${u.crewId}/${u.roleId}`)
            .join(", ")}). Delete anyway?`,
          message: "Those roles will need a new profile.",
          confirmLabel: "Delete",
          danger: true,
        })
      : await confirm({
          title: `Delete profile "${profile.id}"?`,
          confirmLabel: "Delete",
          danger: true,
        });
    if (!ok) return;
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
    <div
      ref={cardRef}
      className={cn(
        "flex h-full flex-col rounded-[18px] border p-4",
        // State outranks the stripe: an unusable profile keeps the amber wash
        // wherever it lands in the alternation.
        savedBad ? CARD_BROKEN : cn("border-[color:var(--line)]", surface),
      )}
    >
      {/* Header row: the profile id + a used-by fact toned by whether any role
          points at it (emerald = in use, neutral = unused). */}
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-chalk-100">
          {profile.id}
        </span>
        <span
          title={usedByTitle}
          className={cn(
            "shrink-0 text-meta font-semibold",
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
      {/* Only tiles that carry a value. A row of five with "-" in two of them
       * overflowed the card and wrapped one tile onto its own line, which made
       * otherwise identical cards different heights - and a "-" tile is not
       * information anyway; the field below it is where you set one. */}
      <div className="mt-3 flex flex-wrap items-stretch gap-1">
        <StatTile value={draft.provider || "-"} label="provider" />
        <StatTile
          value={draft.model.trim() || "default"}
          label="model"
          tone={savedBad ? "amber" : "default"}
        />
        <StatTile value={draft.power.trim() || "unset"} label="effort" />
        {draft.maxTokens.trim() ? (
          <StatTile value={draft.maxTokens.trim()} label="max tokens" />
        ) : null}
        {draft.timeoutMs.trim() ? (
          <StatTile value={draft.timeoutMs.trim()} label="timeout ms" />
        ) : null}
      </div>

      {/* A model can also stop existing AFTER it was set - the provider ships a
       * build and drops it - so this is not only an authoring-time check. The
       * sentence comes from the server so the dashboard, the API and the CLI
       * all say the same thing. */}
      {savedIssue ? (
        <p
          className={cn(
            "mt-2 text-[12px] leading-[1.45]",
            // The wash and the amber model tile already carry the state, so the
            // sentence stays reading text - a third amber signal turns the card
            // monotone and the detail becomes the hardest part to read.
            savedBad ? "text-chalk-200" : "text-chalk-300",
          )}
        >
          {savedIssue}
        </p>
      ) : null}

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
          <div ref={modelRef}>
            {caps.modelEnabled ? (
              <ModelField
                models={caps.models}
                derived={modelsDerived}
                value={draft.model}
                onChange={(v) => set("model", v)}
              />
            ) : (
              <span className="text-meta text-chalk-300">set in the provider config</span>
            )}
          </div>
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

// Deliberately not design/FormField: this page's variant stacks with a tighter
// gap, a smaller violet-soft label, and an inline hint line - swapping to the
// shared block-layout FormField would visibly change the form.
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
      <span className="text-meta font-semibold text-violet-soft">{label}</span>
      {children}
      {hint ? <span className="text-meta text-chalk-300">{hint}</span> : null}
    </label>
  );
}
