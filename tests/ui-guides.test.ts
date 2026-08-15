import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDES, matchGuide, wantsWalkthrough } from "../src/ui/lib/guides/guides.js";
import { WALKTHROUGH_ANCHORS } from "../src/ui/lib/guides/generated.js";
import { parseHashRoute, serializeRoute } from "../src/ui/app/route.js";

/**
 * The rot check for the authored walkthroughs.
 *
 * A guide is data that points at the real app, so it fails in exactly two
 * silent ways: a route that no longer parses back to what it names, and an
 * anchor whose `data-tour` attribute was renamed or deleted with the page.
 * Neither shows up as a type error and neither throws at runtime - the step
 * just quietly points at nothing. This asserts both against the live source.
 */

const UI_DIR = fileURLToPath(new URL("../src/ui", import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * Anchors registered in the UI. Two spellings exist: the attribute written
 * directly, and Sidebar's `tourId` prop, which NavItem forwards into the
 * attribute. A third spelling appearing means this test needs to learn it -
 * failing loudly is the point.
 */
function registeredAnchors(): Set<string> {
  const found = new Set<string>();
  const re = /(?:data-tour|tourId)="([A-Za-z0-9-]+)"/g;
  for (const file of sourceFiles(UI_DIR)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(re)) {
      const anchor = m[1];
      if (anchor) found.add(anchor);
    }
  }
  return found;
}

const ANCHORS = registeredAnchors();

describe("guide catalog", () => {
  it("registers at least the anchors the tour has always used", () => {
    // Guards the scanner itself: a regex that silently matched nothing would
    // make every anchor assertion below vacuous.
    expect(ANCHORS.has("nav-runs")).toBe(true);
    expect(ANCHORS.has("consult-orb")).toBe(true);
    expect(ANCHORS.has("nav-flows")).toBe(true);
  });

  it("leaves no registered anchor unused by any step", () => {
    // The failure this exists for: someone adds `data-tour` attributes to the
    // pages and someone else owns the catalog, so the attributes land and
    // nothing ever points at them. Every step still has a route, so a
    // "route or anchor" check passes while the highlight feature is dead.
    // An anchor with no step is either dead weight or a step someone forgot.
    const used = new Set(
      GUIDES.flatMap((g) => g.steps).flatMap((s) => (s.anchor ? [s.anchor] : [])),
    );
    const orphaned = [...ANCHORS].filter((a) => !used.has(a)).sort();
    expect({ orphaned }).toEqual({ orphaned: [] });
  });

  it("defers no anchor to a comment", () => {
    // `// Wants \`x\` on ...` was how ten anchors sat unwired through a whole
    // release: the intent was recorded where no test could read it.
    const src = readFileSync(
      fileURLToPath(new URL("../src/ui/lib/guides/guides.ts", import.meta.url)),
      "utf8",
    );
    expect(src).not.toMatch(/\/\/\s*Wants\s+`/);
  });

  it("has unique guide ids", () => {
    const ids = GUIDES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offers a model no anchor this repo does not contain", () => {
    // The vocabulary a generated walkthrough may name is a hand-written table
    // in generated.ts, and its comment says it is asserted against this grep.
    // It was not. An anchor renamed with its page would leave the model being
    // offered a control that rings nothing, and the step would pass every
    // runtime check on the way there.
    const unregistered = WALKTHROUGH_ANCHORS.filter((a) => !ANCHORS.has(a)).sort();
    expect({ unregistered }).toEqual({ unregistered: [] });
  });
});

describe("wantsWalkthrough", () => {
  it("offers on a question that asked to be shown", () => {
    for (const ask of [
      "how do i add a review step",
      "How do I make a *new flow*?",
      "show me how to wire up a policy",
      "walk me through the merge gate",
      "where do i change the default provider",
      "what is a seat",
      "what's an effort level",
      "teach me the board",
      "what are the steps to get a run reviewed",
    ]) {
      expect({ ask, offered: wantsWalkthrough(ask) }).toEqual({ ask, offered: true });
    }
  });

  it("stays quiet on a question about state, a complaint, or nothing", () => {
    // The cost of a false positive is a button offering to walk somebody
    // through their own broken run, under the answer explaining why it broke.
    for (const ask of [
      "why did the last run block",
      "the run failed, what do i do",
      "is the reviewer done yet",
      "summarise the diff",
      "did it push anything",
      "",
      "   ",
    ]) {
      expect({ ask, offered: wantsWalkthrough(ask) }).toEqual({ ask, offered: false });
    }
  });

  it("offers on everything the authored catalog already matches", () => {
    // The surface dispatches an authored walkthrough when one exists, so a
    // phrase the catalog matches but this gate refuses would hide a tested
    // walkthrough behind a button that never appears.
    for (const guide of GUIDES) {
      for (const ask of guide.asks) {
        expect({ ask, offered: wantsWalkthrough(ask) }).toEqual({ ask, offered: true });
      }
    }
  });

  it("takes non-strings without throwing", () => {
    for (const raw of [null, undefined, 42, {}, []]) {
      expect(wantsWalkthrough(raw as unknown as string)).toBe(false);
    }
  });
});

describe("the surfaces that can open a walkthrough", () => {
  /**
   * The failure this exists for, measured rather than imagined: the whole
   * generated-walkthrough machinery shipped with exactly one importer, on the
   * consult answer view. The owner asks their questions in the SUPERVISOR
   * panel, so the button they asked for could not appear for them, and nothing
   * failed - every unit test passed, both typecheck legs passed, and the
   * feature was simply unreachable from the screen it was for.
   *
   * A grep is the only thing that catches that class of bug, because "nobody
   * renders this" is not a type error.
   */
  it("keeps the supervisor panel wired to the walkthrough engine", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../src/ui/components/supervisor/SupervisorControl.tsx", import.meta.url)),
      "utf8",
    );
    expect(src).toMatch(/wantsWalkthrough\(/);
    expect(src).toMatch(/<ShowMeHow\b/);
    expect(src).toMatch(/launchGuide\(/);
  });

  it("keeps every walkthrough launch behind the one engine", () => {
    // launchGeneratedWalkthrough takes the branded result of the runtime gate
    // and nothing else. A surface that built a Guide by hand and dispatched the
    // event itself would bypass every check in generated.ts, so the event name
    // is spelled in exactly two places: the catalog that defines it and the
    // overlay pair that fires and listens for it.
    const dispatchers = sourceFiles(UI_DIR).filter((f) =>
      readFileSync(f, "utf8").includes("GUIDE_LAUNCH_EVENT"),
    );
    expect(dispatchers.map((f) => f.slice(UI_DIR.length + 1).replace(/\\/g, "/")).sort()).toEqual([
      "components/onboarding/TourOverlay.tsx",
      "lib/guides/guides.ts",
    ]);
  });
});

describe("matchGuide", () => {
  /**
   * The exact string that made the old matcher wrong. It derived a guide's
   * subject from its title, so "Run something for the first time" reduced to
   * "run" and every question containing the word - about a run that already
   * exists, and therefore a question for the project side - was answered with
   * an offer to walk the user through their first one.
   */
  it("does not offer a walkthrough for a question about an existing run", () => {
    expect(matchGuide("how do i cancel a run")).toBeNull();
    expect(matchGuide("why did the first run block")).toBeNull();
    expect(matchGuide("the run failed, what do i do")).toBeNull();
  });

  it("does not offer a walkthrough for a complaint about a thing that exists", () => {
    expect(matchGuide("why did my crew fail")).toBeNull();
    expect(matchGuide("the new crew keeps failing")).toBeNull();
    expect(matchGuide("this flow is slow")).toBeNull();
    expect(matchGuide("")).toBeNull();
  });

  it("offers the walkthrough a request actually asks for", () => {
    expect(matchGuide("how do i make a crew")?.id).toBe("make-a-crew");
    expect(matchGuide("How do I make a *new flow*?")?.id).toBe("make-a-flow");
    expect(matchGuide("i want to start a run")?.id).toBe("first-run");
    expect(matchGuide("show me how to add a policy")?.id).toBe("set-a-policy");
  });

  it("matches every authored phrase back to the guide that authored it", () => {
    // Catches a phrase shadowed by an earlier guide in catalog order, which is
    // otherwise silent: the offer appears, just for the wrong walkthrough.
    for (const guide of GUIDES) {
      for (const ask of guide.asks) {
        expect({ ask, id: matchGuide(`how do i ${ask}`)?.id }).toEqual({
          ask,
          id: guide.id,
        });
      }
    }
  });
});

for (const guide of GUIDES) {
  describe(`guide: ${guide.id}`, () => {
    it("has unique step ids and at least one step", () => {
      expect(guide.steps.length).toBeGreaterThan(0);
      const ids = guide.steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("only names routes that survive a serialize/parse round trip", () => {
      for (const step of guide.steps) {
        if (!step.route) continue;
        expect(parseHashRoute(serializeRoute(step.route))).toEqual(step.route);
      }
    });

    it("only names anchors this repo actually contains", () => {
      for (const step of guide.steps) {
        if (!step.anchor) continue;
        expect(
          { step: step.id, anchor: step.anchor, registered: ANCHORS.has(step.anchor) },
        ).toEqual({ step: step.id, anchor: step.anchor, registered: true });
      }
    });

    it("keeps every step reachable: a route, an anchor, or both", () => {
      // A step with neither is a card floating over whatever happens to be on
      // screen, which is how the old tour lost steps without saying so.
      for (const step of guide.steps) {
        expect(!!(step.route || step.anchor)).toBe(true);
      }
    });

    it("is matchable: at least one verb-led phrase, lowercase and unpunctuated", () => {
      expect(guide.asks.length).toBeGreaterThan(0);
      for (const ask of guide.asks) {
        expect({ ask, normal: ask === ask.toLowerCase().trim() }).toEqual({ ask, normal: true });
        // The matcher flattens punctuation, so a phrase carrying any would
        // still work while reading as though the spelling mattered.
        expect({ ask, plain: /^[a-z0-9 ]+$/.test(ask) }).toEqual({ ask, plain: true });
      }
    });

    it("writes one line per field, with no em-dashes", () => {
      const copy = [guide.title, guide.summary, ...guide.steps.flatMap((s) => [s.title, s.body, s.todo ?? ""])];
      for (const line of copy) {
        expect(line.includes("\n")).toBe(false);
        expect(line.includes("—")).toBe(false);
        expect(line.includes("–")).toBe(false);
      }
    });
  });
}
