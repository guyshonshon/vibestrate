/**
 * WireframeGallery - ten complete variants of the flow x crew "relation"
 * visual, rendered side by side with one hard-coded sample so the direction can
 * be chosen before wiring the winner into MissionComposer. All in the flat,
 * square marketing language (violet = seat, emerald = role, hairlines).
 * V3 (staffed pipeline) is the current pick; V6-V10 are fresh takes on the
 * same flow + crew relation. Temporary review surface - not a shipping component.
 */
type Seat = { key: string; label: string };
type Role = { id: string; label: string; profile: string; seats: string[] };

const SEATS: Seat[] = [
  { key: "builder", label: "Builder" },
  { key: "challenger", label: "Challenger" },
  { key: "arbiter", label: "Arbiter" },
];
const ROLES: Role[] = [
  { id: "planner", label: "Planner", profile: "claude-balanced", seats: ["planner"] },
  { id: "backend", label: "Backend Implementer", profile: "codex-fast", seats: ["builder"] },
  { id: "reviewer", label: "Reviewer", profile: "codex-fast", seats: ["challenger"] },
  { id: "verifier", label: "Verifier", profile: "codex-fast", seats: ["arbiter"] },
  { id: "fixer", label: "Fixer", profile: "codex-fast", seats: [] },
];
const fillerFor = (k: string) => ROLES.find((r) => r.seats.includes(k)) ?? null;
const seatForRole = (id: string) => SEATS.find((s) => fillerFor(s.key)?.id === id) ?? null;
const SPARES = ROLES.filter((r) => !SEATS.some((s) => fillerFor(s.key)?.id === r.id));

export function WireframeGallery() {
  const variants = [
    { n: 1, name: "Bipartite wiring", desc: "Two columns, straight square connectors.", el: <V1 /> },
    { n: 2, name: "Assignment matrix", desc: "Seats x roles grid; a filled cell marks the fit.", el: <V2 /> },
    { n: 3, name: "Staffed pipeline", desc: "The flow as stages, each staffed by its role.", el: <V3 /> },
    { n: 4, name: "Dock slots", desc: "Seats are slots; the role card docks into each.", el: <V4 /> },
    { n: 5, name: "Assignment tree", desc: "Flow branches to seats, seats to roles.", el: <V5 /> },
    { n: 6, name: "Node graph", desc: "n8n grammar: stages wired as a flow; each node ports down to the role staffing it; spares benched.", el: <V6 /> },
    { n: 7, name: "Crew-first roster", desc: "The inverse lens - each role with its seat, spares on the bench.", el: <V7 /> },
    { n: 8, name: "Assignment band", desc: "The flow as one continuous bar, crew clipped under each stage.", el: <V8 /> },
    { n: 9, name: "Handoff ledger", desc: "Numbered manifest - stage, seat, the role that fills it.", el: <V9 /> },
    { n: 10, name: "Field & bench", desc: "Two zones - seats on the flow, reserve crew set apart.", el: <V10 /> },
  ];
  return (
    <div className="slab p-6">
      <h2 className="font-display text-[24px] font-semibold tracking-[-0.02em] text-fog-100">
        Composition wireframe - 10 variants
      </h2>
      <p className="mt-1 text-[13px] text-fog-400">
        Same flow (3 seats) and crew (5 roles, 2 spare). V3 is the current pick; V6-V10 are fresh takes on the same
        flow + crew relation. Pick the one you want and I'll wire it into the composer.
      </p>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {variants.map((v) => {
          const isPick = v.n === 3;
          return (
            <div key={v.n} className={cn2("bg-ink-50 border", isPick ? "border-emerald-400/40" : "border-white/[0.1]")}>
              <div className="border-b border-white/[0.08] px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="font-display text-[15px] font-semibold text-fog-100">
                    Variant {v.n} - {v.name}
                  </div>
                  {isPick ? (
                    <span className="mono text-[9px] uppercase tracking-[0.12em] text-emerald-300">current pick</span>
                  ) : null}
                </div>
                <div className="text-[12px] text-fog-400">{v.desc}</div>
              </div>
              <div className="p-4">{v.el}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const seatBox = "flex flex-col justify-center border border-violet-soft/35 bg-violet-soft/[0.08] px-3 py-2";
const roleBox = "flex flex-col justify-center border border-emerald-400/30 bg-emerald-500/[0.07] px-3 py-2";

/* ── V1: bipartite wiring ─────────────────────────────────────────────────── */
function V1() {
  const rowH = 46;
  const GUT = 48;
  const h = Math.max(SEATS.length, ROLES.length) * rowH;
  const links = SEATS.map((s, si) => {
    const rj = ROLES.findIndex((r) => r.id === fillerFor(s.key)?.id);
    return rj >= 0 ? { si, rj } : null;
  }).filter((x): x is { si: number; rj: number } => x !== null);
  const cy = (i: number) => i * rowH + rowH / 2;
  return (
    <div className="flex items-start">
      <div className="flex flex-1 flex-col">
        {SEATS.map((s) => (
          <div key={s.key} className="flex items-center" style={{ height: rowH }}>
            <div className={cn2(seatBox, "h-[34px] w-full")}>
              <span className="truncate text-[12.5px] text-fog-100">{s.label}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0" style={{ width: GUT }}>
        <svg width={GUT} height={h} className="block" aria-hidden>
          {links.map((l, k) => (
            <g key={k}>
              <rect x={0} y={cy(l.si) - 3} width={6} height={6} fill="#a78bfa" />
              <line x1={6} y1={cy(l.si)} x2={GUT - 6} y2={cy(l.rj)} stroke="#34d399" strokeWidth="1.6" />
              <rect x={GUT - 6} y={cy(l.rj) - 3} width={6} height={6} fill="#34d399" />
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-1 flex-col">
        {ROLES.map((r) => {
          const used = SEATS.some((s) => fillerFor(s.key)?.id === r.id);
          return (
            <div key={r.id} className="flex items-center" style={{ height: rowH }}>
              <div className={cn2(used ? roleBox : "flex flex-col justify-center border border-white/[0.1] bg-ink-200 px-3 py-2 opacity-55", "h-[34px] w-full")}>
                <span className="truncate text-[12px] text-fog-100">{r.label}</span>
                <span className="mono text-[9.5px] text-fog-400">{r.profile}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── V2: assignment matrix ────────────────────────────────────────────────── */
function V2() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th className="border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-fog-400">seat \ role</th>
            {ROLES.map((r) => (
              <th key={r.id} className="border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[10.5px] font-medium text-fog-300">
                <span className="block truncate" style={{ maxWidth: 70 }}>{r.label.split(" ")[0]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SEATS.map((s) => (
            <tr key={s.key}>
              <td className="border border-white/[0.08] bg-violet-soft/[0.08] px-2 py-2 text-[12px] text-fog-100">{s.label}</td>
              {ROLES.map((r) => {
                const fit = r.seats.includes(s.key);
                return (
                  <td key={r.id} className="border border-white/[0.08] px-2 py-2 text-center" style={fit ? { background: "rgba(52,211,153,0.12)" } : undefined}>
                    {fit ? <span className="inline-block h-2.5 w-2.5" style={{ background: "var(--emerald)" }} /> : <span className="text-fog-600">·</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── V3: staffed pipeline ─────────────────────────────────────────────────── */
function V3() {
  return (
    <div className="flex items-stretch gap-0 overflow-x-auto">
      {SEATS.map((s, i) => {
        const role = fillerFor(s.key);
        return (
          <div key={s.key} className="flex items-stretch">
            <div className="flex min-w-[120px] flex-col">
              <div className="border border-violet-soft/35 bg-violet-soft/[0.1] px-3 py-2">
                <div className="mono text-[9px] uppercase tracking-[0.1em] text-violet-soft/80">stage {i + 1}</div>
                <div className="truncate text-[13px] font-semibold text-fog-100">{s.label}</div>
              </div>
              <div className="border border-t-0 border-emerald-400/25 bg-emerald-500/[0.06] px-3 py-1.5">
                <div className="truncate text-[11.5px] text-fog-100">{role?.label ?? "open"}</div>
                <div className="mono text-[9.5px] text-fog-400">{role?.profile ?? "-"}</div>
              </div>
            </div>
            {i < SEATS.length - 1 ? (
              <div className="flex items-center px-1 text-fog-500">›</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ── V4: dock slots ───────────────────────────────────────────────────────── */
function V4() {
  return (
    <div className="flex flex-col gap-2.5">
      {SEATS.map((s) => {
        const role = fillerFor(s.key);
        return (
          <div key={s.key} className="border border-violet-soft/30 bg-violet-soft/[0.05] p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-fog-100">{s.label}</span>
              <span className="mono text-[9px] uppercase tracking-[0.1em] text-violet-soft/80">seat</span>
            </div>
            <div className="border border-dashed border-emerald-400/40 p-1">
              {role ? (
                <div className="flex items-center justify-between bg-emerald-500/[0.08] px-2.5 py-1.5">
                  <span className="truncate text-[12px] text-fog-100">{role.label}</span>
                  <span className="mono text-[10px] text-fog-400">{role.profile}</span>
                </div>
              ) : (
                <div className="px-2.5 py-1.5 text-[11px] text-fog-500">empty slot</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── V5: assignment tree ──────────────────────────────────────────────────── */
function V5() {
  const n = SEATS.length;
  const W = 360;
  const colW = W / n;
  const cx = (i: number) => colW * i + colW / 2;
  return (
    <div className="relative" style={{ width: W, maxWidth: "100%" }}>
      <div className="mx-auto w-fit border border-violet-soft/40 bg-violet-soft/[0.1] px-4 py-1.5 text-center text-[12.5px] font-semibold text-fog-100">
        Quality Arbitration
      </div>
      <svg width={W} height={28} className="block" aria-hidden style={{ maxWidth: "100%" }}>
        {SEATS.map((_, i) => (
          <line key={i} x1={W / 2} y1={0} x2={cx(i)} y2={28} stroke="rgba(167,139,250,0.5)" strokeWidth="1.4" />
        ))}
      </svg>
      <div className="flex">
        {SEATS.map((s) => {
          const role = fillerFor(s.key);
          return (
            <div key={s.key} className="flex flex-col items-center" style={{ width: colW }}>
              <div className="w-[92%] border border-violet-soft/30 bg-violet-soft/[0.07] px-1.5 py-1 text-center text-[11px] text-fog-100">
                {s.label}
              </div>
              <svg width={10} height={16} aria-hidden>
                <line x1={5} y1={0} x2={5} y2={16} stroke="#34d399" strokeWidth="1.4" />
              </svg>
              <div className="w-[92%] border border-emerald-400/30 bg-emerald-500/[0.07] px-1.5 py-1 text-center">
                <div className="truncate text-[10.5px] text-fog-100">{role?.label ?? "open"}</div>
                <div className="mono text-[8.5px] text-fog-400">{role?.profile ?? "-"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── V6: node graph (n8n grammar - header strip + ports + wires - squared) ─── */
function V6() {
  const stages = SEATS.map((s, i) => ({ s, i, role: fillerFor(s.key) }));
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="text-[12px] font-medium text-violet-soft">Flow</span>
        <span className="h-px w-3 bg-fog-500" />
        <span className="text-[12px] font-medium text-emerald-300">Crew</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex items-start" style={{ minWidth: "min-content" }}>
          {stages.map(({ s, i, role }) => (
            <div key={s.key} className="flex items-start">
              <div className="flex w-[140px] flex-col">
                {/* stage node = a step in the flow */}
                <div className="border border-violet-soft/40 bg-ink-100">
                  <div className="bg-violet-soft/[0.16] px-2.5 py-1 text-[11px] font-medium text-violet-soft">
                    Stage {i + 1}
                  </div>
                  <div className="px-2.5 py-2 text-[13px] font-semibold text-fog-100">{s.label}</div>
                </div>
                {/* drop wire: stage out-port -> role in-port */}
                <div className="flex flex-col items-center py-0.5">
                  <span className="h-[5px] w-[5px] bg-violet-soft" />
                  <span className="h-3 w-px bg-fog-500" />
                  <span className="h-[5px] w-[5px] bg-emerald-400" />
                </div>
                {/* role node = the crew member staffing the stage */}
                <div className="border border-emerald-400/40 bg-ink-100">
                  <div className="h-[3px] bg-emerald-500/60" />
                  <div className="px-2.5 py-2">
                    <div className="truncate text-[12.5px] text-fog-100">{role?.label ?? "open"}</div>
                    <span className="mt-1.5 inline-block border border-white/10 bg-white/[0.06] px-1.5 py-0.5">
                      <span className="mono text-[11px] text-fog-200">{role?.profile ?? "-"}</span>
                    </span>
                  </div>
                </div>
              </div>
              {/* flow connector to the next stage (square plug) */}
              {i < SEATS.length - 1 ? (
                <div className="flex h-[58px] w-6 items-center justify-center">
                  <span className="h-px flex-1 bg-fog-500/70" />
                  <span className="h-[5px] w-[5px] shrink-0 bg-fog-300" />
                  <span className="h-px flex-1 bg-fog-500/70" />
                </div>
              ) : null}
            </div>
          ))}
          {/* bench: spare crew, no node wired in */}
          <div className="ml-5 flex flex-col gap-1.5 self-stretch border-l border-white/[0.08] pl-5">
            <span className="text-[11px] text-fog-400">Bench</span>
            {SPARES.map((r) => (
              <div key={r.id} className="w-[124px] border border-white/[0.1] bg-ink-200 opacity-60">
                <div className="h-[3px] bg-white/10" />
                <div className="px-2.5 py-1.5 text-[12px] text-fog-200">{r.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── V7: crew-first roster ────────────────────────────────────────────────── */
function V7() {
  const ordered = [...ROLES].sort(
    (a, b) => Number(!!seatForRole(b.id)) - Number(!!seatForRole(a.id)),
  );
  return (
    <div className="border border-white/[0.08]">
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-ink-200 px-3 py-1.5">
        <span className="text-[11px] font-medium text-fog-300">Crew</span>
        <span className="mono text-[9px] uppercase tracking-[0.1em] text-fog-500">role - seat</span>
      </div>
      {ordered.map((r, idx) => {
        const seat = seatForRole(r.id);
        return (
          <div
            key={r.id}
            className={cn2("flex items-center justify-between gap-3 px-3 py-2", idx > 0 && "border-t border-white/[0.06]")}
          >
            <div className="min-w-0">
              <div className="truncate text-[12.5px] text-fog-100">{r.label}</div>
              <div className="mono text-[9.5px] text-fog-400">{r.profile}</div>
            </div>
            {seat ? (
              <span className="shrink-0 border border-violet-soft/35 bg-violet-soft/[0.1] px-2 py-1 text-[10.5px] text-fog-100">
                {seat.label}
              </span>
            ) : (
              <span className="shrink-0 border border-white/[0.1] px-2 py-1 text-[10.5px] text-fog-500">bench</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── V8: assignment band ──────────────────────────────────────────────────── */
function V8() {
  return (
    <div>
      <div className="flex">
        {SEATS.map((s, i) => {
          const role = fillerFor(s.key);
          return (
            <div key={s.key} className="min-w-0 flex-1">
              <div className={cn2("border border-violet-soft/35 bg-violet-soft/[0.1] px-2.5 py-2", i > 0 && "border-l-0")}>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="truncate text-[12px] font-medium text-fog-100">{s.label}</span>
                  <span className="mono text-[8.5px] text-violet-soft/70">
                    {i + 1}/{SEATS.length}
                  </span>
                </div>
              </div>
              <div
                className={cn2(
                  "border border-t-0 border-emerald-400/25 bg-emerald-500/[0.06] px-2.5 py-1.5",
                  i > 0 && "border-l-0",
                )}
              >
                <div className="truncate text-[11px] text-fog-100">{role?.label ?? "open"}</div>
                <div className="mono text-[9px] text-fog-400">{role?.profile ?? "-"}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 border border-white/[0.08] bg-ink-100 px-2.5 py-1.5">
        <span className="mono text-[9px] uppercase tracking-[0.1em] text-fog-500">bench</span>
        <div className="flex flex-wrap gap-1.5">
          {SPARES.map((r) => (
            <span key={r.id} className="border border-white/[0.1] bg-ink-200 px-2 py-0.5 text-[10px] text-fog-400">
              {r.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── V9: handoff ledger ───────────────────────────────────────────────────── */
function V9() {
  return (
    <div className="border border-white/[0.08] bg-ink-50">
      {SEATS.map((s, i) => {
        const role = fillerFor(s.key);
        return (
          <div
            key={s.key}
            className={cn2("flex items-center gap-3 px-3 py-2", i > 0 && "border-t border-white/[0.06]")}
          >
            <span className="mono text-[11px] text-fog-500">{String(i + 1).padStart(2, "0")}</span>
            <span className="w-[88px] shrink-0 border-l border-violet-soft/40 pl-2 text-[12px] text-fog-100">{s.label}</span>
            <span className="text-fog-500">&larr;</span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-fog-100">{role?.label ?? "open"}</span>
            <span className="mono text-[9.5px] text-fog-400">{role?.profile ?? "-"}</span>
          </div>
        );
      })}
      <div className="border-t border-white/[0.1] bg-ink-100 px-3 py-1.5">
        <span className="mono text-[9px] uppercase tracking-[0.1em] text-fog-500">reserve</span>
        <span className="ml-2 text-[10.5px] text-fog-400">{SPARES.map((r) => r.label).join(", ")}</span>
      </div>
    </div>
  );
}

/* ── V10: field & bench ───────────────────────────────────────────────────── */
function V10() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
      <div className="border border-violet-soft/30 bg-violet-soft/[0.04] p-2.5">
        <div className="mono mb-2 text-[9px] uppercase tracking-[0.12em] text-violet-soft/80">on the flow</div>
        <div className="flex flex-col gap-2">
          {SEATS.map((s) => {
            const role = fillerFor(s.key);
            return (
              <div key={s.key} className="flex items-center justify-between gap-2 border border-white/[0.08] bg-ink-100 px-2.5 py-1.5">
                <span className="text-[12px] font-medium text-fog-100">{s.label}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 bg-emerald-400" />
                  <span className="truncate text-[11px] text-fog-300">{role?.label ?? "open"}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="border border-white/[0.08] bg-ink-100 p-2.5 sm:w-[132px]">
        <div className="mono mb-2 text-[9px] uppercase tracking-[0.12em] text-fog-500">reserve</div>
        <div className="flex flex-col gap-1.5">
          {SPARES.map((r) => (
            <div key={r.id} className="border border-white/[0.08] bg-ink-200 px-2 py-1 opacity-70">
              <div className="truncate text-[11px] text-fog-200">{r.label}</div>
              <div className="mono text-[8.5px] text-fog-500">{r.profile}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function cn2(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}
