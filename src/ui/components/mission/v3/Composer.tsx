import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ArrowRight,
  Bolt,
  Check,
  ChevronDown,
  Clock,
  GitBranch,
  Lock,
  Play,
  Plus,
  Save,
  Shuffle,
  Sparkles,
  User,
} from "lucide-react";
import { Chip, KBD, ToneDot } from "../../design/Chip.js";
import { cn } from "../../design/cn.js";
import {
  classifyRole,
  iconForRole,
  toneForRole,
  type Role,
} from "../../design/roleTone.js";
import type {
  DiscoveredGuide,
  GuideContextPolicy,
} from "../../../lib/types.js";
import type { ComposerPreset } from "../../../lib/api.js";

export type ComposerProvider = {
  id: string;
  label: string;
  available: boolean;
  configured: boolean;
  confidence: "ready" | "detected-needs-setup" | "missing";
};

export type ComposerSkill = { id: string; name: string };

export type ComposerSubmitInput = {
  brief: string;
  guideId: string | null;
  contextPolicy: GuideContextPolicy;
  slotProviders: Record<string, string>;
  providerOverride: string | null;
  skills: string[];
  readOnly: boolean;
};

type Props = {
  busy: boolean;
  providers: ComposerProvider[];
  defaultProviderId: string | null;
  skills: ComposerSkill[];
  guides: DiscoveredGuide[];
  presets: ComposerPreset[];
  onSubmit: (input: ComposerSubmitInput) => void | Promise<void>;
  onSavePreset: (input: ComposerPreset) => void | Promise<void>;
  onDeletePreset: (name: string) => void | Promise<void>;
  onCustomizeFlow: () => void;
};

const SUGGESTIONS = [
  "Add a `/healthz` endpoint that returns uptime and version",
  "Refactor the RunStatus union to a discriminated state machine",
  "Migrate the cost ledger to JSONL and add CSV export",
  "Wire up SSE for live event streams in the run detail page",
];

/**
 * Mission Control composer (v3 layout).
 *
 *   1 · The brief    — narrow auto-growing textarea
 *   2 · Flow         — full-shape chips (4 across) with step pips
 *   3 · Crew         — slot cards built from the chosen guide
 *   4 · Run          — meta chips + Send-to-crew button
 */
export function ComposerV3({
  busy,
  providers,
  defaultProviderId,
  skills,
  guides,
  presets,
  onSubmit,
  onSavePreset,
  onDeletePreset,
  onCustomizeFlow,
}: Props) {
  const [brief, setBrief] = useState("");
  const [guideId, setGuideId] = useState<string>(() => guides[0]?.id ?? "");
  const [slotProviders, setSlotProviders] = useState<Record<string, string>>({});
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [openPickerSlot, setOpenPickerSlot] = useState<string | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const presetsRef = useRef<HTMLDivElement | null>(null);

  // When the guides list arrives, default to a Quality-Arbitration-shaped
  // recipe if present (it carries the strongest design intent — four
  // visible crew slots). Falls back to the first available guide.
  useEffect(() => {
    if (guideId) return;
    if (guides.length === 0) return;
    const pick =
      guides.find((g) => /arbitr|quality/i.test(g.label)) ?? guides[0]!;
    setGuideId(pick.id);
  }, [guides, guideId]);

  // `/` focuses the brief (from outside any input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-grow the textarea up to ~14 lines, then scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineH = 24;
    const max = 14 * lineH;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [brief]);

  const selectedGuide = useMemo(
    () => guides.find((g) => g.id === guideId) ?? null,
    [guideId, guides],
  );

  const slotEntries = useMemo(() => {
    if (!selectedGuide) return [];
    return Object.entries(selectedGuide.definition.slots).map(
      ([id, def]) => ({
        id,
        label: def.label,
        description: def.description ?? null,
        defaultAgent: def.defaultAgent,
        role: classifyRole(def.label || id),
      }),
    );
  }, [selectedGuide]);

  // Always render 4 slot columns so the rhythm matches the design.
  const slots = useMemo(() => {
    const list = slotEntries.slice(0, 4).map((entry) => ({
      ...entry,
      active: true,
    }));
    while (list.length < 4) {
      list.push({
        id: `__placeholder_${list.length}`,
        label: "—",
        description: null,
        defaultAgent: "",
        role: "Executor" as Role,
        active: false,
      });
    }
    return list;
  }, [slotEntries]);

  function toggleSkill(id: string) {
    setSelectedSkills((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  function setSlotProvider(slotId: string, providerId: string) {
    setSlotProviders((cur) => ({ ...cur, [slotId]: providerId }));
  }

  function handleSubmit() {
    const trimmed = brief.trim();
    if (!trimmed || busy) return;
    void onSubmit({
      brief: trimmed,
      guideId: guideId || null,
      contextPolicy: "balanced",
      slotProviders,
      providerOverride: null,
      skills: selectedSkills,
      readOnly,
    });
  }

  function buildPreset(kind: "crew" | "template", name: string): ComposerPreset {
    return {
      name,
      kind,
      brief: kind === "template" ? brief.trim() || null : null,
      guide: guideId
        ? {
            id: guideId,
            contextPolicy: "balanced",
            slotProviders,
            skippedOptionalSteps: [],
          }
        : null,
      provider: null,
      skills: selectedSkills,
      readOnly,
    };
  }

  function applyPreset(p: ComposerPreset) {
    if (p.guide) {
      setGuideId(p.guide.id);
      setSlotProviders(p.guide.slotProviders ?? {});
    }
    if (p.brief !== null) setBrief(p.brief);
    setSelectedSkills(p.skills);
    setReadOnly(p.readOnly);
    setPresetsOpen(false);
  }

  useEffect(() => {
    if (!presetsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) {
        setPresetsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [presetsOpen]);

  function promptAndSave(kind: "crew" | "template") {
    const suggested =
      kind === "crew"
        ? `${selected(guideId, guides) ?? "Crew"} preset`
        : (brief.split("\n")[0] || "Template").slice(0, 60);
    const name = window.prompt(
      kind === "crew" ? "Name this crew preset" : "Name this template",
      suggested,
    );
    if (!name) return;
    void onSavePreset(buildPreset(kind, name.trim()));
  }

  return (
    <div className="bevel-violet top-rim p-[1px] fade-up">
      <div className="rounded-[13px] surface-ink-100-70 backdrop-blur-2xl">
        {/* 1 · The brief */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-baseline justify-between mb-2">
            <span className="eyebrow">1 · The brief</span>
            <span className="text-[10.5px] text-fog-500 mono whitespace-nowrap">
              {brief.length} chars · markdown · ⌘⏎ to send
            </span>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-1.5 w-7 h-7 rounded-md bg-violet-soft/15 ring-1 ring-violet-soft/30 flex items-center justify-center text-violet-soft shrink-0">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.7} />
            </div>
            <textarea
              ref={textareaRef}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              rows={3}
              placeholder={
                "Describe the work…\n\nGoals, constraints, files to touch, anything the crew needs."
              }
              className="flex-1 resize-none bg-transparent text-[16px] leading-[1.55] text-fog-100 placeholder:text-fog-500 outline-none py-1"
            />
          </div>
          {brief.trim().length === 0 ? (
            <div className="mt-3 ml-10 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setBrief(s)}
                  className="text-[12px] text-fog-300 hover:text-fog-100 px-2.5 py-1 rounded-full border border-white/[0.08] hover:border-violet-soft/30 hover:bg-violet-500/[0.06] transition"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* 2 · Flow */}
        <div className="px-5 pt-3 pb-4 border-t border-white/[0.06]">
          <div className="flex items-baseline justify-between mb-2.5">
            <span className="eyebrow">
              2 · Flow{selectedGuide ? ` · ${selectedGuide.label}` : ""}
            </span>
            <span className="text-[11px] text-fog-400 flex items-center gap-2 whitespace-nowrap">
              {selectedGuide ? (
                <>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" strokeWidth={1.7} />
                    {selectedGuide.definition.steps.length} steps
                  </span>
                  <span>·</span>
                </>
              ) : null}
              <button
                type="button"
                onClick={onCustomizeFlow}
                className="text-violet-soft hover:text-violet-soft/80 flex items-center gap-1"
              >
                Customize <ArrowRight className="h-3 w-3" strokeWidth={1.7} />
              </button>
            </span>
          </div>
          {guides.length === 0 ? (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-[12.5px] text-fog-400">
              No guides discovered yet. Project-local guides live in{" "}
              <span className="mono">.amaco/guides/</span>.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {guides.slice(0, 8).map((g) => (
                <FlowChip
                  key={g.id}
                  guide={g}
                  selected={g.id === guideId}
                  onSelect={() => {
                    setGuideId(g.id);
                    setSlotProviders({});
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* 3 · Crew */}
        <div className="px-5 pt-3 pb-4 border-t border-white/[0.06]">
          <div className="flex items-baseline justify-between mb-2.5">
            <span className="eyebrow">
              3 · Crew · {slotEntries.length} active
            </span>
            <div className="flex items-center gap-3 text-[11.5px] text-fog-400 whitespace-nowrap">
              <button
                type="button"
                onClick={() => promptAndSave("crew")}
                className="hover:text-fog-200 flex items-center gap-1.5"
              >
                <User className="h-3 w-3" strokeWidth={1.7} /> Save crew as preset
              </button>
              <span className="text-fog-500">·</span>
              <button
                type="button"
                onClick={() => setSlotProviders({})}
                className="hover:text-fog-200 flex items-center gap-1.5"
              >
                <Shuffle className="h-3 w-3" strokeWidth={1.7} /> Reset
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {slots.map((s) =>
              s.active ? (
                <CrewCard
                  key={s.id}
                  slotId={s.id}
                  role={s.role}
                  label={s.label}
                  providerId={slotProviders[s.id] ?? s.defaultAgent}
                  providers={providers}
                  open={openPickerSlot === s.id}
                  setOpen={setOpenPickerSlot}
                  onPick={(pid) => {
                    setSlotProvider(s.id, pid);
                    setOpenPickerSlot(null);
                  }}
                />
              ) : (
                <button
                  key={s.id}
                  type="button"
                  className="rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-3 py-2.5 text-left hover:border-violet-soft/30 hover:bg-violet-500/[0.04] transition"
                >
                  <div className="text-[10px] uppercase tracking-[0.16em] text-fog-400 mb-1">
                    Slot
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px] text-fog-400">
                    <Plus className="h-3 w-3" strokeWidth={1.7} /> Optional for this guide
                  </div>
                </button>
              ),
            )}
          </div>
        </div>

        {/* 4 · Run */}
        <div className="px-5 pt-3 pb-4 border-t border-white/[0.06] flex items-center flex-wrap gap-2">
          <span className="eyebrow mr-1">4 · Run</span>
          <SkillsChip
            skills={skills}
            selected={selectedSkills}
            open={skillsOpen}
            setOpen={setSkillsOpen}
            toggle={toggleSkill}
          />
          <button
            type="button"
            onClick={() => setReadOnly((x) => !x)}
            className={cn(
              "h-7 px-2.5 rounded-full text-[11.5px] flex items-center gap-1.5 border transition whitespace-nowrap",
              readOnly
                ? "border-amber-400/30 bg-amber-500/10 text-amber-300"
                : "border-white/[0.08] bg-white/[0.02] text-fog-300 hover:text-fog-100",
            )}
          >
            <Lock className="h-3 w-3" strokeWidth={1.7} />
            {readOnly ? "Read-only on" : "Read-only off"}
          </button>
          <span className="h-7 px-2.5 rounded-full text-[11.5px] flex items-center gap-1.5 border border-white/[0.08] bg-white/[0.02] text-fog-300 whitespace-nowrap">
            <Bolt className="h-3 w-3 text-amber-300" strokeWidth={1.7} />
            default · {providerLabel(defaultProviderId, providers)}
          </span>
          <div ref={presetsRef} className="ml-auto relative">
            <button
              type="button"
              onClick={() => setPresetsOpen((x) => !x)}
              className="text-[11.5px] text-fog-400 hover:text-fog-200 flex items-center gap-1.5 whitespace-nowrap h-7 px-2.5 rounded-full border border-white/[0.08] bg-white/[0.02]"
            >
              <Save className="h-3 w-3" strokeWidth={1.7} />
              {presets.length > 0
                ? `${presets.length} preset${presets.length === 1 ? "" : "s"}`
                : "Presets"}
              <ChevronDown className="h-3 w-3 text-fog-500" strokeWidth={1.7} />
            </button>
            {presetsOpen ? (
              <div className="absolute right-0 bottom-full mb-2 z-30 menu-surface overflow-hidden py-1 min-w-[280px]">
                <button
                  type="button"
                  onClick={() => {
                    setPresetsOpen(false);
                    promptAndSave("template");
                  }}
                  className="w-full text-left px-3 py-2 text-[12.5px] text-fog-100 hover:bg-white/[0.05] flex items-center gap-2"
                >
                  <Save className="h-3 w-3 text-violet-soft" strokeWidth={1.7} />
                  Save this as a template…
                </button>
                {presets.length > 0 ? (
                  <div className="border-t border-white/[0.06] mt-1 pt-1 max-h-[260px] overflow-y-auto">
                    {presets.map((p) => (
                      <div
                        key={p.name}
                        className="px-3 py-1.5 hover:bg-white/[0.04] flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => applyPreset(p)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="text-[12.5px] text-fog-100 truncate">
                            {p.name}
                          </div>
                          <div className="text-[10.5px] text-fog-400 truncate">
                            {p.kind} · {p.guide?.id ?? "no guide"} ·{" "}
                            {p.skills.length} skills
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete preset "${p.name}"?`))
                              void onDeletePreset(p.name);
                          }}
                          className="text-fog-500 hover:text-rose-300 text-[10.5px] mono"
                          title="Delete preset"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!brief.trim() || busy}
            className="h-10 px-5 rounded-lg bg-gradient-to-b from-violet-mid to-violet-deep text-white font-medium text-[13.5px] flex items-center gap-2 ring-1 ring-violet-soft/35 shadow-[0_8px_24px_-8px_rgba(139,124,255,0.55)] whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="h-3 w-3" strokeWidth={2} />
            {busy ? "Starting…" : "Send to crew"}
            <span className="ml-1 flex items-center gap-1 opacity-80">
              <KBD>⌘</KBD>
              <KBD>⏎</KBD>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function providerLabel(
  id: string | null,
  providers: ComposerProvider[],
): string {
  if (!id) return "auto";
  return providers.find((p) => p.id === id)?.label ?? id;
}

function selected(
  guideId: string,
  guides: DiscoveredGuide[],
): string | null {
  return guides.find((g) => g.id === guideId)?.label ?? null;
}

/**
 * Best-effort vendor classification from a provider id slug. Mirrors
 * the helper in `server/routes/metrics.ts` so the dropdown's "vendor
 * · role" caption matches what the Agents/Metrics pages render.
 */
function vendorForProvider(providerId: string): string | null {
  const lower = providerId.toLowerCase();
  if (lower.includes("claude") || lower.includes("anthropic"))
    return "Anthropic";
  if (lower.includes("codex") || lower.includes("openai") || lower.includes("gpt"))
    return "OpenAI";
  if (lower.includes("gemini") || lower.includes("google")) return "Google";
  if (lower.includes("ollama") || lower.includes("llama")) return "Ollama";
  if (lower.includes("aider")) return "Aider";
  if (lower.includes("opencode")) return "OpenCode";
  return null;
}

function FlowChip({
  guide,
  selected,
  onSelect,
}: {
  guide: DiscoveredGuide;
  selected: boolean;
  onSelect: () => void;
}) {
  const stepCount = guide.definition.steps.length;
  const isRecommended = /quality|arbitr/i.test(guide.label);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative text-left rounded-xl px-3.5 py-3 border transition group min-w-0",
        selected
          ? "border-violet-soft/45 bg-gradient-to-br from-violet-soft/[0.08] to-violet-deep/[0.04] ring-1 ring-violet-soft/30"
          : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/15",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={cn(
            "text-[12.5px] font-medium truncate",
            selected ? "text-fog-100" : "text-fog-200",
          )}
        >
          {guide.label}
        </span>
        {isRecommended ? (
          <span className="ml-auto shrink-0 text-[9.5px] uppercase tracking-[0.12em] text-violet-soft px-1.5 py-[1px] rounded-full bg-violet-soft/10 border border-violet-soft/25">
            Recommended
          </span>
        ) : null}
      </div>
      <div className="text-[11.5px] text-fog-400 line-clamp-2">
        {guide.description || "—"}
      </div>
      <div className="mt-2 flex items-center gap-1">
        {Array.from({ length: stepCount }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-[3px] flex-1 rounded-full",
              selected ? "bg-violet-soft/60" : "bg-white/10 group-hover:bg-white/15",
            )}
          />
        ))}
      </div>
    </button>
  );
}

function CrewCard({
  slotId,
  role,
  label,
  providerId,
  providers,
  open,
  setOpen,
  onPick,
}: {
  slotId: string;
  role: Role;
  label: string;
  providerId: string;
  providers: ComposerProvider[];
  open: boolean;
  setOpen: Dispatch<SetStateAction<string | null>>;
  onPick: (id: string) => void;
}) {
  const tone = toneForRole(role);
  const Icon = iconForRole(role);
  const ref = useRef<HTMLDivElement | null>(null);
  const provider = providers.find((p) => p.id === providerId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(open ? null : slotId)}
        className={cn(
          "w-full text-left rounded-xl border px-3 py-2.5 transition group",
          open
            ? "border-violet-soft/40 bg-violet-500/[0.08] ring-1 ring-violet-soft/30"
            : "border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.04]",
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className={cn(
              "w-7 h-7 rounded-lg bg-gradient-to-br ring-1 flex items-center justify-center shrink-0",
              tone.grad,
              tone.ring,
              tone.text,
            )}
          >
            <Icon className="h-3 w-3" strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.16em] text-fog-400 leading-none">
              {label || role}
            </div>
            <div className="text-[12.5px] text-fog-100 font-medium truncate leading-tight mt-1">
              {provider?.label ?? providerId ?? "Unassigned"}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "h-3 w-3 transition",
              open ? "text-violet-soft rotate-180" : "text-fog-500 group-hover:text-fog-200",
            )}
            strokeWidth={1.7}
          />
        </div>
        <div className="flex items-center justify-between text-[10.5px]">
          <span className="text-fog-400 truncate">
            {provider?.available
              ? "available"
              : provider
                ? "not installed"
                : "pick agent"}
          </span>
          <span className="mono text-fog-500 shrink-0 ml-2">
            {provider?.confidence === "ready"
              ? "ready"
              : provider?.confidence === "detected-needs-setup"
                ? "setup"
                : "—"}
          </span>
        </div>
      </button>
      {open ? (
        <div className="absolute top-full left-0 right-0 mt-2 z-30 menu-surface overflow-hidden py-1 min-w-[260px]">
          {providers.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-fog-400">
              No providers discovered.
            </div>
          ) : (
            providers.map((p) => {
              const vendor = vendorForProvider(p.id);
              const sub =
                vendor && p.configured
                  ? `${vendor} · configured`
                  : vendor
                    ? `${vendor} · needs setup`
                    : p.configured
                      ? `${p.id} · configured`
                      : `${p.id} · needs setup`;
              const costSigil =
                p.id === "local-llama" || p.id === "ollama"
                  ? "free"
                  : p.confidence === "ready" && p.configured
                    ? "$$"
                    : p.confidence === "detected-needs-setup"
                      ? "$"
                      : "—";
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!p.available}
                  onClick={() => onPick(p.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 hover:bg-white/[0.05]",
                    !p.available && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] text-fog-100 truncate">
                        {p.label}
                      </div>
                      <div className="text-[11px] text-fog-400 truncate">
                        {sub}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {p.id === providerId ? (
                        <Check
                          className="h-3 w-3 text-violet-soft"
                          strokeWidth={1.7}
                        />
                      ) : null}
                      <span className="text-[10.5px] text-fog-400 mono">
                        {costSigil}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function SkillsChip({
  skills,
  selected,
  open,
  setOpen,
  toggle,
}: {
  skills: ComposerSkill[];
  selected: string[];
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  toggle: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpen]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className={cn(
          "h-7 px-2.5 rounded-full text-[11.5px] flex items-center gap-1.5 border transition whitespace-nowrap",
          open
            ? "border-violet-soft/40 bg-violet-500/[0.08] text-fog-100"
            : "border-white/[0.08] bg-white/[0.02] text-fog-300 hover:text-fog-100",
        )}
      >
        <Bolt className="h-3 w-3 text-amber-300" strokeWidth={1.7} />
        {selected.length} skill{selected.length === 1 ? "" : "s"}
        <ChevronDown
          className="h-3 w-3 text-fog-500"
          strokeWidth={1.7}
        />
      </button>
      {open ? (
        <div className="absolute top-full left-0 mt-2 z-30 menu-surface overflow-hidden py-1 min-w-[240px]">
          <div className="px-3 py-2 max-h-[280px] overflow-y-auto">
            {skills.length === 0 ? (
              <div className="text-[12px] text-fog-400 py-2">
                No skills discovered.
              </div>
            ) : (
              skills.map((s) => {
                const on = selected.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[12.5px]",
                      on
                        ? "bg-violet-500/10 text-violet-soft"
                        : "text-fog-200 hover:bg-white/[0.04]",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <ToneDot tone="violet" /> {s.name}
                    </span>
                    {on ? (
                      <Check className="h-3 w-3" strokeWidth={1.7} />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
