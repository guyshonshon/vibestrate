// MissionTreeProposal - Direction A "Mission Tree".
//
// One self-contained run-control proposal for the Shape phase. Two faces share
// a single visual language:
//   (1) SPEC-ENTRY: a focused glass card of CTO gap-questions that the user
//       answers; submitting "seeds" the tree (the questions collapse into the
//       root node). See `GAP_QUESTIONS`.
//   (2) LIVE TASK-RUNNING: a telemetry-forward NODE-TREE - phase-grouped seats
//       (scope -> spec -> architecture -> risks -> review) plus a decomposition
//       tree of cards, each a dense row with a live progress bar and aligned
//       tokens / tools / time columns, connected by hand-rolled tree-guides.
//
// Self-contained: only "react" is imported, all data is mock, colour comes
// exclusively from the --s-* design tokens via inline style. No app modules.
import { useMemo, useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────
 * Types (local, not imported from app)
 * ───────────────────────────────────────────────────────────────────────── */

type Gap = {
  id: string;
  question: string;
  why: string;
  kind: "choice" | "text";
  options?: string[];
};

type NodeStatus = "pending" | "running" | "done" | "blocked";

type TreeNode = {
  id: string;
  name: string;
  seat: string;
  status: NodeStatus;
  /** 0..1 live progress (only meaningful while running, but kept for done=1). */
  progress: number;
  tokens: number;
  tools: number;
  /** elapsed seconds */
  elapsed: number;
  children?: TreeNode[];
};

type PhaseGroup = {
  id: string;
  label: string;
  /** dot states, left to right, mirror the child nodes' status */
  dots: NodeStatus[];
};

/* ─────────────────────────────────────────────────────────────────────────
 * Mock data - a believable "mini ecommerce store" shape run
 * ───────────────────────────────────────────────────────────────────────── */

const GAP_QUESTIONS: Gap[] = [
  {
    id: "auth",
    question: "Who can place an order?",
    why: "Customers store payment data, so guest-only vs accounts changes the auth, the data model, and your compliance surface.",
    kind: "choice",
    options: ["Guest checkout only", "Accounts required", "Guest + optional account"],
  },
  {
    id: "payments",
    question: "How do you want to take money?",
    why: "Hosted checkout offloads card data (lighter PCI scope); a custom flow keeps you on-site but raises the bar.",
    kind: "choice",
    options: ["Stripe hosted checkout", "Stripe Elements on-site", "Decide later"],
  },
  {
    id: "catalog",
    question: "Roughly how many products at launch?",
    why: "Tens of items is a flat list; thousands needs search, facets, and a different read path.",
    kind: "choice",
    options: ["Under 50", "50 - 1,000", "Thousands"],
  },
  {
    id: "shipping",
    question: "Do you ship physical goods, or sell digital?",
    why: "Physical pulls in addresses, rates, and fulfilment; digital is entitlements and downloads - a smaller build.",
    kind: "choice",
    options: ["Physical goods", "Digital only", "Both"],
  },
  {
    id: "brand",
    question: "Anything specific about the store we should design around?",
    why: "Catches the unstated constraint early (region, language, an existing stack) before it reshapes the architecture.",
    kind: "text",
  },
];

const TREE: TreeNode[] = [
  {
    id: "scope",
    name: "Scope the brief",
    seat: "planner",
    status: "done",
    progress: 1,
    tokens: 4120,
    tools: 3,
    elapsed: 42,
  },
  {
    id: "spec",
    name: "Draft the spec",
    seat: "planner",
    status: "done",
    progress: 1,
    tokens: 9860,
    tools: 5,
    elapsed: 118,
    children: [
      {
        id: "spec-data",
        name: "Data model + entities",
        seat: "planner",
        status: "done",
        progress: 1,
        tokens: 3240,
        tools: 2,
        elapsed: 51,
      },
      {
        id: "spec-flows",
        name: "Customer + checkout flows",
        seat: "planner",
        status: "done",
        progress: 1,
        tokens: 2890,
        tools: 1,
        elapsed: 44,
      },
    ],
  },
  {
    id: "arch",
    name: "Architecture",
    seat: "architect",
    status: "running",
    progress: 0.62,
    tokens: 7430,
    tools: 4,
    elapsed: 73,
    children: [
      {
        id: "arch-storefront",
        name: "Storefront + cart",
        seat: "architect",
        status: "done",
        progress: 1,
        tokens: 2610,
        tools: 1,
        elapsed: 39,
      },
      {
        id: "arch-payments",
        name: "Payments + webhooks",
        seat: "architect",
        status: "running",
        progress: 0.45,
        tokens: 1980,
        tools: 2,
        elapsed: 28,
        children: [
          {
            id: "arch-pay-intent",
            name: "PaymentIntent + idempotency",
            seat: "architect",
            status: "running",
            progress: 0.3,
            tokens: 740,
            tools: 1,
            elapsed: 11,
          },
          {
            id: "arch-pay-reconcile",
            name: "Order reconciliation",
            seat: "architect",
            status: "pending",
            progress: 0,
            tokens: 0,
            tools: 0,
            elapsed: 0,
          },
        ],
      },
      {
        id: "arch-provision",
        name: "Provisioning checklist",
        seat: "architect",
        status: "pending",
        progress: 0,
        tokens: 0,
        tools: 0,
        elapsed: 0,
      },
    ],
  },
  {
    id: "risks",
    name: "Risks + tradeoffs",
    seat: "planner",
    status: "pending",
    progress: 0,
    tokens: 0,
    tools: 0,
    elapsed: 0,
  },
  {
    id: "review",
    name: "Shape review",
    seat: "reviewer",
    status: "blocked",
    progress: 0,
    tokens: 0,
    tools: 0,
    elapsed: 0,
  },
];

const PHASES: PhaseGroup[] = [
  { id: "intake", label: "Intake", dots: ["done"] },
  { id: "shape", label: "Shape", dots: ["done", "done", "running", "pending"] },
  { id: "roadmap", label: "Roadmap", dots: ["blocked"] },
];

/* ─────────────────────────────────────────────────────────────────────────
 * Small helpers
 * ───────────────────────────────────────────────────────────────────────── */

function fmtTokens(n: number): string {
  if (n <= 0) return "-";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function fmtElapsed(s: number): string {
  if (s <= 0) return "-";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`;
}

/** Status -> token-driven colours. Only ok / soft / warn tokens carry status. */
function statusInk(status: NodeStatus): string {
  switch (status) {
    case "done":
      return "var(--s-ok-ink)";
    case "running":
      return "var(--s-soft-ink)";
    case "blocked":
      return "var(--s-warn-ink)";
    default:
      return "var(--s-ink-faint)";
  }
}

function statusFill(status: NodeStatus): string {
  switch (status) {
    case "done":
      return "var(--s-ok)";
    case "running":
      return "var(--s-soft)";
    case "blocked":
      return "rgba(251,191,36,0.16)";
    default:
      return "transparent";
  }
}

function statusLabel(status: NodeStatus): string {
  switch (status) {
    case "done":
      return "done";
    case "running":
      return "running";
    case "blocked":
      return "blocked";
    default:
      return "pending";
  }
}

/** Flatten the tree to ordered rows carrying depth + sibling/last metadata so
 *  the tree-guide rails (the connecting edges) can be drawn per row. */
type FlatRow = {
  node: TreeNode;
  depth: number;
  /** for each ancestor level, whether a vertical rail should continue through */
  ancestorsHaveNext: boolean[];
  isLast: boolean;
};

function flatten(nodes: TreeNode[]): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (list: TreeNode[], depth: number, ancestors: boolean[]) => {
    list.forEach((node, i) => {
      const isLast = i === list.length - 1;
      out.push({ node, depth, ancestorsHaveNext: ancestors, isLast });
      if (node.children && node.children.length > 0) {
        walk(node.children, depth + 1, [...ancestors, !isLast]);
      }
    });
  };
  walk(nodes, 0, []);
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Tree-guide rail: hand-rolled SVG that draws the elbow + continuation lines
 * for one row, given its depth + ancestor rail state.
 * ───────────────────────────────────────────────────────────────────────── */

const INDENT = 22; // px per depth level
const RAIL_H = 56; // row height the rail is painted into

function TreeRail({ row }: { row: FlatRow }) {
  const { depth, ancestorsHaveNext, isLast, node } = row;
  const width = (depth + 1) * INDENT;
  const elbowX = depth * INDENT + INDENT / 2;
  const nodeY = RAIL_H / 2;
  const line = "var(--s-line)";

  return (
    <svg
      width={width}
      height={RAIL_H}
      style={{ flex: "0 0 auto", display: "block" }}
      aria-hidden
    >
      {/* continuation rails for ancestors that still have siblings below */}
      {ancestorsHaveNext.map((cont, d) =>
        cont ? (
          <line
            key={`c${d}`}
            x1={d * INDENT + INDENT / 2}
            y1={0}
            x2={d * INDENT + INDENT / 2}
            y2={RAIL_H}
            stroke={line}
            strokeWidth={1}
          />
        ) : null,
      )}
      {depth > 0 ? (
        <>
          {/* vertical drop into this node (full height unless last child) */}
          <line
            x1={elbowX}
            y1={0}
            x2={elbowX}
            y2={isLast ? nodeY : RAIL_H}
            stroke={line}
            strokeWidth={1}
          />
          {/* horizontal elbow to the node */}
          <line
            x1={elbowX}
            y1={nodeY}
            x2={elbowX + INDENT / 2 + 2}
            y2={nodeY}
            stroke={line}
            strokeWidth={1}
          />
        </>
      ) : null}
      {/* node anchor pip - status coloured */}
      <circle
        cx={depth === 0 ? INDENT / 2 : elbowX + INDENT / 2 + 2}
        cy={nodeY}
        r={node.status === "running" ? 4 : 3}
        fill={
          node.status === "pending"
            ? "var(--s-bg)"
            : statusInk(node.status)
        }
        stroke={node.status === "pending" ? line : "transparent"}
        strokeWidth={1}
      />
      {node.status === "running" ? (
        <circle
          cx={depth === 0 ? INDENT / 2 : elbowX + INDENT / 2 + 2}
          cy={nodeY}
          r={7}
          fill="none"
          stroke={statusInk(node.status)}
          strokeWidth={1}
          opacity={0.5}
          className="mt-pulse-ring"
        />
      ) : null}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * One telemetry row: name + seat + status, a thin live bar, and the aligned
 * right-hand columns (tokens / tools / time).
 * ───────────────────────────────────────────────────────────────────────── */

function NodeRow({ row }: { row: FlatRow }) {
  const { node } = row;
  const ink = statusInk(node.status);
  const isLeaf = !node.children || node.children.length === 0;

  return (
    <div
      className="mt-row"
      style={{
        display: "flex",
        alignItems: "stretch",
        borderBottom: "1px solid var(--s-line)",
      }}
    >
      <TreeRail row={row} />
      <div
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 14px",
          height: RAIL_H,
        }}
      >
        {/* name block */}
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: row.depth === 0 ? 600 : 500,
                color: node.status === "pending" ? "var(--s-ink-dim)" : "var(--s-ink)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {node.name}
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontFamily: "var(--font-term, monospace)",
                color: statusInk(node.status),
                background: statusFill(node.status),
                padding: "1.5px 6px",
                borderRadius: 5,
                whiteSpace: "nowrap",
              }}
            >
              {statusLabel(node.status)}
            </span>
          </div>
          {/* seat + a thin live progress bar (only carries weight while running) */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span
              style={{
                fontSize: 10.5,
                fontFamily: "var(--font-term, monospace)",
                color: "var(--s-ink-faint)",
                whiteSpace: "nowrap",
              }}
            >
              {node.seat}
              {isLeaf ? " · leaf" : ` · ${node.children!.length} sub`}
            </span>
            <div
              style={{
                position: "relative",
                flex: "1 1 auto",
                height: 3,
                maxWidth: 220,
                background: "var(--s-slab-2)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                className={node.status === "running" ? "mt-bar-live" : undefined}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${Math.round(node.progress * 100)}%`,
                  background: ink,
                  borderRadius: 3,
                  opacity: node.status === "pending" ? 0 : 1,
                }}
              />
            </div>
          </div>
        </div>

        {/* aligned telemetry columns */}
        <TelemetryCell value={fmtTokens(node.tokens)} sub="tok" dim={node.tokens <= 0} />
        <TelemetryCell value={node.tools > 0 ? String(node.tools) : "-"} sub="tools" dim={node.tools <= 0} />
        <TelemetryCell value={fmtElapsed(node.elapsed)} sub="time" dim={node.elapsed <= 0} />
      </div>
    </div>
  );
}

function TelemetryCell({ value, sub, dim }: { value: string; sub: string; dim?: boolean }) {
  return (
    <div
      style={{
        width: 64,
        flex: "0 0 auto",
        textAlign: "right",
        fontFamily: "var(--font-term, monospace)",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
          color: dim ? "var(--s-ink-faint)" : "var(--s-ink)",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 9.5, color: "var(--s-ink-faint)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Phase rail (left): each phase group with a row of progress dots + a count.
 * ───────────────────────────────────────────────────────────────────────── */

function PhaseRail({ activeId }: { activeId: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {PHASES.map((p) => {
        const total = p.dots.length;
        const doneCount = p.dots.filter((d) => d === "done").length;
        const running = p.dots.some((d) => d === "running");
        const active = p.id === activeId;
        return (
          <div
            key={p.id}
            className="s-interact mt-phase"
            style={{
              border: "1px solid var(--s-line)",
              borderRadius: 8,
              padding: "10px 11px",
              background: active ? "var(--s-glass-2)" : "transparent",
              borderColor: active ? "var(--s-hover-line)" : "var(--s-line)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: active ? "var(--s-ink)" : "var(--s-ink-dim)",
                }}
              >
                {p.label}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontFamily: "var(--font-term, monospace)",
                  color: running ? "var(--s-soft-ink)" : "var(--s-ink-faint)",
                }}
              >
                {doneCount}/{total}
              </span>
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
              {p.dots.map((d, i) => (
                <span
                  key={i}
                  className={d === "running" ? "mt-pulse" : undefined}
                  style={{
                    width: d === "running" ? 16 : 8,
                    height: 6,
                    borderRadius: 3,
                    flex: d === "done" ? "1 1 auto" : "0 0 auto",
                    background:
                      d === "pending"
                        ? "var(--s-slab-2)"
                        : statusInk(d),
                    opacity: d === "pending" ? 1 : d === "blocked" ? 0.85 : 1,
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Spec-entry: the focused glass card of gap-questions that seeds the tree.
 * ───────────────────────────────────────────────────────────────────────── */

function SpecEntry({
  answers,
  setAnswer,
  onSubmit,
}: {
  answers: Record<string, string>;
  setAnswer: (id: string, v: string) => void;
  onSubmit: () => void;
}) {
  const answered = GAP_QUESTIONS.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  const requiredAnswered = GAP_QUESTIONS.filter(
    (q) => q.kind === "choice" && (answers[q.id] ?? "").trim().length > 0,
  ).length;
  const totalRequired = GAP_QUESTIONS.filter((q) => q.kind === "choice").length;
  const ready = requiredAnswered === totalRequired;

  return (
    <div
      className="s-glass"
      style={{
        border: "1px solid var(--s-line)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 0 0 1px var(--s-glow), 0 18px 60px -34px var(--s-glow)",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "13px 16px",
          borderBottom: "1px solid var(--s-line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 9,
              background: "var(--s-accent-bright)",
              boxShadow: "0 0 10px var(--s-glow)",
              flex: "0 0 auto",
            }}
            className="mt-pulse"
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--s-ink)" }}>
              Scope the work
            </div>
            <div style={{ fontSize: 11.5, color: "var(--s-ink-dim)", marginTop: 1 }}>
              The CTO surfaced {GAP_QUESTIONS.length} gaps in your brief. Answer them and the
              plan seeds itself.
            </div>
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-term, monospace)",
            color: "var(--s-ink-dim)",
            background: "var(--s-soft)",
            padding: "3px 8px",
            borderRadius: 6,
            whiteSpace: "nowrap",
          }}
        >
          {answered}/{GAP_QUESTIONS.length} answered
        </span>
      </div>

      {/* questions */}
      <div style={{ padding: "8px 16px 4px" }}>
        {GAP_QUESTIONS.map((q, i) => {
          const val = answers[q.id] ?? "";
          return (
            <div
              key={q.id}
              style={{
                padding: "13px 0",
                borderBottom:
                  i < GAP_QUESTIONS.length - 1 ? "1px solid var(--s-line)" : "none",
              }}
            >
              <div style={{ display: "flex", gap: 10 }}>
                <span
                  style={{
                    fontFamily: "var(--font-term, monospace)",
                    fontSize: 11,
                    color: val ? "var(--s-ok-ink)" : "var(--s-ink-faint)",
                    width: 18,
                    flex: "0 0 auto",
                    paddingTop: 2,
                  }}
                >
                  {val ? "ok" : String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--s-ink)" }}>
                    {q.question}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--s-ink-faint)",
                      marginTop: 3,
                      lineHeight: 1.45,
                    }}
                  >
                    {q.why}
                  </div>

                  {q.kind === "choice" ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
                      {q.options!.map((opt) => {
                        const on = val === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setAnswer(q.id, on ? "" : opt)}
                            className="s-interact"
                            style={{
                              fontSize: 12.5,
                              padding: "6px 11px",
                              borderRadius: 6,
                              cursor: "pointer",
                              border: "1px solid",
                              borderColor: on ? "transparent" : "var(--s-line)",
                              background: on ? "var(--s-soft)" : "var(--s-slab)",
                              color: on ? "var(--s-soft-ink)" : "var(--s-ink-dim)",
                            }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder="Optional - region, language, an existing stack, anything we missed"
                      className="s-focusable"
                      style={{
                        marginTop: 9,
                        width: "100%",
                        boxSizing: "border-box",
                        fontSize: 13,
                        padding: "8px 11px",
                        borderRadius: 7,
                        border: "1px solid var(--s-line)",
                        background: "var(--s-slab)",
                        color: "var(--s-ink)",
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* submit footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          padding: "13px 16px",
          borderTop: "1px solid var(--s-line)",
          background: "var(--s-glass-2)",
        }}
      >
        <span style={{ fontSize: 11.5, color: ready ? "var(--s-ok-ink)" : "var(--s-warn-ink)" }}>
          {ready
            ? "Scoped. Submitting launches a read-only shape run - nothing pushes or merges."
            : `Answer the ${totalRequired - requiredAnswered} remaining scope question${
                totalRequired - requiredAnswered === 1 ? "" : "s"
              } to launch.`}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!ready}
          className="s-interact"
          style={{
            flex: "0 0 auto",
            fontSize: 13,
            fontWeight: 600,
            padding: "9px 18px",
            borderRadius: 8,
            cursor: ready ? "pointer" : "not-allowed",
            border: "1px solid transparent",
            background: ready ? "var(--s-accent)" : "var(--s-slab-2)",
            color: ready ? "var(--s-on-accent)" : "var(--s-ink-faint)",
            opacity: ready ? 1 : 0.7,
          }}
        >
          Seed the plan
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Live node-tree view (the workflow-progress panel made literal).
 * ───────────────────────────────────────────────────────────────────────── */

function summarize(nodes: TreeNode[]): { tokens: number; tools: number; running: number; total: number } {
  let tokens = 0;
  let tools = 0;
  let running = 0;
  let total = 0;
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      tokens += n.tokens;
      tools += n.tools;
      total += 1;
      if (n.status === "running") running += 1;
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return { tokens, tools, running, total };
}

function LiveTree({ seeded }: { seeded: boolean }) {
  const rows = useMemo(() => flatten(TREE), []);
  const totals = useMemo(() => summarize(TREE), []);

  return (
    <div
      className="slab"
      style={{
        borderRadius: 14,
        overflow: "hidden",
        background: "var(--s-slab)",
        color: "var(--s-slab-ink)",
      }}
    >
      {/* header: title + elapsed + run totals */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          padding: "13px 16px",
          borderBottom: "1px solid var(--s-line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span
            className="mt-pulse"
            style={{
              width: 8,
              height: 8,
              borderRadius: 8,
              background: "var(--s-soft-ink)",
              flex: "0 0 auto",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--s-ink)" }}>
              Mini ecommerce store
            </div>
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--font-term, monospace)",
                color: "var(--s-ink-faint)",
                marginTop: 1,
              }}
            >
              shape run · {totals.running} running · {totals.total} nodes
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <HeaderStat label="elapsed" value="5m 06s" />
          <HeaderStat label="tokens" value={fmtTokens(totals.tokens)} />
          <HeaderStat label="tools" value={String(totals.tools)} />
        </div>
      </div>

      {/* the seed banner - the questions "collapsing" into the root */}
      {seeded ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "8px 16px",
            borderBottom: "1px solid var(--s-line)",
            background: "var(--s-ok)",
          }}
        >
          <span style={{ fontSize: 11.5, color: "var(--s-ok-ink)", fontWeight: 500 }}>
            Scope locked from your answers. The intake folded into the root - the tree is live.
          </span>
        </div>
      ) : null}

      {/* column header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "7px 16px 7px 0",
          borderBottom: "1px solid var(--s-line)",
          background: "var(--s-slab-2)",
        }}
      >
        <span style={{ width: INDENT, flex: "0 0 auto" }} />
        <span
          style={{
            flex: "1 1 auto",
            paddingLeft: 14,
            fontSize: 10.5,
            fontFamily: "var(--font-term, monospace)",
            color: "var(--s-ink-faint)",
          }}
        >
          node · seat · progress
        </span>
        <ColHead label="tokens" />
        <ColHead label="tools" />
        <ColHead label="time" />
      </div>

      {/* the tree rows */}
      <div>
        {rows.map((row) => (
          <NodeRow key={row.node.id} row={row} />
        ))}
      </div>

      {/* footer roll-up */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 16px",
          background: "var(--s-slab-2)",
        }}
      >
        <span style={{ fontSize: 11.5, color: "var(--s-ink-dim)" }}>
          Architecture in progress - payments seat is decomposing. Risks and review unlock next.
        </span>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-term, monospace)",
            color: "var(--s-ink-faint)",
            background: "var(--s-soft)",
            padding: "3px 9px",
            borderRadius: 6,
          }}
        >
          max-depth 3
        </span>
      </div>
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "var(--font-term, monospace)",
          fontVariantNumeric: "tabular-nums",
          color: "var(--s-ink)",
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 9.5, color: "var(--s-ink-faint)", marginTop: 1 }}>{label}</div>
    </div>
  );
}

function ColHead({ label }: { label: string }) {
  return (
    <span
      style={{
        width: 64,
        flex: "0 0 auto",
        textAlign: "right",
        fontSize: 10.5,
        fontFamily: "var(--font-term, monospace)",
        color: "var(--s-ink-faint)",
        paddingRight: 14,
      }}
    >
      {label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Root component
 * ───────────────────────────────────────────────────────────────────────── */

export default function MissionTreeProposal() {
  const [answers, setAnswers] = useState<Record<string, string>>({
    auth: "Accounts required",
    payments: "Stripe hosted checkout",
  });
  const [seeded, setSeeded] = useState(false);

  const setAnswer = (id: string, v: string) =>
    setAnswers((cur) => ({ ...cur, [id]: v }));

  const activePhase = "shape";

  return (
    <div
      data-scene
      className="scene-ground"
      style={{
        background: "var(--s-bg)",
        color: "var(--s-ink)",
        padding: 22,
        minHeight: "100%",
        fontFamily:
          "var(--font-display, ui-sans-serif, system-ui, sans-serif)",
      }}
    >
      <style>{`
        @keyframes mtPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes mtPulseRing { 0%{transform-origin:center;opacity:.55} 70%{opacity:0} 100%{opacity:0} }
        @keyframes mtBar { 0%{opacity:1} 50%{opacity:.62} 100%{opacity:1} }
        .mt-pulse { animation: mtPulse 1.8s var(--ease-out, ease) infinite; }
        .mt-pulse-ring { animation: mtPulseRing 1.8s var(--ease-out, ease) infinite; }
        .mt-bar-live { animation: mtBar 1.6s var(--ease-out, ease) infinite; }
        .mt-row:last-child { border-bottom: none !important; }
        .mt-row:hover { background: var(--s-glass-2); }
        @media (prefers-reduced-motion: reduce) {
          .mt-pulse, .mt-pulse-ring, .mt-bar-live { animation: none; }
        }
      `}</style>

      {/* page title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 18,
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, color: "var(--s-ink)" }}>
            Shape a plan
          </div>
          <div style={{ fontSize: 12.5, color: "var(--s-ink-dim)", marginTop: 2 }}>
            Answer the gaps, then watch the CTO decompose the work into a reviewable tree.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSeeded((s) => !s)}
          className="s-interact"
          style={{
            fontSize: 12,
            fontFamily: "var(--font-term, monospace)",
            padding: "7px 12px",
            borderRadius: 7,
            cursor: "pointer",
            border: "1px solid var(--s-line)",
            background: "var(--s-slab)",
            color: "var(--s-ink-dim)",
          }}
        >
          {seeded ? "view: live tree" : "view: spec entry"} · toggle
        </button>
      </div>

      {/* main split: left phase rail, right stacked (spec-entry + live tree) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(180px, 220px) minmax(0, 1fr)",
          gap: 22,
          alignItems: "start",
        }}
      >
        {/* LEFT: phase rail */}
        <aside style={{ position: "sticky", top: 16 }}>
          <div
            style={{
              fontSize: 10.5,
              fontFamily: "var(--font-term, monospace)",
              color: "var(--s-ink-faint)",
              marginBottom: 9,
              paddingLeft: 2,
            }}
          >
            phases
          </div>
          <PhaseRail activeId={activePhase} />

          <div
            style={{
              marginTop: 16,
              border: "1px solid var(--s-line)",
              borderRadius: 8,
              padding: "11px 12px",
            }}
          >
            <div style={{ fontSize: 11.5, color: "var(--s-ink-dim)", lineHeight: 1.5 }}>
              The chain is three short read-only runs: intake, shape, roadmap. You step between
              the links - no held-open process.
            </div>
          </div>
        </aside>

        {/* RIGHT: the two faces */}
        <main style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
          {!seeded ? (
            <SpecEntry answers={answers} setAnswer={setAnswer} onSubmit={() => setSeeded(true)} />
          ) : null}
          <LiveTree seeded={seeded} />
        </main>
      </div>
    </div>
  );
}
