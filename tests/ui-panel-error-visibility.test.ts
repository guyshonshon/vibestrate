import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Honest-degradation guardrail.
 *
 * `api.getX().catch(() => null)` inside a `Promise.all` gets the isolation
 * right and the honesty wrong: the panel renders its empty state, so "the
 * request failed" and "there is nothing here" look identical. A run's diff read
 * as "changed nothing", a swallowed approvals list read as "no run needs you".
 *
 * The fix is not "no fallbacks anywhere" - per-item isolation is correct. The
 * rule is that a swallowed read must be a DELIBERATE, JUSTIFIED choice, written
 * at the call site. So: every silent catch under the dashboard's routes and
 * components must carry a "Safe to degrade silently" rationale within the lines
 * just above it. Anything else has to route through `lib/settled.ts` and render
 * the failure.
 *
 * This is a structural guard, not a rendering test - the repo has no DOM test
 * environment, so it cannot prove the ErrorView actually paints. It proves the
 * error reaches a render path and that no new silent swallow slips in
 * unexplained. Named after the invariant it defends.
 */

const UI_ROOT = path.join(process.cwd(), "src", "ui");

/** `.catch(() => null | undefined | {} | [] | false | 0 | "")`. */
const SILENT_CATCH = /\.catch\(\(\)\s*=>\s*(?:\{\s*\}|null|undefined|\[\]|false|0|"")/;

/** The written justification a deliberate swallow must carry. */
const JUSTIFICATION = "Safe to degrade silently";

/** How far above the catch the rationale may sit (it precedes the whole chain). */
const LOOKBACK = 12;

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test."))
      out.push(full);
  }
  return out;
}

/**
 * The surfaces where "absent" and "failed" carry different consequences for a
 * decision the user is about to make. Each must import the settle seam and
 * render an ErrorView, so a failed sub-fetch has somewhere to go.
 */
const HONEST_PANELS = [
  "app/routes/RunDetailPage.tsx",
  "app/routes/RunsPage.tsx",
  "app/routes/MissionControlPage.tsx",
  "components/control/RunControlPage.tsx",
  "components/tasks/TaskGitActivity.tsx",
  "components/runs/ReviewFindingsPanel.tsx",
  "components/runs/SpecUpReview.tsx",
  "components/runs/LiveTimeline.tsx",
  "components/metrics/BudgetControl.tsx",
  "components/saga/ConductorPanel.tsx",
];

describe("dashboard panels never present a failed fetch as an empty state", () => {
  it("justifies every silent catch under routes/ and components/", async () => {
    const roots = [
      path.join(UI_ROOT, "app", "routes"),
      path.join(UI_ROOT, "components"),
    ];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of await sourceFiles(root)) {
        const lines = (await readFile(file, "utf8")).split("\n");
        lines.forEach((line, i) => {
          if (!SILENT_CATCH.test(line)) return;
          const context = lines.slice(Math.max(0, i - LOOKBACK), i + 1).join("\n");
          if (!context.includes(JUSTIFICATION))
            offenders.push(
              `${path.relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`,
            );
        });
      }
    }
    expect(
      offenders,
      `These swallow a read without saying why the user may not be told.\n` +
        `Either route it through src/ui/lib/settled.ts and render <ErrorView compact …/>,\n` +
        `or write a "${JUSTIFICATION}: …" comment above it explaining why an empty\n` +
        `state is a fair reading of the failure.\n\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it.each(HONEST_PANELS)("%s renders its sub-fetch failures", async (rel) => {
    const src = await readFile(path.join(UI_ROOT, rel), "utf8");
    // <ErrorView> is the normal surface; describeError() covers the dense rows
    // where a full recovery card would not fit and the failure renders inline.
    expect(
      src,
      `${rel} must put a failed sub-fetch on screen via <ErrorView> or describeError()`,
    ).toMatch(/<ErrorView\b|describeError\(/);
    expect(
      src,
      `${rel} must keep failures as values (settle()/errorOf()) rather than catching to a fallback`,
    ).toMatch(/from "[^"]*lib\/(settled|error-view)/);
  });
});
