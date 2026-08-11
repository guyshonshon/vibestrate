// ── Flow sizer ──────────────────────────────────────────────────────────────
//
// Routes obviously-trivial tasks to the `express` flow so "make a test.txt"
// stops paying for plan -> architect -> review. Two tiers:
//
//   - deterministic (default): a conservative classifier - zero model calls.
//     Fires when the task is short, is not a build-a-system brief, and names
//     nothing from the sensitive vocabulary below.
//   - assisted (opt-in): a single cheap structured assist call for the gray
//     zone; anything but a confident "trivial" -> the default flow.
//
// Why this cannot launder risk (the locked guardrails):
//   - Task-text judgment here chooses FRONT leanness only. The back gates stay
//     diff-decided inside `express` itself (skipWhen: inert_diff +
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

const MAX_TASK_CHARS = 400;
const MAX_TASK_WORDS = 60;

const STRICT_PROSE_EXT_RE = /\.(md|markdown|txt|rst)$/i;
/** File-looking tokens: a basename/path with an extension of 1-8 word chars.
 *  Used by the plan-worthiness classifier below - a named code file means a
 *  targeted change, not a greenfield build. */
const FILE_TOKEN_RE = /[\w./\\-]+\.[A-Za-z0-9]{1,8}\b/g;

// ── The refusal vocabulary ───────────────────────────────────────────────────
//
// Two groups, because they catch different mistakes.
//
// WEAKENING asks what the sentence proposes to DO. "Skip the email check",
// "make it visible to everyone", "hardcode the key" are dangerous whatever they
// touch, and no noun in them is sensitive - a domain list alone never sees them.
//
// SENSITIVE asks what the sentence is ABOUT, in the words the people writing
// these tasks actually use. An earlier pass at this was written in engineer
// vocabulary - "payment", "authorization", "validation" - and sailed past
// "make the checkout button work" and "make the admin page visible to everyone".
// Someone describing intent rather than implementation says "checkout", not
// "payment"; "admin page", not "authorization". So the list is product-side on
// purpose, and it is deliberately over-broad: a false refusal costs a heavier
// flow, which is the direction this is allowed to be wrong in.
const WEAKENING = [
  "skip",
  "bypass",
  "disable",
  "turn off",
  "opt out",
  "no longer require",
  "stop requiring",
  "allow anyone",
  "allow everyone",
  "visible to everyone",
  "available to everyone",
  "make it public",
  "hardcode",
  "hard-code",
  "comment out",
  "ignore the error",
  "suppress",
];

const SENSITIVE = [
  // Identity and access, as a person would name it.
  "auth", "login", "log in", "logout", "signup", "sign up", "register",
  "password", "credential", "token", "session", "cookie", "secret", "api key",
  "permission", "role", "admin", "authorization", "access control",
  // Money. Bare "price"/"pricing" are deliberately absent: a price tag and a
  // pricing page are display copy, and money LOGIC reliably says checkout,
  // billing or payment somewhere in the same sentence.
  "payment", "billing", "checkout", "cart", "invoice", "subscription",
  "refund", "charge", "coupon", "discount", "stripe",
  "orders", "place an order", "order history",
  // Personal data. "address" is qualified rather than bare - "address the
  // spacing issue" is ordinary phrasing and has nothing to do with PII.
  "account", "profile", "email", "phone", "personal data", "user data",
  "gdpr", "privacy", "email address", "shipping address", "billing address",
  "home address", "mailing address",
  // Persistence and shape.
  "database", "schema", "migration", "migrate", "sql", "query",
  // Anything that leaves the machine or changes how it is built.
  "deploy", "production", "ci", "pipeline", "webhook", "cors", "redirect",
  "upload", "download", "env", "environment variable", "dockerfile",
  "package.json", "lockfile", "dependency", "upgrade",
  // Destructive. Bare "reset" is absent - a CSS reset is a stylesheet, not a
  // destructive act; the dangerous senses are covered by the rest of this line.
  "delete", "drop", "wipe", "purge", "password reset", "reset the database",
  // Structural: not a tweak, whatever it touches.
  "refactor", "rewrite", "restructure", "rename everything",
];

/** Word-boundary alternation over a phrase list. Phrases may contain spaces, so
 *  interior whitespace is relaxed to `\s+` and dots are escaped. */
function phraseMatcher(phrases: readonly string[]): RegExp {
  const alts = phrases
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .join("|");
  return new RegExp(`\\b(${alts})\\b`, "i");
}

const WEAKENING_RE = phraseMatcher(WEAKENING);
const SENSITIVE_RE = phraseMatcher(SENSITIVE);

/**
 * Deterministic obvious-trivial classifier. Pure and conservative: misclassifying
 * toward "standard" costs a heavier flow (safe); the inverse is bounded by
 * express's own diff floor, which reviews AND verifies every code change no
 * matter what this function believed about the task text.
 *
 * It deliberately does NOT care which files the task names. Requiring a named
 * file was the previous rule, and it is anti-correlated with the people this
 * tier exists for: describing intent instead of paths ("make the font bigger")
 * is the normal way to write one of these, and it disqualified every such task.
 * File names are the diff's business, and the diff is consulted later.
 */
export function classifyObviousTrivial(task: string): TrivialClassification {
  const text = (task ?? "").trim();
  if (!text) return { trivial: false, reasons: ["empty task"] };
  if (text.length > MAX_TASK_CHARS) {
    return { trivial: false, reasons: ["task too long for the trivial tier"] };
  }
  if (text.split(/\s+/).length > MAX_TASK_WORDS) {
    return { trivial: false, reasons: ["task too wordy for the trivial tier"] };
  }
  // A build-a-system brief is never trivial. Without this the sizer and the
  // adaptive spec-up trigger could both fire, spec'ing up a whole product and
  // then building it in one express turn.
  if (classifyPlanWorthy(text).planWorthy) {
    return { trivial: false, reasons: ["a build-a-system brief, not a tweak"] };
  }
  const weakening = text.match(WEAKENING_RE);
  if (weakening) {
    return {
      trivial: false,
      reasons: [`proposes weakening a safeguard: "${weakening[0]}"`],
    };
  }
  const sensitive = text.match(SENSITIVE_RE);
  if (sensitive) {
    return {
      trivial: false,
      reasons: [`touches sensitive ground: "${sensitive[0]}"`],
    };
  }
  return {
    trivial: true,
    reasons: ["short task, not a build brief, no sensitive or weakening terms"],
  };
}

// ── Plan-worthiness (the adaptive spec-up trigger) ─────────────────────────────
// Deterministic "does this brief warrant spec-up first?" classifier. Distinct
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
    return { planWorthy: true, reasons: ["build verb + building a qualified system - spec it up first"] };
  }
  // Path 2: a substantial build brief (>=12 words) that is still building "a"
  // thing (e.g. "build a real-time chat feature with websockets and message
  // persistence and presence" - 12 words). The "a/an" gate keeps perf/refactor
  // run-ons ("make the API faster and also add caching ...") out.
  if (hasBuildVerb && hasIndefinite && words >= 12) {
    return { planWorthy: true, reasons: [`build verb + a substantial brief (${words} words) - spec it up first`] };
  }
  return { planWorthy: false, reasons: ["no greenfield/system-build signal - execute"] };
}
