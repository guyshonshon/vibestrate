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
  Cpu,
  Lock,
  Play,
  Save,
  Sparkles,
  Users,
} from "lucide-react";
import { KBD, ToneDot, type ChipTone } from "../../design/Chip.js";
import { cn } from "../../design/cn.js";
import { classifyRole } from "../../design/roleTone.js";

// Map a classified role to a Chip tone for the role dot.
function roleDotTone(label: string): ChipTone {
  switch (classifyRole(label)) {
    case "Reviewer":
      return "sky";
    case "Verifier":
      return "emerald";
    case "Arbiter":
      return "amber";
    default:
      return "violet";
  }
}
import type {
  CrewView,
  DiscoveredFlow,
  FlowContextPolicy,
  ProfileView,
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
  flowId: string | null;
  crewId: string | null;
  contextPolicy: FlowContextPolicy;
  stepProfileOverrides: Record<string, string>;
  skills: string[];
  readOnly: boolean;
};

type Props = {
  busy: boolean;
  providers: ComposerProvider[];
  defaultProviderId: string | null;
  skills: ComposerSkill[];
  flows: DiscoveredFlow[];
  crews: CrewView[];
  defaultCrewId: string | null;
  profiles: ProfileView[];
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

// One resolved allocation row: a seated Flow step → the Crew role that fills
// its seat → the profile it'll run on → the provider behind that profile.
type AllocStatus = "ok" | "uncovered" | "ambiguous";
type AllocRow = {
  stepId: string;
  stepLabel: string;
  seat: string;
  status: AllocStatus;
  candidates: { roleId: string; label: string; profile: string }[];
  roleLabel: string | null;
  profileId: string | null;
  provider: string | null;
};

/**
 * Mission Control composer (v3 layout).
 *
 *   1 · The brief    — narrow auto-growing textarea
 *   2 · Flow         — full-shape chips with step pips
 *   3 · Crew         — pick a crew; the Step→Seat→Role→Profile allocation is
 *                      derived and shown, with per-step profile overrides
 *   4 · Run          — skills + read-only + presets + Send
 */
export function ComposerV3({
  busy,
  providers,
  defaultProviderId,
  skills,
  flows,
  crews,
  defaultCrewId,
  profiles,
  presets,
  onSubmit,
  onSavePreset,
  onDeletePreset,
  onCustomizeFlow,
}: Props) {
  const [brief, setBrief] = useState("");
  const [flowId, setFlowId] = useState<string>(() => flows[0]?.id ?? "");
  const [crewId, setCrewId] = useState<string | null>(defaultCrewId);
  const [stepProfiles, setStepProfiles] = useState<Record<string, string>>({});
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const presetsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (crewId === null && defaultCrewId) setCrewId(defaultCrewId);
  }, [defaultCrewId, crewId]);

  useEffect(() => {
    if (flowId) return;
    if (flows.length === 0) return;
    const pick = flows.find((g) => /arbitr|quality/i.test(g.label)) ?? flows[0]!;
    setFlowId(pick.id);
  }, [flows, flowId]);

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

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineH = 24;
    const max = 14 * lineH;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [brief]);

  const selectedFlow = useMemo(
    () => flows.find((g) => g.id === flowId) ?? null,
    [flowId, flows],
  );
  const crew = useMemo(
    () => crews.find((c) => c.id === crewId) ?? null,
    [crews, crewId],
  );

  // Derive the full allocation client-side from the flow's seated steps +
  // the selected crew + profiles. The server re-validates on submit.
  const allocation = useMemo<AllocRow[]>(() => {
    if (!selectedFlow) return [];
    const rows: AllocRow[] = [];
    for (const step of selectedFlow.definition.steps) {
      if (!step.seat) continue;
      const candidates = (crew?.roles ?? [])
        .filter((r) => r.seats.includes(step.seat!))
        .map((r) => ({ roleId: r.id, label: r.label, profile: r.profile }));
      let status: AllocStatus = "ok";
      let roleLabel: string | null = null;
      let profileId: string | null = null;
      let provider: string | null = null;
      if (candidates.length === 0) status = "uncovered";
      else if (candidates.length > 1) status = "ambiguous";
      else {
        const role = candidates[0]!;
        roleLabel = role.label;
        profileId = stepProfiles[step.id] ?? role.profile;
        provider = profiles.find((p) => p.id === profileId)?.provider ?? null;
      }
      rows.push({
        stepId: step.id,
        stepLabel: step.label,
        seat: step.seat,
        status,
        candidates,
        roleLabel,
        profileId,
        provider,
      });
    }
    return rows;
  }, [selectedFlow, crew, profiles, stepProfiles]);

  const blockers = allocation.filter((r) => r.status !== "ok");
  const canSend = brief.trim().length > 0 && !busy && blockers.length === 0;

  function toggleSkill(id: string) {
    setSelectedSkills((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  function setStepProfile(stepId: string, profileId: string, roleDefault: string) {
    setStepProfiles((cur) => {
      const next = { ...cur };
      if (profileId === roleDefault) delete next[stepId];
      else next[stepId] = profileId;
      return next;
    });
  }

  function handleSubmit() {
    const trimmed = brief.trim();
    if (!trimmed || busy || blockers.length > 0) return;
    void onSubmit({
      brief: trimmed,
      flowId: flowId || null,
      crewId,
      contextPolicy: "balanced",
      stepProfileOverrides: stepProfiles,
      skills: selectedSkills,
      readOnly,
    });
  }

  function buildPreset(kind: "crew" | "template", name: string): ComposerPreset {
    return {
      name,
      kind,
      brief: kind === "template" ? brief.trim() || null : null,
      flow: flowId
        ? {
            id: flowId,
            contextPolicy: "balanced",
            stepProfileOverrides: stepProfiles,
            skippedOptionalSteps: [],
          }
        : null,
      crewId,
      profileOverride: null,
      skills: selectedSkills,
      readOnly,
    };
  }

  function applyPreset(p: ComposerPreset) {
    if (p.flow) {
      setFlowId(p.flow.id);
      setStepProfiles(p.flow.stepProfileOverrides ?? {});
    }
    if (p.crewId) setCrewId(p.crewId);
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
        ? `${crew?.label ?? "Crew"} preset`
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
              2 · Flow{selectedFlow ? ` · ${selectedFlow.label}` : ""}
            </span>
            <span className="text-[11px] text-fog-400 flex items-center gap-2 whitespace-nowrap">
              {selectedFlow ? (
                <>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" strokeWidth={1.7} />
                    {selectedFlow.definition.steps.length} steps
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
          {flows.length === 0 ? (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-[12.5px] text-fog-400">
              No flows discovered yet. Project-local flows live in{" "}
              <span className="mono">.vibestrate/flows/</span>.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {flows.slice(0, 8).map((g) => (
                <FlowChip
                  key={g.id}
                  flow={g}
                  selected={g.id === flowId}
                  onSelect={() => {
                    setFlowId(g.id);
                    setStepProfiles({});
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* 3 · Crew + allocation */}
        <div className="px-5 pt-3 pb-4 border-t border-white/[0.06]">
          <div className="flex items-baseline justify-between mb-2.5 flex-wrap gap-2">
            <span className="eyebrow flex items-center gap-1.5">
              <Users className="h-3 w-3" strokeWidth={1.8} /> 3 · Crew
            </span>
            <div className="flex items-center gap-3 text-[11.5px] text-fog-400 whitespace-nowrap">
              <button
                type="button"
                onClick={() => promptAndSave("crew")}
                className="hover:text-fog-200 flex items-center gap-1.5"
              >
                <Save className="h-3 w-3" strokeWidth={1.7} /> Save as preset
              </button>
            </div>
          </div>

          {/* crew selector */}
          {crews.length === 0 ? (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[12.5px] text-fog-400">
              No crews configured. Add one under{" "}
              <span className="mono">crews:</span> in{" "}
              <span className="mono">.vibestrate/project.yml</span>.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {crews.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCrewId(c.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[12.5px] transition",
                    c.id === crewId
                      ? "border-violet-soft/45 bg-violet-soft/[0.08] text-fog-100 ring-1 ring-violet-soft/30"
                      : "border-white/[0.08] bg-white/[0.02] text-fog-300 hover:text-fog-100",
                  )}
                >
                  {c.label}
                  {c.id === defaultCrewId ? (
                    <span className="ml-1.5 text-[10px] text-fog-500">default</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}

          {/* allocation table */}
          {selectedFlow && allocation.length > 0 ? (
            <AllocationTable
              rows={allocation}
              profiles={profiles}
              onSetProfile={setStepProfile}
              onCustomizeCrew={onCustomizeFlow}
            />
          ) : null}
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
                            {p.kind} · {p.flow?.id ?? "no flow"} ·{" "}
                            {p.crewId ?? "default crew"}
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
            disabled={!canSend}
            title={
              blockers.length > 0
                ? "Resolve the seat issues below before sending."
                : undefined
            }
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

// ─── allocation table ───────────────────────────────────────────────────────

function AllocationTable({
  rows,
  profiles,
  onSetProfile,
  onCustomizeCrew,
}: {
  rows: AllocRow[];
  profiles: ProfileView[];
  onSetProfile: (stepId: string, profileId: string, roleDefault: string) => void;
  onCustomizeCrew: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] overflow-hidden">
      <div className="grid grid-cols-[1.4fr_0.9fr_1.1fr_1.4fr] gap-2 px-3 py-1.5 bg-white/[0.02] eyebrow">
        <span>Step</span>
        <span>Seat</span>
        <span>Role</span>
        <span>Profile · provider</span>
      </div>
      {rows.map((r) => {
        const roleDefault =
          r.candidates.length === 1 ? r.candidates[0]!.profile : "";
        return (
          <div
            key={r.stepId}
            className={cn(
              "grid grid-cols-[1.4fr_0.9fr_1.1fr_1.4fr] gap-2 px-3 py-2 items-center border-t border-white/[0.05] text-[12px]",
              r.status !== "ok" ? "bg-rose-500/[0.04]" : "",
            )}
          >
            <span className="text-fog-200 truncate">{r.stepLabel}</span>
            <span className="mono text-[11px] text-fog-400 truncate">
              {r.seat}
            </span>
            {r.status === "ok" ? (
              <span className="text-fog-100 truncate flex items-center gap-1.5">
                <ToneDot tone={roleDotTone(r.roleLabel ?? r.seat)} />
                {r.roleLabel}
              </span>
            ) : r.status === "uncovered" ? (
              <button
                type="button"
                onClick={onCustomizeCrew}
                className="text-rose-300 text-[11px] text-left hover:underline"
                title="No role in this crew takes this seat."
              >
                no role — fix crew
              </button>
            ) : (
              <button
                type="button"
                onClick={onCustomizeCrew}
                className="text-amber-300 text-[11px] text-left hover:underline"
                title={`More than one role takes "${r.seat}": ${r.candidates
                  .map((c) => c.label)
                  .join(", ")}.`}
              >
                ambiguous ×{r.candidates.length} — fix crew
              </button>
            )}
            {r.status === "ok" ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <select
                  value={r.profileId ?? ""}
                  onChange={(e) =>
                    onSetProfile(r.stepId, e.target.value, roleDefault)
                  }
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-ink-200/70 px-1.5 py-1 text-[11.5px] text-fog-100 outline-none focus:border-violet-soft/40"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {p.id === roleDefault ? " (default)" : ""}
                    </option>
                  ))}
                  {r.profileId &&
                  !profiles.some((p) => p.id === r.profileId) ? (
                    <option value={r.profileId}>{r.profileId}</option>
                  ) : null}
                </select>
                <span className="mono text-[10px] text-fog-500 shrink-0 inline-flex items-center gap-1">
                  <Cpu className="h-3 w-3 text-violet-soft" strokeWidth={1.7} />
                  {r.provider ?? "—"}
                </span>
              </div>
            ) : (
              <span className="text-fog-500 text-[11px]">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FlowChip({
  flow,
  selected,
  onSelect,
}: {
  flow: DiscoveredFlow;
  selected: boolean;
  onSelect: () => void;
}) {
  const stepCount = flow.definition.steps.length;
  const isRecommended = /quality|arbitr/i.test(flow.label);
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
          {flow.label}
        </span>
        {isRecommended ? (
          <span className="ml-auto shrink-0 text-[9.5px] uppercase tracking-[0.12em] text-violet-soft px-1.5 py-[1px] rounded-full bg-violet-soft/10 border border-violet-soft/25">
            Recommended
          </span>
        ) : null}
      </div>
      <div className="text-[11.5px] text-fog-400 line-clamp-2">
        {flow.description || "—"}
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
        <ChevronDown className="h-3 w-3 text-fog-500" strokeWidth={1.7} />
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
                    {on ? <Check className="h-3 w-3" strokeWidth={1.7} /> : null}
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
