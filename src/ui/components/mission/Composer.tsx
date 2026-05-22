import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Eye,
  Layers,
  Play,
  Slash,
  X,
  Zap,
} from "lucide-react";
import {
  parsePromptInput,
  type PromptEffort,
  type PromptSubmit,
} from "../PromptBar.js";
import { usePersistedState } from "../../lib/usePersistedState.js";
import type {
  DiscoveredGuide,
  GuideContextPolicy,
  ResolvedGuideSnapshot,
} from "../../lib/types.js";

export type ComposerProvider = {
  id: string;
  label: string;
  available: boolean;
  configured: boolean;
  confidence: "ready" | "detected-needs-setup" | "missing";
};

export type ComposerSkill = { id: string; name: string };

export type ComposerSubmit = PromptSubmit & {
  /** Provider id picked from the dropdown ("" = use project default). */
  provider?: string;
  /** Skill ids attached just for this run. Only set on "run" submits. */
  skills?: string[];
  /** Brevity directive for this run. */
  concise?: boolean;
};

type Props = {
  busy: boolean;
  providers: ComposerProvider[];
  skills: ComposerSkill[];
  guides: DiscoveredGuide[];
  onResolveGuide: (input: {
    guideId: string;
    task: string;
    brief?: string | null;
    contextPolicy: GuideContextPolicy;
    slotProviders?: Record<string, string>;
    skippedOptionalSteps?: string[];
  }) => Promise<ResolvedGuideSnapshot>;
  onSubmit: (input: ComposerSubmit) => void | Promise<void>;
};

/**
 * The visual center of Home. A terminal-style multi-line input with a
 * full configuration row underneath: provider · effort · skills ·
 * read-only · keyboard hints. Submits to `onSubmit` with the parsed
 * intent plus the chosen provider and skill ids.
 *
 * The text parser is shared with the legacy PromptBar so slash commands
 * (/run, /task, /queue, /board, /runs, /settings, /help) work identically.
 */
export function Composer({
  busy,
  providers,
  skills,
  guides,
  onResolveGuide,
  onSubmit,
}: Props) {
  // Draft task text is intentionally NOT persisted — refreshing
  // should leave you with a clean prompt instead of a stale draft.
  // The *configuration* (provider, effort, skills, toggles) is
  // sticky so your preferred setup survives reloads.
  const [text, setText] = useState("");
  const [effort, setEffort] = usePersistedState<PromptEffort>(
    "amaco.composer.effort",
    "",
  );
  const [readOnly, setReadOnly] = usePersistedState<boolean>(
    "amaco.composer.readOnly",
    false,
  );
  const [concise, setConcise] = usePersistedState<boolean>(
    "amaco.composer.concise",
    false,
  );
  const [provider, setProvider] = usePersistedState<string>(
    "amaco.composer.provider",
    "",
  );
  const [selectedSkills, setSelectedSkills] = usePersistedState<string[]>(
    "amaco.composer.skills",
    [],
  );
  const [guideId, setGuideId] = usePersistedState<string>(
    "amaco.composer.guide",
    "",
  );
  const [guideBrief, setGuideBrief] = useState("");
  const [guideContextPolicy, setGuideContextPolicy] =
    useState<GuideContextPolicy>("balanced");
  const [guideSlotProviders, setGuideSlotProviders] = useState<
    Record<string, string>
  >({});
  const [skippedOptionalSteps, setSkippedOptionalSteps] = useState<string[]>([]);
  const [guidePreview, setGuidePreview] =
    useState<ResolvedGuideSnapshot | null>(null);
  const [guidePreviewBusy, setGuidePreviewBusy] = useState(false);
  const [guidePreviewError, setGuidePreviewError] = useState<string | null>(null);
  const [skillsPanelOpen, setSkillsPanelOpen] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Cmd/Ctrl+K and `/` from outside an input focus the composer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const isMac = navigator.platform.toLowerCase().includes("mac");
      if (((isMac && e.metaKey) || (!isMac && e.ctrlKey)) && e.key === "k") {
        e.preventDefault();
        ref.current?.focus();
        return;
      }
      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filteredSkills = useMemo(() => {
    const q = skillSearch.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [skills, skillSearch]);

  const selectedGuide = useMemo(
    () => guides.find((guide) => guide.id === guideId) ?? null,
    [guideId, guides],
  );

  useEffect(() => {
    if (!selectedGuide) {
      setGuidePreview(null);
      setGuidePreviewError(null);
      setGuidePreviewBusy(false);
      return;
    }

    const task = guideTaskText(text);
    if (!task) {
      setGuidePreview(null);
      setGuidePreviewError(null);
      setGuidePreviewBusy(false);
      return;
    }

    let cancelled = false;
    setGuidePreviewBusy(true);
    setGuidePreviewError(null);
    void onResolveGuide({
      guideId: selectedGuide.id,
      task,
      brief: guideBrief.trim() || null,
      contextPolicy: guideContextPolicy,
      slotProviders: compactOverrides(guideSlotProviders),
      skippedOptionalSteps:
        skippedOptionalSteps.length > 0 ? skippedOptionalSteps : undefined,
    })
      .then((snapshot) => {
        if (!cancelled) setGuidePreview(snapshot);
      })
      .catch((err) => {
        if (cancelled) return;
        setGuidePreview(null);
        setGuidePreviewError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setGuidePreviewBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    guideBrief,
    guideContextPolicy,
    guideSlotProviders,
    onResolveGuide,
    selectedGuide,
    skippedOptionalSteps,
    text,
  ]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setParseError(null);
    const parsed = parsePromptInput(trimmed, { effort, readOnly });
    if (parsed.kind === "error") {
      setParseError(parsed.message);
      return;
    }
    if (parsed.kind === "run" && selectedGuide) {
      setParseError(
        "Guided execution starts in Phase 2. The resolved Guide preview is ready below; switch to default workflow to spawn now.",
      );
      return;
    }
    const enriched: ComposerSubmit =
      parsed.kind === "run"
        ? {
            ...parsed,
            provider: provider || undefined,
            skills: selectedSkills.length > 0 ? selectedSkills : undefined,
            concise: concise || undefined,
          }
        : parsed;
    void onSubmit(enriched);
    if (parsed.kind === "run" || parsed.kind === "create-task") {
      setText("");
      // Keep provider + skills sticky — usual case is firing off several
      // related runs.
    }
  }

  const dispatchVerb = previewVerbFor(text);

  return (
    <section
      role="region"
      aria-label="Command composer"
      className="border-b border-amaco-border bg-amaco-canvas"
    >
      <div className="px-6 py-4">
        {/* Prompt row — terminal prefix + textarea + run button */}
        <div className="flex items-stretch gap-3">
          <div className="flex shrink-0 items-start pt-3">
            <span className="amaco-mono text-[12px] text-amaco-accent">
              amaco
            </span>
            <span className="amaco-mono text-[12px] text-amaco-fg-dim">
              &nbsp;›&nbsp;
            </span>
          </div>
          <div className="relative flex-1">
            <textarea
              ref={ref}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (parseError) setParseError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={Math.min(8, Math.max(2, text.split("\n").length))}
              disabled={busy}
              aria-label="Describe the task, bug, refactor, or workflow to run"
              placeholder="Describe the task, bug, refactor, or workflow — or type a slash command like /help"
              className="w-full resize-none rounded-md border border-amaco-border bg-amaco-panel px-3 py-2.5 text-[14px] leading-[1.5] text-amaco-fg placeholder:text-amaco-fg-muted focus:border-amaco-accent focus:outline-none focus:ring-1 focus:ring-amaco-accent/40 disabled:opacity-60"
            />
            <div
              className="pointer-events-none absolute bottom-2 right-3 amaco-mono text-[10.5px] text-amaco-fg-muted"
              aria-hidden
            >
              {dispatchVerb ? `↵ ${dispatchVerb}` : "↵ run"}
            </div>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={busy || text.trim().length === 0}
            aria-label={selectedGuide ? "Preview Guide" : "Run"}
            className="shrink-0 self-start inline-flex items-center gap-1.5 rounded-md border border-amaco-accent/50 bg-amaco-accent/15 px-4 py-2.5 text-[13px] font-medium text-amaco-accent hover:bg-amaco-accent/25 focus:outline-none focus:ring-1 focus:ring-amaco-accent disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {selectedGuide ? "Preview" : busy ? "Running…" : "Run"}
          </button>
        </div>

        {/* Configuration row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11.5px]">
          <ProviderSelect
            providers={providers}
            value={provider}
            onChange={setProvider}
          />
          <GuideSelect
            guides={guides}
            value={guideId}
            onChange={(next) => {
              setGuideId(next);
              setGuideSlotProviders({});
              setSkippedOptionalSteps([]);
              setGuidePreview(null);
              setGuidePreviewError(null);
            }}
          />
          <EffortChips value={effort} onChange={setEffort} />
          <SkillsControl
            skills={skills}
            selected={selectedSkills}
            open={skillsPanelOpen}
            onToggle={() => setSkillsPanelOpen((v) => !v)}
            onChange={setSelectedSkills}
            search={skillSearch}
            onSearch={setSkillSearch}
            filtered={filteredSkills}
          />
          <label
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 ${
              readOnly
                ? "border-amaco-warn/60 bg-amaco-warn/10 text-amaco-warn"
                : "border-amaco-border bg-amaco-panel text-amaco-fg-dim hover:bg-amaco-panel-2"
            }`}
          >
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              className="h-3 w-3 accent-amaco-warn"
            />
            <Eye className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            <span>read-only</span>
          </label>

          <label
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 ${
              concise
                ? "border-amaco-accent/60 bg-amaco-accent/10 text-amaco-accent"
                : "border-amaco-border bg-amaco-panel text-amaco-fg-dim hover:bg-amaco-panel-2"
            }`}
            title="Ask agents to prefer diffs, bullets, and skip preamble. Token-efficient."
          >
            <input
              type="checkbox"
              checked={concise}
              onChange={(e) => setConcise(e.target.checked)}
              className="h-3 w-3 accent-amaco-accent"
            />
            <span>concise</span>
          </label>

          <div className="ml-auto inline-flex items-center gap-2 amaco-mono text-[10.5px] text-amaco-fg-muted">
            <Kbd>⌘K</Kbd>
            <Kbd>/</Kbd>
            <span>focus</span>
            <span aria-hidden>·</span>
            <Kbd>↵</Kbd>
            <span>run</span>
            <span aria-hidden>·</span>
            <Kbd>⇧↵</Kbd>
            <span>newline</span>
            <span aria-hidden>·</span>
            <Kbd>?</Kbd>
            <span>help</span>
          </div>
        </div>

        {parseError ? (
          <div
            role="alert"
            className="mt-2 text-[12px] text-amaco-fail"
          >
            {parseError}
          </div>
        ) : null}

        {selectedGuide ? (
          <GuidePreview
            guide={selectedGuide}
            providers={providers}
            taskReady={!!guideTaskText(text)}
            brief={guideBrief}
            onBrief={setGuideBrief}
            contextPolicy={guideContextPolicy}
            onContextPolicy={setGuideContextPolicy}
            slotProviders={guideSlotProviders}
            onSlotProvider={(slotId, providerId) =>
              setGuideSlotProviders((current) => ({
                ...current,
                [slotId]: providerId,
              }))
            }
            skippedOptionalSteps={skippedOptionalSteps}
            onSkippedOptionalSteps={setSkippedOptionalSteps}
            snapshot={guidePreview}
            busy={guidePreviewBusy}
            error={guidePreviewError}
          />
        ) : null}
      </div>
    </section>
  );
}

function guideTaskText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("/")) return null;
  return trimmed;
}

function compactOverrides(
  slotProviders: Record<string, string>,
): Record<string, string> | undefined {
  const entries = Object.entries(slotProviders).filter(([, provider]) => !!provider);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function previewVerbFor(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (!t.startsWith("/")) return "spawn run";
  const [cmd] = t.slice(1).split(/\s+/, 1);
  switch (cmd) {
    case "run":
      return "spawn run";
    case "task":
      return "create task";
    case "queue":
      return t.length > "/queue".length ? "queue task" : "open queue";
    case "board":
      return "open board";
    case "runs":
      return "open all runs";
    case "settings":
      return "open settings";
    case "help":
      return "show help";
    default:
      return null;
  }
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-amaco-border bg-amaco-panel-2 px-1 py-px text-amaco-fg-dim">
      {children}
    </kbd>
  );
}

function ProviderSelect({
  providers,
  value,
  onChange,
}: {
  providers: ComposerProvider[];
  value: string;
  onChange: (v: string) => void;
}) {
  const items = [
    { id: "", label: "project default", available: true, configured: true },
    ...providers,
  ];
  return (
    <label className="inline-flex items-center gap-1.5 rounded border border-amaco-border bg-amaco-panel px-2 py-1 text-amaco-fg-dim">
      <span className="amaco-mono text-[10.5px] uppercase tracking-[0.1em] text-amaco-fg-muted">
        provider
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="amaco-mono bg-transparent text-amaco-fg focus:outline-none"
        aria-label="Provider"
      >
        {items.map((p) => (
          <option key={p.id || "default"} value={p.id}>
            {labelFor(p)}
          </option>
        ))}
      </select>
      <ChevronDown
        className="h-3 w-3 text-amaco-fg-muted"
        strokeWidth={1.5}
        aria-hidden
      />
    </label>
  );
}

function GuideSelect({
  guides,
  value,
  onChange,
}: {
  guides: DiscoveredGuide[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded border border-amaco-border bg-amaco-panel px-2 py-1 text-amaco-fg-dim">
      <span className="amaco-mono text-[10.5px] uppercase tracking-[0.1em] text-amaco-fg-muted">
        guide
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="amaco-mono bg-transparent text-amaco-fg focus:outline-none"
        aria-label="Guide"
      >
        <option value="">default workflow</option>
        {guides.map((guide) => (
          <option key={guide.id} value={guide.id}>
            {guide.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="h-3 w-3 text-amaco-fg-muted"
        strokeWidth={1.5}
        aria-hidden
      />
    </label>
  );
}

function labelFor(p: {
  id: string;
  label: string;
  available?: boolean;
  configured?: boolean;
}): string {
  if (p.id === "") return p.label;
  const tag = !p.available
    ? " (not installed)"
    : !p.configured
      ? " (not in project.yml)"
      : "";
  return `${p.label}${tag}`;
}

function EffortChips({
  value,
  onChange,
}: {
  value: PromptEffort;
  onChange: (v: PromptEffort) => void;
}) {
  const options: { v: PromptEffort; label: string }[] = [
    { v: "", label: "auto" },
    { v: "low", label: "low" },
    { v: "medium", label: "med" },
    { v: "high", label: "high" },
  ];
  return (
    <span
      role="radiogroup"
      aria-label="Effort"
      className="inline-flex items-center gap-0 rounded border border-amaco-border bg-amaco-panel"
    >
      <span className="amaco-mono px-1.5 text-[10.5px] uppercase tracking-[0.1em] text-amaco-fg-muted inline-flex items-center gap-1">
        <Zap className="h-3 w-3" strokeWidth={1.5} aria-hidden />
        effort
      </span>
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v || "default"}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.v)}
            className={`amaco-mono px-2 py-1 text-[11px] ${
              active
                ? "bg-amaco-accent/15 text-amaco-accent"
                : "text-amaco-fg-dim hover:bg-amaco-panel-2"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

function SkillsControl({
  skills,
  selected,
  open,
  onToggle,
  onChange,
  search,
  onSearch,
  filtered,
}: {
  skills: ComposerSkill[];
  selected: string[];
  open: boolean;
  onToggle: () => void;
  onChange: (next: string[]) => void;
  search: string;
  onSearch: (s: string) => void;
  filtered: ComposerSkill[];
}) {
  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    );
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 ${
          selected.length > 0
            ? "border-amaco-accent/50 bg-amaco-accent/10 text-amaco-accent"
            : "border-amaco-border bg-amaco-panel text-amaco-fg-dim hover:bg-amaco-panel-2"
        }`}
      >
        <Layers className="h-3 w-3" strokeWidth={1.5} aria-hidden />
        <span className="amaco-mono text-[10.5px] uppercase tracking-[0.1em] text-amaco-fg-muted">
          skills
        </span>
        <span className="amaco-mono">
          {selected.length === 0 ? "none" : `${selected.length} attached`}
        </span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
      </button>
      {/* Selected chips render after the trigger so they're visible at a glance */}
      {selected.length > 0 && !open ? (
        <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
          {selected.slice(0, 4).map((id) => {
            const skill = skills.find((s) => s.id === id);
            return (
              <span
                key={id}
                className="amaco-mono inline-flex items-center gap-1 rounded border border-amaco-accent/40 bg-amaco-accent/10 px-1.5 py-0.5 text-[10.5px] text-amaco-accent"
              >
                {skill?.name ?? id}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  aria-label={`Remove ${skill?.name ?? id}`}
                  className="text-amaco-accent/70 hover:text-amaco-accent"
                >
                  <X className="h-3 w-3" strokeWidth={1.8} />
                </button>
              </span>
            );
          })}
          {selected.length > 4 ? (
            <span className="text-[10.5px] text-amaco-fg-muted">
              +{selected.length - 4}
            </span>
          ) : null}
        </span>
      ) : null}

      {open ? (
        <div className="absolute z-50 mt-1 w-72 rounded border border-amaco-border bg-amaco-panel p-2 shadow-lg">
          <div className="mb-1.5 flex items-center gap-1.5 border-b border-amaco-border-soft pb-1.5">
            <Slash
              className="h-3 w-3 text-amaco-fg-muted"
              strokeWidth={1.5}
              aria-hidden
            />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="search skills…"
              className="flex-1 bg-transparent text-[12px] text-amaco-fg placeholder:text-amaco-fg-muted focus:outline-none"
              aria-label="Search skills"
            />
            {selected.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="amaco-mono text-[10.5px] text-amaco-fg-muted hover:text-amaco-fg"
              >
                clear
              </button>
            ) : null}
          </div>
          <ul
            role="listbox"
            aria-multiselectable
            className="max-h-56 overflow-y-auto"
          >
            {filtered.length === 0 ? (
              <li className="px-2 py-1.5 text-[11.5px] text-amaco-fg-muted">
                No skills match. Add one in the Skills tab.
              </li>
            ) : (
              filtered.map((s) => {
                const active = selected.includes(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => toggle(s.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[12px] ${
                        active
                          ? "bg-amaco-accent/10 text-amaco-accent"
                          : "text-amaco-fg-dim hover:bg-amaco-panel-2"
                      }`}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="amaco-mono text-[10px] text-amaco-fg-muted truncate">
                        {s.id}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function GuidePreview({
  guide,
  providers,
  taskReady,
  brief,
  onBrief,
  contextPolicy,
  onContextPolicy,
  slotProviders,
  onSlotProvider,
  skippedOptionalSteps,
  onSkippedOptionalSteps,
  snapshot,
  busy,
  error,
}: {
  guide: DiscoveredGuide;
  providers: ComposerProvider[];
  taskReady: boolean;
  brief: string;
  onBrief: (brief: string) => void;
  contextPolicy: GuideContextPolicy;
  onContextPolicy: (policy: GuideContextPolicy) => void;
  slotProviders: Record<string, string>;
  onSlotProvider: (slotId: string, providerId: string) => void;
  skippedOptionalSteps: string[];
  onSkippedOptionalSteps: (steps: string[]) => void;
  snapshot: ResolvedGuideSnapshot | null;
  busy: boolean;
  error: string | null;
}) {
  const slots = Object.entries(guide.definition.slots);
  const optionalSteps = guide.definition.steps.filter((step) => step.optional);
  const steps = snapshot?.steps ?? guide.definition.steps;

  function toggleOptionalStep(stepId: string, enabled: boolean) {
    onSkippedOptionalSteps(
      enabled
        ? skippedOptionalSteps.filter((id) => id !== stepId)
        : [...skippedOptionalSteps, stepId],
    );
  }

  return (
    <div className="mt-3 border-t border-amaco-border-soft pt-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[13px] font-medium text-amaco-fg">
              {guide.label}
            </span>
            <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
              {guide.id}@{guide.version}
            </span>
            <span className="rounded border border-amaco-border bg-amaco-panel px-1.5 py-px amaco-mono text-[10px] text-amaco-fg-dim">
              {guide.source.kind}
            </span>
          </div>
          <p className="mt-1 max-w-[72ch] text-[12px] leading-[1.45] text-amaco-fg-dim">
            {guide.description}
          </p>
        </div>
        <span className="rounded border border-amaco-warn/40 bg-amaco-warn/10 px-2 py-1 amaco-mono text-[10.5px] text-amaco-warn">
          preview only
        </span>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(16rem,1fr)_minmax(22rem,1.35fr)]">
        <div className="space-y-2">
          <label className="block">
            <span className="amaco-mono text-[10.5px] uppercase tracking-[0.1em] text-amaco-fg-muted">
              brief
            </span>
            <textarea
              rows={2}
              value={brief}
              onChange={(e) => onBrief(e.target.value)}
              placeholder="Review focus, risk, or handoff context"
              className="mt-1 w-full resize-y rounded border border-amaco-border bg-amaco-panel px-2.5 py-2 text-[12px] leading-[1.45] text-amaco-fg placeholder:text-amaco-fg-muted focus:border-amaco-accent focus:outline-none focus:ring-1 focus:ring-amaco-accent/40"
            />
          </label>

          <label className="inline-flex items-center gap-1.5 rounded border border-amaco-border bg-amaco-panel px-2 py-1 text-[11.5px] text-amaco-fg-dim">
            <span className="amaco-mono text-[10.5px] uppercase tracking-[0.1em] text-amaco-fg-muted">
              context
            </span>
            <select
              value={contextPolicy}
              onChange={(e) =>
                onContextPolicy(e.target.value as GuideContextPolicy)
              }
              aria-label="Guide context policy"
              className="amaco-mono bg-transparent text-amaco-fg focus:outline-none"
            >
              <option value="balanced">balanced</option>
              <option value="compact">compact</option>
              <option value="artifact-heavy">artifact-heavy</option>
            </select>
          </label>

          <div className="space-y-1.5">
            {slots.map(([slotId, slot]) => (
              <label
                key={slotId}
                className="grid gap-1 rounded border border-amaco-border bg-amaco-panel px-2 py-1.5 text-[11.5px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <span className="min-w-0">
                  <span className="text-amaco-fg">{slot.label}</span>
                  <span className="amaco-mono ml-1 text-amaco-fg-muted">
                    {slotId}
                  </span>
                </span>
                <select
                  value={slotProviders[slotId] ?? ""}
                  onChange={(e) => onSlotProvider(slotId, e.target.value)}
                  aria-label={`${slot.label} provider`}
                  className="amaco-mono min-w-0 rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-1 text-amaco-fg focus:border-amaco-accent focus:outline-none"
                >
                  <option value="">agent default</option>
                  {providers
                    .filter((provider) => provider.configured)
                    .map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {labelFor(provider)}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>

          {optionalSteps.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {optionalSteps.map((step) => {
                const enabled = !skippedOptionalSteps.includes(step.id);
                return (
                  <label
                    key={step.id}
                    className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${
                      enabled
                        ? "border-amaco-accent/40 bg-amaco-accent/10 text-amaco-accent"
                        : "border-amaco-border bg-amaco-panel text-amaco-fg-dim"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => toggleOptionalStep(step.id, e.target.checked)}
                      className="h-3 w-3 accent-amaco-accent"
                    />
                    {step.label}
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 rounded border border-amaco-border bg-amaco-panel">
          <div className="flex items-center justify-between gap-2 border-b border-amaco-border-soft px-2.5 py-1.5">
            <span className="amaco-mono text-[10.5px] uppercase tracking-[0.1em] text-amaco-fg-muted">
              resolved steps
            </span>
            <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
              {busy ? "resolving" : snapshot ? "resolved" : "definition"}
            </span>
          </div>
          {!taskReady ? (
            <div className="px-2.5 py-2 text-[11.5px] text-amaco-fg-muted">
              Add a task to resolve providers.
            </div>
          ) : error ? (
            <div className="px-2.5 py-2 text-[11.5px] text-amaco-fail">
              {error}
            </div>
          ) : null}
          <ol className="divide-y divide-amaco-border-soft">
            {steps.map((step, index) => {
              const enabled = "enabled" in step ? step.enabled : true;
              const provider = "providerId" in step ? step.providerId : null;
              const slot = "slotId" in step ? step.slotId : step.slot ?? null;
              return (
                <li
                  key={step.id}
                  className={`grid gap-1 px-2.5 py-1.5 text-[11.5px] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${
                    enabled ? "text-amaco-fg-dim" : "text-amaco-fg-muted"
                  }`}
                >
                  <span className="amaco-mono text-amaco-fg-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="text-amaco-fg">{step.label}</span>
                    <span className="amaco-mono ml-1 text-amaco-fg-muted">
                      {step.kind}
                    </span>
                  </span>
                  <span className="amaco-mono truncate text-amaco-fg-muted">
                    {!enabled
                      ? "skipped"
                      : provider
                        ? `${slot ?? "stage"}:${provider}`
                        : slot ?? "system"}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
