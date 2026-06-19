// GraphCanvasProposal - Direction B "Graph Canvas".
//
// One self-contained run-control proposal for the Shape phase. The NODE-TREE is
// the primary surface: a spatial, top-down DAG drawn on a soft canvas with
// hand-rolled SVG edges and absolutely-positioned node cards laid out in
// topological layers (the FlowGraph idiom, made spatial + richer). The root is
// the intake node; in spec-entry mode it visually expands into the child plan
// nodes as the answers are filled, and the right inspector holds the gap-question
// form. In live mode the inspector shows the focused node's telemetry detail.
//
// Self-contained: the ONLY import is React. All colour comes from var(--s-*)
// tokens via inline styles. No app modules, no extra deps, no SVG libs.
//
// Constraints honoured: no emojis, no em-dashes (hyphen only), no rounded
// pill/chip labels (flat tinted text on a subtle tinted bg, <=6px radius), no
// faint uppercase eyebrow kicker above titles, dense + telemetry-forward cards,
// status colour only via the ok/soft/warn tokens.

import React from "react";

/* ------------------------------------------------------------------ types -- */

type NodeStatus = "pending" | "running" | "done" | "blocked";
type Phase = "intake" | "shape" | "decompose" | "review";

type GraphNode = {
  id: string;
  label: string;
  kind: string; // seat / role, shown mono
  phase: Phase;
  needs: string[]; // upstream node ids -> edges
  status: NodeStatus;
  tokens: number; // telemetry: cumulative tokens
  tools: number; // telemetry: tool-calls
  elapsedMs: number; // telemetry: node wall time
  note?: string; // one-line inspector summary
  detail?: string[]; // inspector bullet detail
};

type GapKind = "choice" | "text";
type GapQuestion = {
  id: string;
  question: string;
  why: string;
  kind: GapKind;
  options?: string[];
};

/* ------------------------------------------------------------- mock data -- */
// A believable "mini ecommerce store" shape run.

const QUESTIONS: GapQuestion[] = [
  {
    id: "auth",
    question: "Do shoppers need accounts, or is guest checkout enough?",
    why: "Accounts let you store order history and saved carts, but add auth, sessions, and a password-reset surface to build and secure.",
    kind: "choice",
    options: ["Guest only", "Optional accounts", "Accounts required"],
  },
  {
    id: "payments",
    question: "Which payment path do you want for v1?",
    why: "A hosted checkout (Stripe Checkout) keeps card data off your servers; a custom flow is more work and pulls you into PCI scope.",
    kind: "choice",
    options: ["Stripe hosted checkout", "Custom Stripe Elements", "Decide later"],
  },
  {
    id: "catalog",
    question: "Roughly how large is the catalog at launch?",
    why: "Tens of products fit a flat file; thousands need a real datastore, search, and pagination, which changes the architecture.",
    kind: "choice",
    options: ["Under 50", "50 - 1,000", "Thousands"],
  },
  {
    id: "shipping",
    question: "Do you ship physical goods, or is this digital only?",
    why: "Physical fulfilment adds addresses, rates, tax-by-region, and a fulfilment status model; digital skips all of it.",
    kind: "choice",
    options: ["Physical goods", "Digital only", "Both"],
  },
  {
    id: "brief",
    question: "Anything specific about brand, region, or scale we should hold to?",
    why: "Free-form context the CTO folds into scope so the spec is steered by what you actually care about, not a generic store.",
    kind: "text",
  },
];

const NODES: GraphNode[] = [
  {
    id: "intake",
    label: "Intake - scope the brief",
    kind: "cto",
    phase: "intake",
    needs: [],
    status: "done",
    tokens: 4120,
    tools: 2,
    elapsedMs: 31_000,
    note: "Classified the brief and surfaced 5 gap questions.",
    detail: [
      "Brief: a mini ecommerce store.",
      "Surfaced unstated needs: auth, payments, catalog scale, shipping.",
      "Emitted a structured questions artifact, then terminated.",
    ],
  },
  {
    id: "scope",
    label: "Scope",
    kind: "planner",
    phase: "shape",
    needs: ["intake"],
    status: "done",
    tokens: 6850,
    tools: 1,
    elapsedMs: 44_000,
    note: "Locked in-scope vs out-of-scope from the answers.",
    detail: [
      "In: guest + optional accounts, Stripe hosted checkout, < 1k products.",
      "Out (explicit): multi-tenant, i18n, custom payment UI.",
      "Out-of-scope is recorded so the critic checks coverage, not ambition.",
    ],
  },
  {
    id: "spec",
    label: "Spec",
    kind: "planner",
    phase: "shape",
    needs: ["scope"],
    status: "running",
    tokens: 9240,
    tools: 4,
    elapsedMs: 52_000,
    note: "Drafting the product + data spec for the approved scope.",
    detail: [
      "Entities: Product, Cart, Order, Customer (optional).",
      "Flows: browse -> cart -> hosted checkout -> order confirm.",
      "Writing acceptance criteria as prose (executable in Phase 1).",
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    kind: "architect",
    phase: "shape",
    needs: ["spec"],
    status: "pending",
    tokens: 0,
    tools: 0,
    elapsedMs: 0,
    note: "Waiting on the spec to settle.",
    detail: [
      "Will propose a stack + provisioning checklist (env var names only).",
      "Secret values never enter a prompt or artifact.",
    ],
  },
  {
    id: "risks",
    label: "Risks",
    kind: "planner",
    phase: "shape",
    needs: ["arch"],
    status: "pending",
    tokens: 0,
    tools: 0,
    elapsedMs: 0,
    note: "Cross-cutting concern scan runs here.",
    detail: [
      "Default checklist: security, scale, cost, a11y, data-privacy.",
      "A dominating concern is elevated to a dedicated review seat.",
    ],
  },
  {
    id: "review",
    label: "Shape review",
    kind: "reviewer",
    phase: "review",
    needs: ["risks"],
    status: "pending",
    tokens: 0,
    tools: 0,
    elapsedMs: 0,
    note: "Completeness loop against the approved scope.",
    detail: [
      "Verdict + maxIterations + human approval gate the chain.",
      "Loops back to scope if a blocking unknown surfaces.",
    ],
  },
  // Decomposition cards the spec node fans out into.
  {
    id: "card-catalog",
    label: "Catalog + product pages",
    kind: "leaf",
    phase: "decompose",
    needs: ["spec"],
    status: "running",
    tokens: 3110,
    tools: 3,
    elapsedMs: 21_000,
    note: "Directly buildable unit: listing, detail, search.",
    detail: [
      "Product grid, detail page, basic keyword search.",
      "Datastore sized for < 1k products.",
    ],
  },
  {
    id: "card-cart",
    label: "Cart + checkout",
    kind: "leaf",
    phase: "decompose",
    needs: ["spec"],
    status: "blocked",
    tokens: 1280,
    tools: 1,
    elapsedMs: 12_000,
    note: "Blocked: needs the Stripe account env var name.",
    detail: [
      "Cart state, line items, Stripe hosted checkout redirect.",
      "Blocked on a provisioning input from the architecture node.",
    ],
  },
  {
    id: "card-accounts",
    label: "Optional accounts",
    kind: "leaf",
    phase: "decompose",
    needs: ["spec"],
    status: "pending",
    tokens: 0,
    tools: 0,
    elapsedMs: 0,
    note: "Sign-in, saved carts, order history.",
    detail: ["Sessions + password reset surface.", "Gated behind the auth answer."],
  },
];

/* --------------------------------------------------------------- layout -- */
// Longest-path topological layering (the layersOf idiom): a node sits one layer
// below its deepest dependency, so siblings that can run together share a row.

function layersOf(nodes: GraphNode[]): GraphNode[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const compute = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0; // cycle guard - degrade gracefully
    seen.add(id);
    const n = byId.get(id);
    const needs = n?.needs ?? [];
    const d = needs.length === 0 ? 0 : 1 + Math.max(...needs.map((p) => compute(p, seen)));
    depth.set(id, d);
    return d;
  };
  nodes.forEach((n) => compute(n.id, new Set()));
  const maxD = Math.max(0, ...[...depth.values()]);
  const rows: GraphNode[][] = Array.from({ length: maxD + 1 }, () => []);
  nodes.forEach((n) => rows[depth.get(n.id) ?? 0]?.push(n));
  return rows;
}

// Geometry constants for the spatial canvas.
const NODE_W = 188;
const NODE_H = 86;
const COL_GAP = 26;
const ROW_GAP = 64;
const PAD_X = 28;
const PAD_Y = 26;

type Placed = { node: GraphNode; x: number; y: number };

function placeNodes(nodes: GraphNode[]): {
  placed: Placed[];
  width: number;
  height: number;
} {
  const rows = layersOf(nodes);
  const rowWidths = rows.map((r) => r.length * NODE_W + (r.length - 1) * COL_GAP);
  const width = Math.max(...rowWidths) + PAD_X * 2;
  const placed: Placed[] = [];
  rows.forEach((row, ri) => {
    const rowW = rowWidths[ri] ?? 0;
    const startX = PAD_X + (width - PAD_X * 2 - rowW) / 2; // centre each row
    row.forEach((node, ci) => {
      placed.push({
        node,
        x: startX + ci * (NODE_W + COL_GAP),
        y: PAD_Y + ri * (NODE_H + ROW_GAP),
      });
    });
  });
  const height = rows.length * NODE_H + (rows.length - 1) * ROW_GAP + PAD_Y * 2;
  return { placed, width, height };
}

/* ------------------------------------------------------------- helpers -- */

function fmtTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1) + "k";
  return String(n);
}
function fmtElapsed(ms: number): string {
  if (ms <= 0) return "-";
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  return m + "m " + (s % 60) + "s";
}

// Status -> token-driven colour. ONLY ok / soft / warn tokens carry status.
function statusInk(s: NodeStatus): string {
  switch (s) {
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
function statusBg(s: NodeStatus): string {
  switch (s) {
    case "done":
      return "var(--s-ok)";
    case "running":
      return "var(--s-soft)";
    case "blocked":
      return "color-mix(in srgb, var(--s-warn-ink) 16%, transparent)";
    default:
      return "var(--s-slab-2)";
  }
}
function statusLabel(s: NodeStatus): string {
  return s;
}

/* -------------------------------------------------------- tiny atoms -- */

// Flat tinted status text + dot. NOT a pill - small radius, no full-round.
function StatusTag({ status }: { status: NodeStatus }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "1px 6px",
        borderRadius: 4,
        background: statusBg(status),
        color: statusInk(status),
        fontSize: 10.5,
        lineHeight: 1.4,
        fontWeight: 500,
        letterSpacing: 0.1,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: statusInk(status),
          animation: status === "running" ? "gc-pulse 1.4s ease-in-out infinite" : undefined,
        }}
      />
      {statusLabel(status)}
    </span>
  );
}

// One telemetry column: a tiny mono caption over a value, right-aligned.
function Telemetry({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 38 }}>
      <span
        style={{
          fontFamily: "var(--font-term, ui-monospace, monospace)",
          fontSize: 12,
          color: "var(--s-ink)",
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 9.5, color: "var(--s-ink-faint)", letterSpacing: 0.3 }}>{label}</span>
    </div>
  );
}

/* --------------------------------------------------------- node card -- */

function NodeCard({
  placed,
  focused,
  onFocus,
}: {
  placed: Placed;
  focused: boolean;
  onFocus: () => void;
}) {
  const { node, x, y } = placed;
  const isRoot = node.id === "intake";
  const live = node.status === "running";
  return (
    <button
      type="button"
      onClick={onFocus}
      className="gc-node"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: NODE_W,
        height: NODE_H,
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "9px 11px",
        borderRadius: 6,
        cursor: "pointer",
        background: focused ? "var(--s-glass)" : "var(--s-slab)",
        color: "var(--s-slab-ink)",
        border: "1px solid " + (focused ? "var(--s-hover-line)" : "var(--s-line)"),
        boxShadow: focused
          ? "0 0 0 3px var(--s-ring), 0 14px 34px -16px var(--s-glow)"
          : live
            ? "0 0 0 1px color-mix(in srgb, var(--s-soft-ink) 30%, transparent)"
            : "none",
        // Running node gets a faint accent ground so live work glows on the canvas.
        backgroundImage: live
          ? "linear-gradient(180deg, var(--s-soft) 0%, transparent 78%)"
          : undefined,
      }}
    >
      {/* top row: status accent stripe + name */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, width: "100%" }}>
        <span
          aria-hidden
          style={{
            marginTop: 3,
            width: 3,
            height: 26,
            borderRadius: 2,
            flexShrink: 0,
            background: statusInk(node.status),
            opacity: node.status === "pending" ? 0.4 : 1,
          }}
        />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: "block",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--s-ink)",
              lineHeight: 1.25,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {node.label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-term, ui-monospace, monospace)",
              fontSize: 10,
              color: "var(--s-ink-faint)",
            }}
          >
            {isRoot ? "root" : node.kind}
          </span>
        </span>
        <StatusTag status={node.status} />
      </div>

      {/* bottom row: aligned mini-telemetry columns */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-end",
          gap: 12,
          width: "100%",
        }}
      >
        <Telemetry value={fmtTokens(node.tokens)} label="tok" />
        <Telemetry value={String(node.tools)} label="tools" />
        <Telemetry value={fmtElapsed(node.elapsedMs)} label="time" />
      </div>
    </button>
  );
}

/* ----------------------------------------------------------- edges -- */
// Hand-rolled SVG edges: a smooth cubic from a parent's bottom-centre to a
// child's top-centre. The edge into a running node lights up via the soft token.

function Edge({
  from,
  to,
  active,
}: {
  from: Placed;
  to: Placed;
  active: boolean;
}) {
  const x1 = from.x + NODE_W / 2;
  const y1 = from.y + NODE_H;
  const x2 = to.x + NODE_W / 2;
  const y2 = to.y;
  const midY = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  return (
    <path
      d={d}
      fill="none"
      stroke={active ? "var(--s-accent-bright)" : "var(--s-line)"}
      strokeWidth={active ? 1.6 : 1.1}
      strokeLinecap="round"
      strokeDasharray={active ? "1 0" : "4 4"}
      opacity={active ? 0.9 : 0.55}
    />
  );
}

/* ------------------------------------------------- spec-entry form -- */
// Lives in the inspector during spec-entry. The root node visually expands
// into the plan as these are filled (the ghost child nodes on the canvas).

function GapForm({
  questions,
  answers,
  onAnswer,
  onLaunch,
}: {
  questions: GapQuestion[];
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
  onLaunch: () => void;
}) {
  const answered = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  const required = questions.filter((q) => q.kind === "choice");
  const ready = required.every((q) => (answers[q.id] ?? "").trim().length > 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--s-ink)" }}>
          Answer the gap questions
        </div>
        <div style={{ fontSize: 12, color: "var(--s-ink-dim)", marginTop: 3, lineHeight: 1.5 }}>
          The CTO scoped the brief and needs these to draft the plan. Submitting expands the root
          node into the shape tree.
        </div>
      </div>

      {/* progress dots - the "phase group" telemetry idiom */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {questions.map((q) => {
          const on = (answers[q.id] ?? "").trim().length > 0;
          return (
            <span
              key={q.id}
              title={q.question}
              style={{
                width: 18,
                height: 4,
                borderRadius: 2,
                background: on ? "var(--s-accent-bright)" : "var(--s-line)",
                transition: "background .2s",
              }}
            />
          );
        })}
        <span
          style={{
            marginLeft: 6,
            fontFamily: "var(--font-term, ui-monospace, monospace)",
            fontSize: 11,
            color: "var(--s-ink-faint)",
          }}
        >
          {answered}/{questions.length}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {questions.map((q, i) => {
          const val = answers[q.id] ?? "";
          return (
            <div
              key={q.id}
              style={{
                background: "var(--s-glass-2)",
                border: "1px solid var(--s-line)",
                borderRadius: 6,
                padding: "10px 11px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span
                  style={{
                    fontFamily: "var(--font-term, ui-monospace, monospace)",
                    fontSize: 11,
                    color: "var(--s-ink-faint)",
                    flexShrink: 0,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--s-ink)",
                      lineHeight: 1.4,
                    }}
                  >
                    {q.question}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--s-ink-dim)",
                      lineHeight: 1.5,
                      marginTop: 3,
                    }}
                  >
                    {q.why}
                  </div>
                </div>
              </div>

              {q.kind === "choice" && q.options ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {q.options.map((opt) => {
                    const on = val === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => onAnswer(q.id, opt)}
                        className="gc-opt"
                        style={{
                          padding: "5px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: "pointer",
                          background: on ? "var(--s-soft)" : "var(--s-slab)",
                          color: on ? "var(--s-soft-ink)" : "var(--s-ink-dim)",
                          border: "1px solid " + (on ? "transparent" : "var(--s-line)"),
                          fontWeight: on ? 500 : 400,
                        }}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  value={val}
                  onChange={(e) => onAnswer(q.id, e.target.value)}
                  placeholder="Type any constraints the CTO should hold to"
                  rows={2}
                  className="gc-input"
                  style={{
                    resize: "vertical",
                    width: "100%",
                    boxSizing: "border-box",
                    background: "var(--s-slab)",
                    color: "var(--s-ink)",
                    border: "1px solid var(--s-line)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 12.5,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!ready}
        onClick={onLaunch}
        className="gc-launch"
        style={{
          width: "100%",
          padding: "11px 16px",
          borderRadius: 8,
          border: "none",
          fontSize: 14,
          fontWeight: 600,
          cursor: ready ? "pointer" : "not-allowed",
          background: ready ? "var(--s-accent)" : "var(--s-slab-2)",
          color: ready ? "var(--s-on-accent)" : "var(--s-ink-faint)",
          transition: "background .16s",
        }}
      >
        {ready ? "Launch shape run" : "Answer the required questions"}
      </button>
      <div
        style={{
          fontSize: 11,
          color: "var(--s-ink-faint)",
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        Read-only. No diff, nothing pushes or merges. The chain produces a reviewable plan.
      </div>
    </div>
  );
}

/* ---------------------------------------------- inspector (live) -- */

function NodeInspector({ node }: { node: GraphNode }) {
  const isRoot = node.id === "intake";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <StatusTag status={node.status} />
          <span
            style={{
              fontFamily: "var(--font-term, ui-monospace, monospace)",
              fontSize: 11,
              color: "var(--s-ink-faint)",
            }}
          >
            {isRoot ? "root" : node.kind}
          </span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--s-ink)", lineHeight: 1.3 }}>
          {node.label}
        </div>
        {node.note ? (
          <div style={{ fontSize: 12.5, color: "var(--s-ink-dim)", marginTop: 5, lineHeight: 1.5 }}>
            {node.note}
          </div>
        ) : null}
      </div>

      {/* telemetry strip - aligned columns, mission-control feel */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 1,
          background: "var(--s-line)",
          border: "1px solid var(--s-line)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        {[
          { v: fmtTokens(node.tokens), l: "tokens" },
          { v: String(node.tools), l: "tool calls" },
          { v: fmtElapsed(node.elapsedMs), l: "elapsed" },
        ].map((c) => (
          <div key={c.l} style={{ background: "var(--s-slab)", padding: "9px 11px" }}>
            <div
              style={{
                fontFamily: "var(--font-term, ui-monospace, monospace)",
                fontSize: 16,
                color: "var(--s-ink)",
                lineHeight: 1.1,
              }}
            >
              {c.v}
            </div>
            <div style={{ fontSize: 10, color: "var(--s-ink-faint)", marginTop: 3 }}>{c.l}</div>
          </div>
        ))}
      </div>

      {node.detail && node.detail.length > 0 ? (
        <div>
          <div
            style={{
              fontFamily: "var(--font-term, ui-monospace, monospace)",
              fontSize: 11,
              color: "var(--s-ink-faint)",
              marginBottom: 7,
            }}
          >
            detail
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {node.detail.map((d, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 12.5,
                  color: "var(--s-ink-dim)",
                  lineHeight: 1.5,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    marginTop: 6,
                    width: 4,
                    height: 4,
                    borderRadius: 999,
                    flexShrink: 0,
                    background: "var(--s-accent-bright)",
                  }}
                />
                <span>{d}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {node.status === "blocked" ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            background: statusBg("blocked"),
            border: "1px solid color-mix(in srgb, var(--s-warn-ink) 28%, transparent)",
            borderRadius: 6,
            padding: "9px 11px",
            fontSize: 12,
            color: "var(--s-warn-ink)",
            lineHeight: 1.5,
          }}
        >
          Blocked - resolve the upstream provisioning input to continue this branch.
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------- phase summary bar -- */

const PHASE_META: { id: Phase; label: string }[] = [
  { id: "intake", label: "Intake" },
  { id: "shape", label: "Shape" },
  { id: "decompose", label: "Decompose" },
  { id: "review", label: "Review" },
];

function PhaseRail({ nodes }: { nodes: GraphNode[] }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" }}>
      {PHASE_META.map((p) => {
        const members = nodes.filter((n) => n.phase === p.id);
        if (members.length === 0) return null;
        const done = members.filter((n) => n.status === "done").length;
        return (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: "var(--s-slab)",
              border: "1px solid var(--s-line)",
              borderRadius: 6,
              padding: "6px 10px",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--s-ink)" }}>{p.label}</span>
            {/* the row of small progress dots, one per node in the phase */}
            <span style={{ display: "flex", gap: 4 }}>
              {members.map((n) => (
                <span
                  key={n.id}
                  title={n.label + " - " + n.status}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: statusInk(n.status),
                    opacity: n.status === "pending" ? 0.4 : 1,
                    animation:
                      n.status === "running" ? "gc-pulse 1.4s ease-in-out infinite" : undefined,
                  }}
                />
              ))}
            </span>
            <span
              style={{
                fontFamily: "var(--font-term, ui-monospace, monospace)",
                fontSize: 10.5,
                color: "var(--s-ink-faint)",
              }}
            >
              {done}/{members.length}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================ root ===== */

export default function GraphCanvasProposal() {
  const [mode, setMode] = React.useState<"spec" | "live">("spec");
  const [focusId, setFocusId] = React.useState<string>("intake");
  const [answers, setAnswers] = React.useState<Record<string, string>>({
    auth: "Optional accounts",
    payments: "Stripe hosted checkout",
  });

  // In spec mode the shape children are "ghosts" - they only render once their
  // answer count proves the plan is forming, so the root visibly expands.
  const answeredCount = QUESTIONS.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;

  const visibleNodes = React.useMemo(() => {
    if (mode === "live") return NODES;
    // spec mode: always show the root; reveal more of the tree as answers land.
    const reveal = Math.min(NODES.length, 1 + answeredCount);
    // keep dependency order stable by slicing the predefined array
    return NODES.slice(0, reveal);
  }, [mode, answeredCount]);

  const { placed, width, height } = React.useMemo(
    () => placeNodes(visibleNodes),
    [visibleNodes],
  );
  const placedById = React.useMemo(
    () => new Map(placed.map((p) => [p.node.id, p])),
    [placed],
  );

  const edges: { from: Placed; to: Placed; active: boolean }[] = [];
  placed.forEach((p) => {
    p.node.needs.forEach((needId) => {
      const from = placedById.get(needId);
      if (from) {
        edges.push({
          from,
          to: p,
          active: p.node.status === "running" || from.node.status === "running",
        });
      }
    });
  });

  const focused = NODES.find((n) => n.id === focusId) ?? NODES[0];
  const showForm = mode === "spec" && focusId === "intake";

  const totalTokens = NODES.reduce((a, n) => a + n.tokens, 0);
  const running = NODES.filter((n) => n.status === "running").length;

  const setAnswer = (id: string, value: string) =>
    setAnswers((c) => ({ ...c, [id]: value }));

  return (
    <div
      data-scene
      className="scene-ground"
      style={{
        background: "var(--s-bg)",
        color: "var(--s-ink)",
        fontFamily:
          "var(--font-sans, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif)",
        padding: 18,
        borderRadius: 12,
      }}
    >
      <style>{`
        @keyframes gc-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes gc-dash { to { stroke-dashoffset: -16 } }
        .gc-node { transition: box-shadow .18s var(--ease-out,cubic-bezier(.22,1,.36,1)), border-color .18s, transform .18s; }
        .gc-node:hover { border-color: var(--s-hover-line) !important; transform: translateY(-1px); }
        .gc-opt:hover { border-color: var(--s-hover-line) !important; }
        .gc-input:focus { border-color: var(--s-hover-line) !important; box-shadow: 0 0 0 3px var(--s-ring); }
        .gc-launch:not(:disabled):hover { filter: brightness(1.07); }
        .gc-canvas { scrollbar-width: thin; }
        .gc-flow-edge { animation: gc-dash 1.1s linear infinite; }
      `}</style>

      {/* ---- header: title + elapsed + mode toggle + run telemetry ---- */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--s-ink)", letterSpacing: -0.2 }}>
            Shape - mini ecommerce store
          </div>
          <div style={{ fontSize: 12.5, color: "var(--s-ink-dim)", marginTop: 3 }}>
            {mode === "spec"
              ? "Spec entry - answer the gap questions to grow the plan"
              : "Live - watch the plan run on the canvas"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* run-level telemetry, mission-control style */}
          <div style={{ display: "flex", gap: 16 }}>
            <Telemetry value={fmtTokens(totalTokens)} label="tokens" />
            <Telemetry value={String(running)} label="running" />
            <Telemetry value={fmtElapsed(151_000)} label="elapsed" />
          </div>

          {/* mode toggle - flat tinted segmented control, not pills */}
          <div
            style={{
              display: "inline-flex",
              background: "var(--s-slab-2)",
              border: "1px solid var(--s-line)",
              borderRadius: 7,
              padding: 2,
            }}
          >
            {(["spec", "live"] as const).map((m) => {
              const on = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setFocusId(m === "spec" ? "intake" : "spec");
                  }}
                  style={{
                    padding: "5px 13px",
                    borderRadius: 5,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12.5,
                    fontWeight: 500,
                    background: on ? "var(--s-accent)" : "transparent",
                    color: on ? "var(--s-on-accent)" : "var(--s-ink-dim)",
                  }}
                >
                  {m === "spec" ? "Spec entry" : "Live run"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <PhaseRail nodes={visibleNodes} />
      </div>

      {/* ---- main split: graph canvas (primary) + inspector ---- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 14,
          alignItems: "stretch",
        }}
      >
        {/* === GRAPH CANVAS === */}
        <div
          style={{
            position: "relative",
            borderRadius: 10,
            border: "1px solid var(--s-line)",
            background: "var(--s-glass)",
            backdropFilter: "blur(13px) saturate(135%)",
            WebkitBackdropFilter: "blur(13px) saturate(135%)",
            overflow: "hidden",
            minHeight: 560,
          }}
        >
          {/* dot-grid canvas texture - implies an infinite pannable surface */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "radial-gradient(var(--s-line) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
              opacity: 0.5,
              pointerEvents: "none",
            }}
          />
          {/* aurora corner wash so running work feels lit, not flat */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(120% 80% at 50% -10%, var(--s-glow) 0%, transparent 55%)",
              opacity: 0.7,
              pointerEvents: "none",
            }}
          />

          {/* canvas chrome: a zoom/pan affordance look (no real pan logic) */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 12,
              zIndex: 3,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-term, ui-monospace, monospace)",
              fontSize: 11,
              color: "var(--s-ink-faint)",
            }}
          >
            <span>node-tree</span>
            <span style={{ color: "var(--s-line)" }}>/</span>
            <span>{visibleNodes.length} nodes</span>
          </div>
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 12,
              zIndex: 3,
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            {["-", "100%", "+"].map((z, i) => (
              <span
                key={i}
                aria-hidden
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 28,
                  height: 26,
                  padding: "0 8px",
                  borderRadius: 5,
                  background: "var(--s-slab)",
                  border: "1px solid var(--s-line)",
                  color: "var(--s-ink-dim)",
                  fontSize: 12,
                  fontFamily: "var(--font-term, ui-monospace, monospace)",
                }}
              >
                {z}
              </span>
            ))}
            <span
              aria-hidden
              title="Fit to view"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                borderRadius: 5,
                background: "var(--s-slab)",
                border: "1px solid var(--s-line)",
                color: "var(--s-ink-dim)",
                fontSize: 14,
              }}
            >
              {"□"}
            </span>
          </div>

          {/* the scrollable, "pannable" inner surface */}
          <div
            className="gc-canvas"
            style={{
              position: "absolute",
              inset: 0,
              overflow: "auto",
              paddingTop: 44,
            }}
          >
            <div style={{ position: "relative", width, height, margin: "0 auto" }}>
              {/* SVG edge layer beneath the node cards */}
              <svg
                width={width}
                height={height}
                style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                aria-hidden
              >
                {edges.map((e, i) => (
                  <g key={i} className={e.active ? "gc-flow-edge" : undefined}>
                    <Edge from={e.from} to={e.to} active={e.active} />
                  </g>
                ))}
              </svg>

              {placed.map((p) => (
                <NodeCard
                  key={p.node.id}
                  placed={p}
                  focused={p.node.id === focusId}
                  onFocus={() => setFocusId(p.node.id)}
                />
              ))}

              {/* ghost slot in spec mode: the plan "about to grow" hint */}
              {mode === "spec" && visibleNodes.length < NODES.length ? (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: width / 2 - NODE_W / 2,
                    top: PAD_Y + visibleNodes.length * (NODE_H + ROW_GAP) - ROW_GAP / 2,
                    width: NODE_W,
                    height: NODE_H,
                    borderRadius: 6,
                    border: "1px dashed var(--s-line)",
                    background: "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--s-ink-faint)",
                    fontSize: 11.5,
                    textAlign: "center",
                    padding: 8,
                  }}
                >
                  answer to grow the plan
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* === INSPECTOR === */}
        <aside
          style={{
            borderRadius: 10,
            border: "1px solid var(--s-line)",
            background: "var(--s-slab)",
            color: "var(--s-slab-ink)",
            padding: 16,
            overflow: "auto",
            maxHeight: 720,
          }}
        >
          {showForm ? (
            <GapForm
              questions={QUESTIONS}
              answers={answers}
              onAnswer={setAnswer}
              onLaunch={() => {
                setMode("live");
                setFocusId("spec");
              }}
            />
          ) : focused ? (
            <NodeInspector node={focused} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
