import { Check } from "lucide-react";
import { cn } from "../../design/cn.js";
import { classifyRole, iconForRole, toneForRole } from "../../design/roleTone.js";
import type { GuideRunState } from "../../../lib/types.js";

type Slot = {
  id: string;
  role: ReturnType<typeof classifyRole>;
  label: string;
  agent: string | null;
  state: "active" | "done" | "queued" | "skipped" | "failed";
};

function deriveSlots(guide: GuideRunState | null | undefined): Slot[] {
  if (!guide) return [];
  // Stitch participants (one per slot id) with their most-recent step status.
  const byId = new Map<string, Slot>();
  for (const p of guide.participants) {
    byId.set(p.slotId, {
      id: p.slotId,
      role: classifyRole(p.label || p.slotId),
      label: p.label,
      agent: p.providerId || null,
      state: "queued",
    });
  }
  for (const step of guide.steps) {
    if (!step.slotId) continue;
    const cur = byId.get(step.slotId);
    if (!cur) continue;
    if (step.status === "running") cur.state = "active";
    else if (step.status === "passed" && cur.state !== "active")
      cur.state = "done";
    else if (step.status === "failed") cur.state = "failed";
    else if (step.status === "skipped" && cur.state === "queued")
      cur.state = "skipped";
  }
  return [...byId.values()];
}

export function CrewStrip({ guide }: { guide: GuideRunState | null | undefined }) {
  const slots = deriveSlots(guide);
  if (slots.length === 0) return null;
  // Always render 4 columns so the rhythm matches the design.
  const padded: (Slot | null)[] = [...slots];
  while (padded.length < 4) padded.push(null);
  const done = slots.filter((s) => s.state === "done").length;
  const total = slots.filter((s) => s.state !== "skipped").length;
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="eyebrow">2 · Crew · current agent highlighted</span>
        <span className="text-[11.5px] text-fog-400 whitespace-nowrap">
          {done}/{total} steps complete
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {padded.slice(0, 4).map((s, i) =>
          s ? <Card key={s.id} s={s} /> : <Placeholder key={`__p${i}`} />,
        )}
      </div>
    </section>
  );
}

function Card({ s }: { s: Slot }) {
  const tone = toneForRole(s.role);
  const Icon = iconForRole(s.role);
  const cls = {
    active:
      "border-violet-soft/45 bg-violet-500/[0.08] ring-1 ring-violet-soft/25",
    done: "border-white/[0.07] bg-white/[0.02] opacity-90",
    queued: "border-white/[0.05] bg-white/[0.015] opacity-65",
    failed: "border-rose-400/30 bg-rose-500/[0.06]",
    skipped: "border-dashed border-white/[0.07] bg-white/[0.01] opacity-50",
  }[s.state];
  return (
    <div className={cn("relative rounded-xl border px-3 py-2.5 transition", cls)}>
      {s.state === "active" ? (
        <span className="absolute top-2 right-3 text-[10px] uppercase tracking-[0.16em] text-violet-soft mono">
          live
        </span>
      ) : null}
      {s.state === "done" ? (
        <span className="absolute top-2 right-3 text-emerald-300/80">
          <Check className="h-3 w-3" strokeWidth={1.7} />
        </span>
      ) : null}
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
            {s.label || s.role}
          </div>
          <div className="text-[12.5px] text-fog-100 font-medium truncate leading-tight mt-1">
            {s.agent ?? "—"}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between text-[10.5px]">
        <span className="text-fog-400 truncate">{s.role}</span>
        {s.state === "active" ? (
          <span className="flex items-center gap-1 text-violet-soft">
            <span className="pulse-dot" />
            <span className="mono">running</span>
          </span>
        ) : (
          <span className="mono text-fog-500 capitalize">{s.state}</span>
        )}
      </div>
    </div>
  );
}

function Placeholder() {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.07] bg-white/[0.01] px-3 py-2.5 opacity-50">
      <div className="text-[10px] uppercase tracking-[0.16em] text-fog-500 mb-1">
        Slot
      </div>
      <div className="text-[12px] text-fog-500">Not used by this guide</div>
    </div>
  );
}
