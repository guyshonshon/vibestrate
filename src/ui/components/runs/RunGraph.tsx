// One graph for the whole run: the flow topology AND the audit, merged, with a
// dedicated orchestrator-engagement lane beside it. The dependency DAG is laid
// out top-to-bottom in longest-path layers (the shared `layersOf` the Flow
// graph, CLI, and TUI use): the orchestrator roots the top, each step descends
// below the steps it needs, concurrent steps sit side by side in a "parallel"
// wave, and joins converge below. Nodes stay compact - status + label + a couple
// of high-signal badges - and a hover/focus popover reveals the detail (phase,
// crew role, profile, tokens, attempt chain, inside-the-turn tools/sub-agents).
//
// The lane shows where the orchestrator *engaged*: selection, review/verify
// verdicts, fan-out, fallbacks, gates, pauses, budget actions - each classified
// judgment (model, advisory) vs enforced (code gate) vs structural, per the
// honesty boundary in docs/design/responsible-orchestrator.md. Hovering a lane
// row highlights the step it touched, and vice versa.
//
// It renders live (flow status + live engagement) and, once terminal, enriches
// each node from /audit. Sourced from the live flow ledger + RunAudit +
// /engagement.
import { useState } from "react";
import type {
  RunAudit,
  AuditStep,
  AuditAttempt,
  AuditAttemptOutcome,
  EngagementEntry,
  EngagementTone,
  FlowRunState,
} from "../../lib/types";
import { isGraphSteps, layersOf } from "../workflow/FlowGraph.js";

const OUTCOME: Record<AuditAttemptOutcome, { icon: string; tone: string; dot: string }> = {
  success: { icon: "✓", tone: "text-emerald-300", dot: "bg-emerald-400" },
  "rate-limit": { icon: "◷", tone: "text-amber-300", dot: "bg-amber-400" },
  transient: { icon: "↻", tone: "text-amber-300", dot: "bg-amber-400" },
  fallback: { icon: "⇄", tone: "text-cyan-300", dot: "bg-cyan-400" },
  paused: { icon: "‖", tone: "text-cyan-300", dot: "bg-cyan-400" },
  "tolerated-failure": { icon: "!", tone: "text-amber-300", dot: "bg-amber-400" },
  failed: { icon: "✕", tone: "text-rose-300", dot: "bg-rose-400" },
};

const STATUS: Record<string, { dot: string; tone: string }> = {
  passed: { dot: "bg-emerald-400", tone: "text-emerald-300" },
  failed: { dot: "bg-rose-400", tone: "text-rose-300" },
  blocked: { dot: "bg-rose-400", tone: "text-rose-300" },
  skipped: { dot: "bg-fog-600", tone: "text-fog-400" },
  running: { dot: "bg-violet-soft animate-pulse", tone: "text-violet-soft" },
  pending: { dot: "bg-fog-600/60", tone: "text-fog-500" },
};

// Engagement: glyph = class (◆ judgment · ◼ enforced · ⟂ structural), color = tone.
const ENGAGE_GLYPH = { judgment: "◆", enforced: "◼", structural: "⟂" } as const;
const TONE_COLOR: Record<EngagementTone, string> = {
  ok: "text-emerald-300",
  warn: "text-amber-300",
  bad: "text-rose-300",
  info: "text-fog-400",
};

type NodeData = {
  id: string;
  label: string;
  kind: string;
  seat: string | null;
  role: string | null;
  stage: string | null;
  profileId: string | null;
  needs: string[];
  status: string;
  audit: AuditStep | null;
};

function statusOf(s: string) {
  return STATUS[s] ?? { dot: "bg-fog-600", tone: "text-fog-400" };
}

function fmtTok(n: number | null | undefined): string {
  if (n == null) return "?";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Floating detail revealed on hover/focus. Anchored below the node with a
 *  transparent padding bridge so the pointer can travel into it. */
function Popover({ node }: { node: NodeData }) {
  const a = node.audit;
  const st = statusOf(node.status);
  const meta = [
    node.role ?? node.seat,
    a?.provider,
    a?.model,
    a?.durationMs != null ? `${(a.durationMs / 1000).toFixed(1)}s` : null,
    a?.costUsd != null ? `$${a.costUsd.toFixed(3)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasTokens = a?.tokensIn != null || a?.tokensOut != null;
  const sub = [
    node.stage,
    node.profileId ? `profile ${node.profileId}` : null,
    hasTokens ? `${fmtTok(a?.tokensIn)}→${fmtTok(a?.tokensOut)} tok` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasInside = (a?.tools.length ?? 0) > 0 || (a?.subAgents.length ?? 0) > 0;
  return (
    <div className="pointer-events-none invisible absolute left-1/2 top-full z-50 w-72 -translate-x-1/2 pt-2 opacity-0 transition-opacity duration-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
      <div className="pointer-events-auto rounded-lg border border-white/10 bg-[#11151d] p-3 text-left shadow-xl">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-medium text-fog-100">{node.label}</span>
          <span className={`ml-auto text-[11px] ${st.tone}`}>{node.status}</span>
        </div>
        <div className="mt-0.5 text-[10.5px] text-fog-500">
          <span className="mono">{node.kind}</span>
          {meta ? ` · ${meta}` : ""}
        </div>
        {sub ? <div className="mt-0.5 text-[10px] text-fog-600">{sub}</div> : null}
        {node.needs.length > 0 ? (
          <div className="mt-0.5 text-[10px] text-fog-600">after {node.needs.join(", ")}</div>
        ) : null}

        {a && a.attempts.length > 0 ? (
          <div className="mt-2">
            <div className="eyebrow mb-1 text-[9px]">attempts</div>
            <ul className="list-none space-y-0.5 p-0">
              {a.attempts.map((at: AuditAttempt, i) => {
                const o = OUTCOME[at.outcome];
                return (
                  <li key={i} className="flex items-baseline gap-1.5 text-[11px]">
                    <span className={`${o.tone} w-3 text-center`}>{o.icon}</span>
                    <span className={o.tone}>{at.outcome}</span>
                    {at.detail ? <span className="text-fog-500">{at.detail}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {hasInside ? (
          <div className="mt-2">
            <div className="eyebrow mb-1 text-[9px]">inside the turn</div>
            {a!.tools.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {a!.tools.map((t) => (
                  <span key={t.name} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-fog-300">
                    {t.name}
                    {t.count > 1 ? <span className="text-fog-500">{"×"}{t.count}</span> : null}
                  </span>
                ))}
              </div>
            ) : null}
            {a!.subAgents.map((sa, i) => (
              <div key={i} className="mt-1 text-[10.5px] text-violet-soft">
                <span className="mr-1">{"⤷"}</span>
                <span className="text-fog-400">{sa.description ?? sa.name}</span>
              </div>
            ))}
          </div>
        ) : a?.internalsOpaque ? (
          <div className="mt-1.5 text-[10px] italic text-fog-600">inside: opaque</div>
        ) : null}

        {a?.decision ? (
          <div className="mt-2 text-[10.5px] text-fog-300">decision: {a.decision}</div>
        ) : null}
      </div>
    </div>
  );
}

/** A small chip badge on the compact node (only the high-signal ones). */
function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`rounded px-1 text-[10px] leading-[1.4] ${tone}`}>{children}</span>
  );
}

function Node({
  node,
  highlighted,
  onHover,
}: {
  node: NodeData;
  highlighted: boolean;
  onHover: (id: string | null) => void;
}) {
  const st = statusOf(node.status);
  const a = node.audit;
  return (
    <div
      tabIndex={0}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      className={`group relative w-56 rounded-lg border bg-ink-200/40 px-3 py-2 outline-none transition-colors hover:border-white/20 focus-visible:border-violet-soft/60 ${
        highlighted ? "border-violet-soft/60 ring-1 ring-violet-soft/40" : "border-white/[0.07]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
        <span className="truncate text-[12.5px] font-medium text-fog-100">{node.label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {a && a.retries > 0 ? (
            <Badge tone="bg-amber-400/10 text-amber-300">{"↻"}{a.retries}</Badge>
          ) : null}
          {a?.fellBack ? <Badge tone="bg-cyan-400/10 text-cyan-300">{"⇄"}</Badge> : null}
          {a && a.subAgents.length > 0 ? (
            <Badge tone="bg-violet-soft/10 text-violet-soft">{"⤷"}{a.subAgents.length}</Badge>
          ) : null}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[10px] text-fog-600">
        {node.stage ? `${node.stage} · ` : ""}
        {node.role ?? node.kind}
        {node.seat ? ` · ${node.seat}` : ""}
      </div>
      <Popover node={node} />
    </div>
  );
}

function Connector({ note }: { note?: string | null }) {
  return (
    <div className="flex flex-col items-center py-0.5" aria-hidden>
      <span className="h-3.5 w-px bg-white/12" />
      <span className="-mt-[3px] text-[8px] leading-none text-white/20">{"▼"}</span>
      {note ? <span className="mt-0.5 text-[9px] text-fog-600">{note}</span> : null}
    </div>
  );
}

function Layer({
  nodes,
  hl,
  onHover,
}: {
  nodes: NodeData[];
  hl: string | null;
  onHover: (id: string | null) => void;
}) {
  if (nodes.length === 1) {
    return (
      <div className="flex justify-center">
        <Node node={nodes[0]!} highlighted={hl === nodes[0]!.id} onHover={onHover} />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2">
      <div className="mb-1.5 text-center text-[9px] uppercase tracking-[0.12em] text-fog-600">
        parallel {"×"}{nodes.length}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {nodes.map((n) => (
          <Node key={n.id} node={n} highlighted={hl === n.id} onHover={onHover} />
        ))}
      </div>
    </div>
  );
}

function EngagementRow({
  e,
  active,
  onHover,
}: {
  e: EngagementEntry;
  active: boolean;
  onHover: (id: string | null) => void;
}) {
  return (
    <li
      onMouseEnter={() => (e.stepId ? onHover(e.stepId) : undefined)}
      onMouseLeave={() => onHover(null)}
      className={`flex items-baseline gap-1.5 rounded px-1.5 py-1 text-[11px] transition-colors ${
        active ? "bg-violet-soft/10 ring-1 ring-violet-soft/40" : "hover:bg-white/[0.03]"
      }`}
    >
      <span className={`w-3 shrink-0 text-center ${TONE_COLOR[e.tone]}`}>{ENGAGE_GLYPH[e.cls]}</span>
      <div className="min-w-0">
        <div className="truncate text-fog-200">{e.title}</div>
        {e.detail || e.stepId ? (
          <div className="truncate text-[10px] text-fog-600">
            {e.stepId ? <span className="mono">{e.stepId}</span> : null}
            {e.stepId && e.detail ? " · " : ""}
            {e.detail}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function EngagementLane({
  entries,
  hl,
  onHover,
}: {
  entries: EngagementEntry[];
  hl: string | null;
  onHover: (id: string | null) => void;
}) {
  return (
    <aside className="lg:w-72 lg:shrink-0">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="eyebrow">Orchestrator engaged</span>
        {entries.length > 0 ? (
          <span className="mono text-[10px] text-fog-500">{entries.length}</span>
        ) : null}
      </div>
      <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-2">
        {entries.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-fog-600">No supervisory events yet.</p>
        ) : (
          <ol className="list-none space-y-0.5 p-0">
            {entries.map((e) => (
              <EngagementRow key={e.seq} e={e} active={!!e.stepId && hl === e.stepId} onHover={onHover} />
            ))}
          </ol>
        )}
        <div className="mt-2 border-t border-white/5 px-1 pt-1.5 text-[9.5px] leading-relaxed text-fog-600">
          <span className="text-fog-400">◆</span> judgment (advisory){"   "}
          <span className="text-fog-300">◼</span> enforced (gate){"   "}
          <span className="text-fog-600">⟂</span> flow
        </div>
      </div>
    </aside>
  );
}

export function RunGraph({
  flow,
  audit,
  engagement,
}: {
  flow: FlowRunState | null;
  audit: RunAudit | null;
  engagement: EngagementEntry[];
}) {
  const [hl, setHl] = useState<string | null>(null);
  const auditById = new Map((audit?.steps ?? []).map((s) => [s.id, s]));
  const nodes: NodeData[] = flow
    ? flow.steps.map((s) => {
        const au = auditById.get(s.id) ?? null;
        return {
          id: s.id,
          label: s.label,
          kind: s.kind,
          seat: s.seat,
          role: s.resolvedRoleLabel ?? au?.roleLabel ?? null,
          stage: s.stage ?? au?.stage ?? null,
          profileId: s.profileId ?? au?.profileId ?? null,
          needs: s.needs ?? [],
          status: s.status,
          audit: au,
        };
      })
    : (audit?.steps ?? []).map((s) => ({
        id: s.id,
        label: s.label,
        kind: s.kind,
        seat: s.seat,
        role: s.roleLabel,
        stage: s.stage,
        profileId: s.profileId,
        needs: s.needs,
        status: s.status,
        audit: s,
      }));

  if (nodes.length === 0 && engagement.length === 0) return null;
  const layers = isGraphSteps(nodes) ? layersOf(nodes) : nodes.map((n) => [n]);
  const live = !audit;
  // A fan-out note for a parallel wave, if the orchestrator recorded one.
  const fanout = engagement.find((e) => e.anchor === "fanout");

  return (
    <section data-screen-label="Run graph">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="eyebrow">
          {live ? "Run graph · live" : "Run graph · what happened"}
        </span>
        <span className="mono text-[11px] text-fog-400">
          {audit ? (
            <>
              {audit.totals.turns} turns {"·"} {audit.totals.retries} retries {"·"}{" "}
              {audit.totals.fallbacks} fallbacks
              {audit.totals.costUsd != null ? ` · $${audit.totals.costUsd.toFixed(3)}` : ""}
            </>
          ) : (
            `${nodes.length} steps`
          )}
        </span>
      </div>
      <div className="glass p-4">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col items-stretch">
              {/* Root: the orchestrator. The whole DAG descends from it. */}
              <div className="flex justify-center">
                <div className="group relative w-56 rounded-lg border border-violet-soft/30 bg-violet-soft/[0.06] px-3 py-2 outline-none" tabIndex={0}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-violet-soft" />
                    <span className="text-[12.5px] font-semibold text-fog-100">orchestrator</span>
                    <span className="ml-auto text-[11px] text-fog-300">
                      {(audit?.status ?? flow?.flowId ?? "").toString().replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-fog-600">
                    {(audit?.flow?.label ?? flow?.label) ?? "flow"}
                    {audit?.assuranceVerdict ? ` · ${audit.assuranceVerdict.replace(/_/g, " ")}` : ""}
                  </div>
                </div>
              </div>

              {layers.map((layerNodes, li) => (
                <div key={li}>
                  <Connector note={layerNodes.length > 1 && fanout ? fanout.title : null} />
                  <Layer nodes={layerNodes} hl={hl} onHover={setHl} />
                </div>
              ))}
            </div>
          </div>

          <EngagementLane entries={engagement} hl={hl} onHover={setHl} />
        </div>
      </div>
    </section>
  );
}
