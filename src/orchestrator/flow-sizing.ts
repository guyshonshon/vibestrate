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
