import { useMemo, useState } from "react";

/**
 * GuidedDocProposal - Direction C, "Guided Document".
 *
 * A calm, reading-first take on the Shape run-control. Two faces, one editorial
 * language:
 *
 *  1. SPEC-ENTRY ("answer the specifications") - a guided, conversational intake.
 *     The CTO asks gap questions one card at a time; each card carries the
 *     rationale ("why it matters") as the CTO's own voice, and a quiet "3 of 5
 *     answered" sense of progress. Answering inline advances the document.
 *
 *  2. LIVE TASK-RUNNING - the plan reads as a *document being written live*: a
 *     vertical timeline of sections (scope / spec / architecture / risks /
 *     review), each with prose and a restrained margin rail of telemetry
 *     (tokens / tools / elapsed). A collapsible node-tree mini-map is docked to
 *     the side as the navigational aside - the tree orients, the document is the
 *     focus.
 *
 * Self-contained: no imports beyond React, inline MOCK DATA, colours come ONLY
 * from the --s-* scene tokens. A small scoped <style> block holds keyframes and
 * a couple of structural rules; every colour is a token.
 */

/* ─────────────────────────────── types ─────────────────────────────── */

type GapKind = "choice" | "text";

type GapQuestion = {
  id: string;
  question: string;
  why: string;
  kind: GapKind;
  options?: string[];
};

type NodeStatus = "pending" | "running" | "done" | "blocked";

type PlanNode = {
  id: string;
  name: string;
  phase: string;
  status: NodeStatus;
  parent: string | null;
  tokens: number;
  tools: number;
  elapsed: string;
};

/** A written section of the live plan document. */
type DocSection = {
  id: string;
  kind: string;
  title: string;
  status: NodeStatus;
  tokens: number;
  tools: number;
  elapsed: string;
  /** Paragraphs already "written"; the last one may still be streaming. */
  body: string[];
  /** A short list of decided points rendered as a quiet ledger. */
  ledger?: { label: string; value: string }[];
};

/* ─────────────────────────────── mock data ─────────────────────────── */

const BRIEF = "Build a mini ecommerce store - a small catalog, a cart, checkout.";

const QUESTIONS: GapQuestion[] = [
  {
    id: "auth",
    question: "Do shoppers need accounts, or is guest checkout enough for v1?",
    why: "Accounts unlock order history and saved carts but add auth, sessions, and a password-reset surface. If you only need someone to buy once, guest checkout is far less to build and to secure.",
    kind: "choice",
    options: ["Guest checkout only", "Optional accounts", "Accounts required"],
  },
  {
    id: "payments",
    question: "Which payment path should we design for first?",
    why: "Payments decide your compliance surface. A hosted provider (Stripe Checkout) keeps card data off your servers entirely - the safest default for a small store. Direct card capture is more work and more liability.",
    kind: "choice",
    options: ["Stripe hosted checkout", "Stripe embedded", "PayPal", "Decide later"],
  },
  {
    id: "catalog",
    question: "Roughly how large is the catalog at launch?",
    why: "Catalog size sets the data model and the search story. Under a few hundred items, a flat table and client-side filtering is plenty. Thousands of SKUs means you want server-side search and pagination from day one.",
    kind: "choice",
    options: ["Under 50", "50 to 500", "500 to 5,000", "5,000+"],
  },
  {
    id: "shipping",
    question: "Do you ship physical goods, sell digital, or both?",
    why: "Physical goods pull in addresses, shipping rates, and tax-by-region. Digital delivery needs secure download links instead. Saying this now keeps us from building the wrong half.",
    kind: "choice",
    options: ["Physical only", "Digital only", "Both"],
  },
  {
    id: "scale",
    question: "Anything about expected scale or a launch deadline we should plan around?",
    why: "A date or a traffic spike (a campaign, a drop) changes where we spend effort - caching, a managed DB, a CDN. If it is a quiet launch we keep the stack lean and add scale later.",
    kind: "text",
  },
];

const SECTIONS: DocSection[] = [
  {
    id: "scope",
    kind: "scope",
    title: "Scope",
    status: "done",
    tokens: 4820,
    tools: 3,
    elapsed: "0:41",
    body: [
      "A single-region storefront for physical goods with optional shopper accounts and Stripe hosted checkout. The catalog is small (50 to 500 items), so a flat product table with client-side filtering covers browse and search without a dedicated search service.",
      "Explicitly out of scope for v1: marketplace / multi-vendor, internationalisation, subscriptions, and a native mobile app. Recording these keeps the completeness review pointed at the agreed surface rather than an ideal system.",
    ],
    ledger: [
      { label: "Goods", value: "Physical, single region" },
      { label: "Accounts", value: "Optional (guest allowed)" },
      { label: "Out of scope", value: "Multi-vendor, i18n, subs" },
    ],
  },
  {
    id: "spec",
    kind: "spec",
    title: "Specification",
    status: "done",
    tokens: 7140,
    tools: 5,
    elapsed: "1:12",
    body: [
      "Shoppers browse a catalog, filter by category and price, open a product, add to a cart, and complete a hosted checkout. Accounts are optional: a guest can buy with just an email; a returning shopper may sign in to see order history.",
      "The cart persists per browser for guests and per account once signed in. Order confirmation is by email. Inventory is decremented on a confirmed payment webhook, never on add-to-cart, to avoid phantom stock holds.",
    ],
    ledger: [
      { label: "Core flows", value: "Browse, cart, checkout, orders" },
      { label: "Cart", value: "Per-browser, merges on sign-in" },
      { label: "Inventory", value: "Decrement on paid webhook" },
    ],
  },
  {
    id: "architecture",
    kind: "architecture",
    title: "Architecture",
    status: "running",
    tokens: 5390,
    tools: 4,
    elapsed: "0:58",
    body: [
      "A server-rendered storefront (Next.js) backed by a managed Postgres for products, carts, and orders. Stripe hosted checkout owns the card surface; a single Stripe webhook endpoint confirms payment and writes the order. Static product images sit behind a CDN.",
      "Auth is email-link plus an optional password, kept in its own module so guest checkout never touches it. Secrets (the Stripe key, the database URL) are referenced by env-var name only and live in a gitignored .env - never in a prompt, an artifact, or this document.",
    ],
    ledger: [
      { label: "App", value: "Next.js, server-rendered" },
      { label: "Data", value: "Managed Postgres" },
      { label: "Payments", value: "Stripe hosted + 1 webhook" },
    ],
  },
  {
    id: "risks",
    kind: "risks",
    title: "Risks",
    status: "pending",
    tokens: 0,
    tools: 0,
    elapsed: "-",
    body: [
      "This section is queued. The risk pass will weigh the webhook as a single point of failure for order capture, the race between inventory and concurrent checkouts, and the cost ceiling if a campaign spikes traffic.",
    ],
  },
  {
    id: "shape-review",
    kind: "review-turn",
    title: "Shape review",
    status: "pending",
    tokens: 0,
    tools: 0,
    elapsed: "-",
    body: [
      "The reviewer will check the draft against the approved scope above - not against an ideal store - and either return a verdict to approve or loop one section back for another pass.",
    ],
  },
];

/** The navigational node-tree. Top-level nodes mirror the document sections;
 *  the decomposition cards hang under spec/architecture as buildable units. */
const NODES: PlanNode[] = [
  { id: "scope", name: "Scope", phase: "Shape", status: "done", parent: null, tokens: 4820, tools: 3, elapsed: "0:41" },
  { id: "spec", name: "Specification", phase: "Shape", status: "done", parent: null, tokens: 7140, tools: 5, elapsed: "1:12" },
  { id: "spec.catalog", name: "Catalog + browse", phase: "Decompose", status: "done", parent: "spec", tokens: 2110, tools: 2, elapsed: "0:22" },
  { id: "spec.cart", name: "Cart + checkout", phase: "Decompose", status: "done", parent: "spec", tokens: 2580, tools: 2, elapsed: "0:27" },
  { id: "arch", name: "Architecture", phase: "Shape", status: "running", parent: null, tokens: 5390, tools: 4, elapsed: "0:58" },
  { id: "arch.payments", name: "Stripe webhook", phase: "Decompose", status: "running", parent: "arch", tokens: 1240, tools: 1, elapsed: "0:19" },
  { id: "arch.auth", name: "Auth module", phase: "Decompose", status: "blocked", parent: "arch", tokens: 360, tools: 0, elapsed: "0:06" },
  { id: "risks", name: "Risks", phase: "Shape", status: "pending", parent: null, tokens: 0, tools: 0, elapsed: "-" },
  { id: "shape-review", name: "Shape review", phase: "Review", status: "pending", parent: null, tokens: 0, tools: 0, elapsed: "-" },
];

/* ───────────────────────────── helpers ─────────────────────────────── */

const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

/** Status -> token-driven colour. Only ok / soft / warn tokens carry meaning. */
function statusInk(status: NodeStatus): string {
  if (status === "done" || status === "running") return "var(--s-ok-ink)";
  if (status === "blocked") return "var(--s-warn-ink)";
  return "var(--s-ink-faint)";
}
function statusBg(status: NodeStatus): string {
  if (status === "done" || status === "running") return "var(--s-ok)";
  if (status === "blocked") return "rgba(251,191,36,0.14)";
  return "transparent";
}
function statusLabel(status: NodeStatus): string {
  return status === "running" ? "writing" : status;
}

/* ───────────────────────────── component ───────────────────────────── */

export default function GuidedDocProposal() {
  const [face, setFace] = useState<"entry" | "live">("entry");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [treeOpen, setTreeOpen] = useState(true);
  const [activeSection, setActiveSection] = useState<string>("architecture");

  const answeredCount = useMemo(
    () => QUESTIONS.filter((q) => (answers[q.id] ?? "").trim().length > 0).length,
    [answers],
  );
  const allAnswered = answeredCount === QUESTIONS.length;

  const setAnswer = (id: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const totals = useMemo(() => {
    const tokens = SECTIONS.reduce((a, s) => a + s.tokens, 0);
    const tools = SECTIONS.reduce((a, s) => a + s.tools, 0);
    return { tokens, tools };
  }, []);

  return (
    <div
      data-scene
      className="gd-root scene-ground"
      style={{
        background: "var(--s-bg)",
        color: "var(--s-ink)",
        fontFamily: "var(--font-display, ui-sans-serif, system-ui, sans-serif)",
        padding: "28px",
        minHeight: "100%",
      }}
    >
      <style>{gdStyle}</style>

      {/* ── document masthead: title, brief, and the face toggle ── */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "24px",
          paddingBottom: "18px",
          marginBottom: "22px",
          borderBottom: "1px solid var(--s-line)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ maxWidth: "640px" }}>
          <div
            style={{
              fontFamily: "var(--font-term, ui-monospace, monospace)",
              fontSize: "11.5px",
              letterSpacing: "0.02em",
              color: "var(--s-ink-faint)",
              marginBottom: "8px",
            }}
          >
            shape / new run
          </div>
          <h1
            style={{
              fontSize: "27px",
              lineHeight: 1.12,
              fontWeight: 600,
              margin: 0,
              color: "var(--s-ink)",
              letterSpacing: "-0.01em",
            }}
          >
            Shaping a mini ecommerce store
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: "14px",
              lineHeight: 1.5,
              color: "var(--s-ink-dim)",
            }}
          >
            {BRIEF} The CTO reads the brief, names the unstated, and writes the
            plan as a document you can read top to bottom.
          </p>
        </div>

        {/* face toggle - a quiet two-state segmented control, not pills */}
        <div
          role="tablist"
          aria-label="Shape view"
          style={{
            display: "flex",
            border: "1px solid var(--s-line)",
            borderRadius: "6px",
            overflow: "hidden",
            background: "var(--s-slab-2)",
          }}
        >
          {(["entry", "live"] as const).map((f) => {
            const on = face === f;
            return (
              <button
                key={f}
                role="tab"
                aria-selected={on}
                onClick={() => setFace(f)}
                className="gd-focus"
                style={{
                  appearance: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "9px 16px",
                  fontSize: "13px",
                  fontWeight: 500,
                  background: on ? "var(--s-accent)" : "transparent",
                  color: on ? "var(--s-on-accent)" : "var(--s-ink-dim)",
                  fontFamily: "inherit",
                  transition: "background 0.16s, color 0.16s",
                }}
              >
                {f === "entry" ? "1 - Answer specs" : "2 - Live plan"}
              </button>
            );
          })}
        </div>
      </header>

      {face === "entry" ? (
        <SpecEntry
          answers={answers}
          setAnswer={setAnswer}
          answeredCount={answeredCount}
          allAnswered={allAnswered}
          onLaunch={() => setFace("live")}
        />
      ) : (
        <LivePlan
          treeOpen={treeOpen}
          setTreeOpen={setTreeOpen}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          totals={totals}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── FACE 1: spec entry ────────────────────── */

function SpecEntry({
  answers,
  setAnswer,
  answeredCount,
  allAnswered,
  onLaunch,
}: {
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  answeredCount: number;
  allAnswered: boolean;
  onLaunch: () => void;
}) {
  const pct = Math.round((answeredCount / QUESTIONS.length) * 100);
  return (
    <div className="gd-entry-grid">
      {/* the conversational document of questions */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: "14px",
          }}
        >
          <h2 style={{ ...h2, margin: 0 }}>Gap questions</h2>
          <span
            style={{
              fontFamily: "var(--font-term, ui-monospace, monospace)",
              fontSize: "12px",
              color: "var(--s-ink-dim)",
            }}
          >
            {answeredCount} of {QUESTIONS.length} answered
          </span>
        </div>

        <p style={{ ...lede, marginTop: 0, marginBottom: "18px" }}>
          The CTO surfaced five decisions that change what gets built. Answer in
          your own words; each one carries the reasoning so you are steering, not
          guessing.
        </p>

        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {QUESTIONS.map((q, i) => {
            const value = answers[q.id] ?? "";
            const answered = value.trim().length > 0;
            return (
              <li
                key={q.id}
                className="gd-qcard"
                style={{
                  background: "var(--s-slab)",
                  border: "1px solid var(--s-line)",
                  borderRadius: "6px",
                  padding: "16px 18px",
                  marginBottom: "12px",
                  position: "relative",
                }}
              >
                {/* left status spine */}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: "2px",
                    borderTopLeftRadius: "6px",
                    borderBottomLeftRadius: "6px",
                    background: answered ? "var(--s-ok-ink)" : "var(--s-line)",
                    transition: "background 0.2s",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-term, ui-monospace, monospace)",
                      fontSize: "12px",
                      color: answered ? "var(--s-ok-ink)" : "var(--s-ink-faint)",
                      minWidth: "22px",
                    }}
                  >
                    {answered ? "ok" : `0${i + 1}`}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        lineHeight: 1.35,
                        color: "var(--s-ink)",
                      }}
                    >
                      {q.question}
                    </div>

                    {/* the CTO's rationale - voiced, not a tooltip */}
                    <div
                      style={{
                        marginTop: "8px",
                        paddingLeft: "11px",
                        borderLeft: "2px solid var(--s-soft)",
                        fontSize: "12.5px",
                        lineHeight: 1.5,
                        color: "var(--s-ink-dim)",
                      }}
                    >
                      <span style={{ color: "var(--s-soft-ink)", fontWeight: 500 }}>
                        Why it matters.{" "}
                      </span>
                      {q.why}
                    </div>

                    {/* answer control */}
                    <div style={{ marginTop: "13px" }}>
                      {q.kind === "choice" && q.options ? (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "8px",
                          }}
                        >
                          {q.options.map((opt) => {
                            const on = value === opt;
                            return (
                              <button
                                key={opt}
                                onClick={() => setAnswer(q.id, opt)}
                                className="gd-focus gd-choice"
                                aria-pressed={on}
                                style={{
                                  appearance: "none",
                                  cursor: "pointer",
                                  fontFamily: "inherit",
                                  fontSize: "13px",
                                  padding: "7px 13px",
                                  borderRadius: "6px",
                                  border: on
                                    ? "1px solid transparent"
                                    : "1px solid var(--s-line)",
                                  background: on ? "var(--s-soft)" : "var(--s-slab-2)",
                                  color: on ? "var(--s-soft-ink)" : "var(--s-ink-dim)",
                                  fontWeight: on ? 600 : 400,
                                  transition:
                                    "background 0.14s, color 0.14s, border-color 0.14s",
                                }}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <textarea
                          value={value}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                          placeholder="Type your answer - a date, a number, or a sentence is plenty."
                          rows={2}
                          className="gd-focus"
                          style={{
                            width: "100%",
                            resize: "vertical",
                            boxSizing: "border-box",
                            fontFamily: "inherit",
                            fontSize: "13.5px",
                            lineHeight: 1.5,
                            padding: "10px 12px",
                            borderRadius: "6px",
                            border: "1px solid var(--s-line)",
                            background: "var(--s-slab-2)",
                            color: "var(--s-ink)",
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* sticky intake margin: progress + the launch action */}
      <aside className="gd-entry-aside">
        <div
          className="s-glass"
          style={{
            border: "1px solid var(--s-line)",
            borderRadius: "8px",
            padding: "18px",
            position: "sticky",
            top: "20px",
          }}
        >
          <div style={{ ...sectionLabel }}>Readiness</div>

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "8px",
              marginTop: "10px",
            }}
          >
            <span
              style={{
                fontSize: "32px",
                fontWeight: 600,
                lineHeight: 1,
                color: "var(--s-ink)",
                fontFamily: "var(--font-term, ui-monospace, monospace)",
              }}
            >
              {answeredCount}
            </span>
            <span style={{ fontSize: "14px", color: "var(--s-ink-faint)" }}>
              / {QUESTIONS.length} answered
            </span>
          </div>

          {/* a quiet progress meter (no pill) */}
          <div
            style={{
              marginTop: "12px",
              height: "4px",
              borderRadius: "2px",
              background: "var(--s-slab-2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: "var(--s-accent)",
                transition: "width 0.3s var(--ease-out, ease)",
              }}
            />
          </div>

          {/* per-question ticks */}
          <div
            style={{
              marginTop: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "7px",
            }}
          >
            {QUESTIONS.map((q) => {
              const done = (answers[q.id] ?? "").trim().length > 0;
              return (
                <div
                  key={q.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    fontSize: "12.5px",
                    color: done ? "var(--s-ink)" : "var(--s-ink-faint)",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: done ? "var(--s-ok-ink)" : "transparent",
                      border: done ? "none" : "1px solid var(--s-line)",
                    }}
                  />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {q.id}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            onClick={onLaunch}
            disabled={!allAnswered}
            className="gd-focus"
            style={{
              marginTop: "18px",
              width: "100%",
              appearance: "none",
              cursor: allAnswered ? "pointer" : "not-allowed",
              border: "1px solid transparent",
              borderRadius: "6px",
              padding: "11px 14px",
              fontSize: "14px",
              fontWeight: 600,
              fontFamily: "inherit",
              background: allAnswered ? "var(--s-accent)" : "var(--s-slab-2)",
              color: allAnswered ? "var(--s-on-accent)" : "var(--s-ink-faint)",
              transition: "background 0.16s",
            }}
          >
            {allAnswered ? "Shape the plan" : `Answer ${QUESTIONS.length - answeredCount} more`}
          </button>

          <p
            style={{
              marginTop: "11px",
              marginBottom: 0,
              fontSize: "11.5px",
              lineHeight: 1.5,
              color: "var(--s-ink-faint)",
            }}
          >
            Submitting launches the shape run read-only. No code is written, no
            secrets leave this machine - the plan is a document you approve
            before anything builds.
          </p>
        </div>
      </aside>
    </div>
  );
}

/* ─────────────────────────── FACE 2: live plan ─────────────────────── */

function LivePlan({
  treeOpen,
  setTreeOpen,
  activeSection,
  setActiveSection,
  totals,
}: {
  treeOpen: boolean;
  setTreeOpen: (v: boolean) => void;
  activeSection: string;
  setActiveSection: (id: string) => void;
  totals: { tokens: number; tools: number };
}) {
  return (
    <div
      className="gd-live-grid"
      style={{ gridTemplateColumns: treeOpen ? "240px minmax(0,1fr)" : "44px minmax(0,1fr)" }}
    >
      {/* ── collapsible node-tree mini-map (the navigational aside) ── */}
      <TreeMap
        open={treeOpen}
        setOpen={setTreeOpen}
        active={activeSection}
        onPick={setActiveSection}
      />

      {/* ── the document: a live-written vertical timeline ── */}
      <div style={{ minWidth: 0 }}>
        {/* run header: title + elapsed + global telemetry */}
        <div
          className="s-glass"
          style={{
            border: "1px solid var(--s-line)",
            borderRadius: "8px",
            padding: "15px 18px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
            <PulseDot />
            <div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--s-ink)" }}>
                Shape run - writing the plan
              </div>
              <div
                style={{
                  fontFamily: "var(--font-term, ui-monospace, monospace)",
                  fontSize: "11.5px",
                  color: "var(--s-ink-faint)",
                  marginTop: "2px",
                }}
              >
                planner / architect / reviewer · read-only
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "22px" }}>
            <HeaderStat label="elapsed" value="3:51" />
            <HeaderStat label="tokens" value={fmt(totals.tokens)} />
            <HeaderStat label="tools" value={`${totals.tools}`} />
          </div>
        </div>

        {/* the written sections */}
        <div style={{ position: "relative" }}>
          {/* the document spine that the timeline ticks hang on */}
          <span
            aria-hidden
            className="gd-spine"
            style={{ background: "var(--s-line)" }}
          />
          {SECTIONS.map((s, i) => (
            <SectionBlock
              key={s.id}
              section={s}
              index={i}
              active={activeSection === s.id || activeSection === sectionAlias(s.id)}
              onFocus={() => setActiveSection(s.id)}
            />
          ))}
        </div>

        {/* approval footer - the human gate between run-chain links */}
        <div
          style={{
            marginTop: "22px",
            paddingTop: "18px",
            borderTop: "1px solid var(--s-line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "12.5px",
              lineHeight: 1.5,
              color: "var(--s-ink-dim)",
              maxWidth: "440px",
            }}
          >
            When the draft settles, you review and approve it here. Approval
            launches the roadmap run, which turns the approved spec into ordered,
            dependency-aware board cards.
          </p>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="gd-focus" style={ghostBtn}>
              Request a change
            </button>
            <button className="gd-focus" style={primaryBtn}>
              Approve and build roadmap
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The architecture section id differs slightly from its tree id; keep the
 *  mini-map highlight in sync when one points at the other. */
function sectionAlias(id: string): string {
  if (id === "architecture") return "arch";
  return id;
}

/* ──────────────────────── node-tree mini-map ───────────────────────── */

function TreeMap({
  open,
  setOpen,
  active,
  onPick,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  active: string;
  onPick: (id: string) => void;
}) {
  // group by phase for the small "progress dots" row idiom
  const phases = useMemo(() => {
    const order: string[] = [];
    const byPhase = new Map<string, PlanNode[]>();
    for (const n of NODES) {
      if (!byPhase.has(n.phase)) {
        byPhase.set(n.phase, []);
        order.push(n.phase);
      }
      byPhase.get(n.phase)!.push(n);
    }
    return order.map((p) => ({ phase: p, nodes: byPhase.get(p) ?? [] }));
  }, []);

  if (!open) {
    return (
      <aside
        style={{
          border: "1px solid var(--s-line)",
          borderRadius: "8px",
          background: "var(--s-slab)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "10px 0",
          height: "fit-content",
          position: "sticky",
          top: "20px",
        }}
      >
        <button
          onClick={() => setOpen(true)}
          className="gd-focus"
          aria-label="Open map"
          title="Open the plan map"
          style={iconBtn}
        >
          <Chevron dir="right" />
        </button>
        <div
          style={{
            marginTop: "10px",
            writingMode: "vertical-rl",
            fontFamily: "var(--font-term, ui-monospace, monospace)",
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "var(--s-ink-faint)",
          }}
        >
          plan map
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{
        border: "1px solid var(--s-line)",
        borderRadius: "8px",
        background: "var(--s-slab)",
        padding: "14px",
        height: "fit-content",
        position: "sticky",
        top: "20px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <span style={sectionLabel}>Plan map</span>
        <button
          onClick={() => setOpen(false)}
          className="gd-focus"
          aria-label="Collapse map"
          title="Collapse the map"
          style={iconBtn}
        >
          <Chevron dir="left" />
        </button>
      </div>

      {phases.map((group) => (
        <div key={group.phase} style={{ marginBottom: "14px" }}>
          {/* phase header with the little progress-dots row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-term, ui-monospace, monospace)",
                fontSize: "11px",
                color: "var(--s-ink-dim)",
              }}
            >
              {group.phase}
            </span>
            <span style={{ display: "flex", gap: "3px" }}>
              {group.nodes.map((n) => (
                <span
                  key={n.id}
                  title={`${n.name} - ${statusLabel(n.status)}`}
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background:
                      n.status === "pending"
                        ? "var(--s-line)"
                        : statusInk(n.status),
                  }}
                />
              ))}
            </span>
          </div>

          {/* the tree itself: hand-rolled connector edges */}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {group.nodes.map((n) => {
              const isChild = n.parent !== null;
              const isActive = active === n.id;
              return (
                <li
                  key={n.id}
                  style={{ position: "relative", paddingLeft: isChild ? "20px" : "0" }}
                >
                  {isChild ? (
                    <>
                      {/* vertical + elbow edge, hand-rolled */}
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: "6px",
                          top: 0,
                          bottom: "50%",
                          width: "1px",
                          background: "var(--s-line)",
                        }}
                      />
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: "6px",
                          top: "50%",
                          width: "9px",
                          height: "1px",
                          background: "var(--s-line)",
                        }}
                      />
                    </>
                  ) : null}
                  <button
                    onClick={() => onPick(n.id)}
                    className="gd-focus gd-treerow"
                    style={{
                      appearance: "none",
                      cursor: "pointer",
                      width: "100%",
                      textAlign: "left",
                      border: "1px solid",
                      borderColor: isActive ? "var(--s-hover-line)" : "transparent",
                      borderRadius: "5px",
                      background: isActive ? "var(--s-slab-2)" : "transparent",
                      padding: "5px 7px",
                      margin: "2px 0",
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      fontFamily: "inherit",
                      color: "var(--s-ink)",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        flexShrink: 0,
                        background:
                          n.status === "pending" ? "var(--s-line)" : statusInk(n.status),
                        boxShadow:
                          n.status === "running"
                            ? "0 0 0 3px var(--s-ok)"
                            : "none",
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: isChild ? "12px" : "12.5px",
                        fontWeight: isChild ? 400 : 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: isChild ? "var(--s-ink-dim)" : "var(--s-ink)",
                      }}
                    >
                      {n.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-term, ui-monospace, monospace)",
                        fontSize: "10px",
                        color: "var(--s-ink-faint)",
                      }}
                    >
                      {n.tokens > 0 ? fmt(n.tokens) : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}

/* ─────────────────────── a written section block ───────────────────── */

function SectionBlock({
  section,
  index,
  active,
  onFocus,
}: {
  section: DocSection;
  index: number;
  active: boolean;
  onFocus: () => void;
}) {
  const running = section.status === "running";
  return (
    <section
      onMouseEnter={onFocus}
      style={{
        position: "relative",
        paddingLeft: "34px",
        paddingBottom: "26px",
      }}
    >
      {/* timeline tick on the spine */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: "9px",
          top: "4px",
          width: "12px",
          height: "12px",
          borderRadius: "50%",
          background: "var(--s-bg)",
          border: `2px solid ${
            section.status === "pending" ? "var(--s-line)" : statusInk(section.status)
          }`,
          boxShadow: running ? "0 0 0 4px var(--s-ok)" : "none",
          zIndex: 1,
        }}
      />

      {/* the section card - dense, document-like */}
      <div
        style={{
          background: "var(--s-slab)",
          border: "1px solid",
          borderColor: active ? "var(--s-hover-line)" : "var(--s-line)",
          borderRadius: "8px",
          transition: "border-color 0.18s",
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 132px",
        }}
      >
        {/* the prose column */}
        <div style={{ padding: "16px 18px", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "10px",
              marginBottom: "10px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-term, ui-monospace, monospace)",
                fontSize: "11.5px",
                color: "var(--s-ink-faint)",
              }}
            >
              0{index + 1}
            </span>
            <h3
              style={{
                margin: 0,
                fontSize: "17px",
                fontWeight: 600,
                color: "var(--s-ink)",
              }}
            >
              {section.title}
            </h3>
            <span
              style={{
                fontFamily: "var(--font-term, ui-monospace, monospace)",
                fontSize: "11px",
                color: section.kind ? "var(--s-ink-faint)" : "transparent",
              }}
            >
              {section.kind}
            </span>
            {/* status as flat tinted text on a subtle tint, max 6px radius */}
            <span
              style={{
                marginLeft: "auto",
                fontSize: "11px",
                fontWeight: 500,
                padding: "2px 7px",
                borderRadius: "5px",
                background: statusBg(section.status),
                color: statusInk(section.status),
              }}
            >
              {statusLabel(section.status)}
            </span>
          </div>

          {section.body.map((p, pi) => {
            const last = pi === section.body.length - 1;
            const streaming = running && last;
            return (
              <p
                key={pi}
                style={{
                  margin: pi === 0 ? "0 0 9px" : "0 0 9px",
                  fontSize: "13.5px",
                  lineHeight: 1.6,
                  color:
                    section.status === "pending"
                      ? "var(--s-ink-faint)"
                      : "var(--s-ink-dim)",
                }}
              >
                {p}
                {streaming ? <span className="gd-caret" /> : null}
              </p>
            );
          })}

          {section.ledger && section.ledger.length > 0 ? (
            <dl
              style={{
                margin: "12px 0 0",
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                rowGap: "5px",
                columnGap: "12px",
              }}
            >
              {section.ledger.map((row) => (
                <div key={row.label} style={{ display: "contents" }}>
                  <dt
                    style={{
                      fontFamily: "var(--font-term, ui-monospace, monospace)",
                      fontSize: "11.5px",
                      color: "var(--s-ink-faint)",
                    }}
                  >
                    {row.label}
                  </dt>
                  <dd
                    style={{
                      margin: 0,
                      fontSize: "12.5px",
                      color: "var(--s-ink)",
                    }}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        {/* the quiet margin rail of telemetry */}
        <div
          style={{
            borderLeft: "1px solid var(--s-line)",
            padding: "16px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "11px",
            justifyContent: "flex-start",
            background: "var(--s-slab-2)",
            borderTopRightRadius: "8px",
            borderBottomRightRadius: "8px",
          }}
        >
          <RailStat label="tokens" value={section.tokens > 0 ? fmt(section.tokens) : "-"} />
          <RailStat label="tools" value={section.tools > 0 ? `${section.tools}` : "-"} />
          <RailStat label="elapsed" value={section.elapsed} />
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── small parts ─────────────────────────── */

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div
        style={{
          fontFamily: "var(--font-term, ui-monospace, monospace)",
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--s-ink)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "10.5px", color: "var(--s-ink-faint)", marginTop: "2px" }}>
        {label}
      </div>
    </div>
  );
}

function RailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: "10px",
          color: "var(--s-ink-faint)",
          letterSpacing: "0.03em",
          marginBottom: "2px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-term, ui-monospace, monospace)",
          fontSize: "14px",
          fontWeight: 600,
          color: "var(--s-ink)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PulseDot() {
  return (
    <span
      aria-hidden
      style={{ position: "relative", width: "10px", height: "10px", flexShrink: 0 }}
    >
      <span
        className="gd-pulse"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "var(--s-ok-ink)",
        }}
      />
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "var(--s-ok-ink)",
        }}
      />
    </span>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "M9 2.5 4.5 7 9 11.5" : "M5 2.5 9.5 7 5 11.5"}
        stroke="var(--s-ink-dim)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ───────────────────────────── style atoms ─────────────────────────── */

const h2: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  color: "var(--s-ink)",
};

const lede: React.CSSProperties = {
  fontSize: "13.5px",
  lineHeight: 1.55,
  color: "var(--s-ink-dim)",
  maxWidth: "560px",
};

const sectionLabel: React.CSSProperties = {
  fontFamily: "var(--font-term, ui-monospace, monospace)",
  fontSize: "11px",
  letterSpacing: "0.04em",
  color: "var(--s-ink-dim)",
};

const iconBtn: React.CSSProperties = {
  appearance: "none",
  cursor: "pointer",
  background: "transparent",
  border: "1px solid var(--s-line)",
  borderRadius: "5px",
  width: "26px",
  height: "26px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const ghostBtn: React.CSSProperties = {
  appearance: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 500,
  padding: "9px 15px",
  borderRadius: "6px",
  border: "1px solid var(--s-line)",
  background: "transparent",
  color: "var(--s-ink-dim)",
};

const primaryBtn: React.CSSProperties = {
  appearance: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  padding: "9px 15px",
  borderRadius: "6px",
  border: "1px solid transparent",
  background: "var(--s-accent)",
  color: "var(--s-on-accent)",
};

/* Scoped CSS: keyframes + the structural rules that inline styles cannot carry
 * (the document spine height, the streaming caret, focus ring, responsive grid).
 * Every COLOUR here is still a --s-* token. */
const gdStyle = `
.gd-root * { box-sizing: border-box; }

.gd-entry-grid {
  display: grid;
  grid-template-columns: minmax(0,1fr) 264px;
  gap: 26px;
  align-items: start;
}
.gd-live-grid {
  display: grid;
  gap: 24px;
  align-items: start;
  transition: grid-template-columns 0.22s var(--ease-out, ease);
}
@media (max-width: 880px) {
  .gd-entry-grid { grid-template-columns: minmax(0,1fr); }
  .gd-entry-aside { display: none; }
  .gd-live-grid { grid-template-columns: minmax(0,1fr) !important; }
}

.gd-focus:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--s-ring);
}

.gd-qcard { transition: border-color 0.18s var(--ease-out, ease); }
.gd-qcard:hover { border-color: var(--s-hover-line); }
.gd-choice:hover { border-color: var(--s-hover-line); }
.gd-treerow:hover { background: var(--s-slab-2); }

/* document spine - the vertical line the timeline ticks hang on */
.gd-spine {
  position: absolute;
  left: 14px;
  top: 6px;
  bottom: 22px;
  width: 1px;
}

/* streaming text caret on the live section */
.gd-caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--s-ok-ink);
  animation: gd-blink 1s steps(2, start) infinite;
}
@keyframes gd-blink { 50% { opacity: 0; } }

/* the running pulse on the run header + tree */
.gd-pulse { animation: gd-ping 1.8s var(--ease-out, ease) infinite; }
@keyframes gd-ping {
  0% { transform: scale(1); opacity: 0.55; }
  70%, 100% { transform: scale(2.6); opacity: 0; }
}
`;
