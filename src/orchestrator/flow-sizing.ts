// ── A1: flow sizer (proportional-orchestration.md / batch P4c) ──────────────
//
// Routes obviously-trivial tasks to the `express` flow so "make a test.txt"
// stops paying for plan -> architect -> review. Two tiers:
//
//   - deterministic (default): a conservative, structural classifier - zero
//     model calls. Fires only when the task is short, names at least one file,
//     and EVERY file it names is strict prose (.md/.markdown/.txt/.rst).
//   - assisted (opt-in): a single cheap structured assist call for the gray
//     zone; anything but a confident "trivial" -> the default flow.
//
// Why this cannot launder risk (the locked guardrails):
//   - Task-text judgment here chooses FRONT leanness only. The back gates stay
//     diff-decided inside `express` itself (skipWhen: inert_diff + A2
//     protected paths): a "trivial" task whose agent actually edits code gets
//     a real review turn, whatever the sizer believed.
//   - The sizer's target set is structurally ["express"] - it can never route
//     to a flow without diff-floored back gates.
//   - The persona upgrade-bias runs AFTER sizing and beats it (risk-tagged
//     tasks get upgraded away from express).
//   - It only runs when no --flow, no --select, and no config.defaultFlow -
//     an explicit user choice always wins.

/** The sizer's only possible target. Structural: not user-extensible. */
export const SIZER_TARGET_FLOW = "express";

/** The adaptive spec-up trigger's only target: the read-only intake flow. */
export const SPEC_UP_TARGET_FLOW = "spec-up-intake";

export type FlowSizingMode = "off" | "deterministic" | "assisted";

export type TrivialClassification = {
  trivial: boolean;
  reasons: string[];
};

const STRICT_PROSE_EXT_RE = /\.(md|markdown|txt|rst)$/i;
/** File-looking tokens: a basename/path with an extension of 1-8 word chars. */
const FILE_TOKEN_RE = /[\w./\\-]+\.[A-Za-z0-9]{1,8}\b/g;
const MAX_TASK_CHARS = 400;
const MAX_TASK_WORDS = 60;

/**
 * Deterministic obvious-trivial classifier. Pure, structural, conservative:
 * misclassifying toward "standard" costs a heavier flow (safe); the inverse
 * is bounded by express's own diff floor.
 */
export function classifyObviousTrivial(task: string): TrivialClassification {
  const text = (task ?? "").trim();
  if (!text) return { trivial: false, reasons: ["empty task"] };
  if (text.length > MAX_TASK_CHARS) {
    return { trivial: false, reasons: ["task too long for the trivial tier"] };
  }
  const words = text.split(/\s+/).length;
  if (words > MAX_TASK_WORDS) {
    return { trivial: false, reasons: ["task too wordy for the trivial tier"] };
  }
  const fileTokens = [...new Set(text.match(FILE_TOKEN_RE) ?? [])];
  if (fileTokens.length === 0) {
    return {
      trivial: false,
      reasons: ["no concrete file named - can't size structurally"],
    };
  }
  const nonProse = fileTokens.filter((t) => !STRICT_PROSE_EXT_RE.test(t));
  if (nonProse.length > 0) {
    return {
      trivial: false,
      reasons: [`non-prose file(s) named: ${nonProse.slice(0, 5).join(", ")}`],
    };
  }
  return {
    trivial: true,
    reasons: [
      `short task naming only strict-prose file(s): ${fileTokens.slice(0, 5).join(", ")}`,
    ],
  };
}

// ── Plan-worthiness (the adaptive Shape trigger) ─────────────────────────────
// Deterministic "does this brief warrant shaping first?" classifier. Distinct
// from classifyEffort (a trivial-vs-standard sizer with no greenfield
// vocabulary): this keys on GREENFIELD / SYSTEM-BUILDING / AMBIGUITY signals so
// "build a mini ecommerce store" shapes, while targeted edits ("add dark mode to
// the navbar", "fix the test in auth.ts") execute. BIAS TO EXECUTE: it fires
// only on a clear build-a-system reading and never when a concrete code file is
// named (that is a targeted change, not greenfield).

/** Build/greenfield verbs - deliberately EXCLUDES "add"/"fix"/"update" (too
 *  common on targeted edits). */
const BUILD_VERB_RE =
  /\b(build|create|make|design|redesign|develop|architect|scaffold|bootstrap|spin up|stand up|set up|prototype)\b/;
/** System-scale nouns. */
const SCOPE_NOUNS =
  "app|application|site|website|web ?app|platform|system|service|micro-?service|dashboard|store|shop|marketplace|saas|product|portal|engine|pipeline|crm|cms|api|backend|frontend|game|bot|tool|landing page|integration";
/** "a/an [1-4 qualifier words] <scope noun>" - the discriminator for building a
 *  NEW system instance. Requires >=1 qualifier word so a bare "a tool"/"a store"
 *  does NOT fire, while "a mini ecommerce store"/"a SaaS dashboard" do. The
 *  indefinite article is what separates "build a store" from "make the API
 *  faster" (definite, a targeted tweak - never shapes). */
const INDEFINITE_SCOPE_RE = new RegExp(
  `\\b(?:a|an)\\s+(?:[a-z][a-z0-9-]*\\s+){1,4}(?:${SCOPE_NOUNS})\\b`,
);
/** Explicit greenfield phrasing - fires on its own. */
const GREENFIELD_RE = /\b(from scratch|greenfield|new project|new app|mvp|proof of concept|poc)\b/;

export type PlanWorthyClassification = {
  planWorthy: boolean;
  reasons: string[];
};

export function classifyPlanWorthy(task: string): PlanWorthyClassification {
  const text = (task ?? "").trim();
  if (!text) return { planWorthy: false, reasons: ["empty task"] };
  // A brief that names a concrete code file is a targeted change, not greenfield.
  // (Strict-prose-only files are allowed through - "write a spec.md" can still be
  // a planning ask - but a .ts/.py/etc. token means execute.)
  const fileTokens = [...new Set(text.match(FILE_TOKEN_RE) ?? [])];
  const codeFile = fileTokens.find((t) => !STRICT_PROSE_EXT_RE.test(t));
  if (codeFile) {
    return { planWorthy: false, reasons: [`names a concrete file (${codeFile}) - targeted, not greenfield`] };
  }
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).length;
  if (GREENFIELD_RE.test(lower)) {
    return { planWorthy: true, reasons: ["explicit greenfield phrasing"] };
  }
  const hasBuildVerb = BUILD_VERB_RE.test(lower);
  const hasIndefinite = /\b(?:a|an)\b/.test(lower);
  // Path 1: building "a [qualified] <system>" - the indefinite article + a
  // qualified scope noun. Excludes targeted tweaks ("make the API faster" has no
  // indefinite article building a thing) and bare asks ("build a tool").
  if (hasBuildVerb && INDEFINITE_SCOPE_RE.test(lower)) {
    return { planWorthy: true, reasons: ["build verb + building a qualified system - shape it first"] };
  }
  // Path 2: a substantial build brief (>=12 words) that is still building "a"
  // thing (e.g. "build a real-time chat feature with websockets and message
  // persistence and presence" - 12 words). The "a/an" gate keeps perf/refactor
  // run-ons ("make the API faster and also add caching ...") out.
  if (hasBuildVerb && hasIndefinite && words >= 12) {
    return { planWorthy: true, reasons: [`build verb + a substantial brief (${words} words) - shape it first`] };
  }
  return { planWorthy: false, reasons: ["no greenfield/system-build signal - execute"] };
}
