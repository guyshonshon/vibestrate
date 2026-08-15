import { describe, it, expect } from "vitest";
import {
  GENERATED_WALKTHROUGH_STEPS_MAX,
  WALKTHROUGH_ANCHORS,
  WALKTHROUGH_ROUTE_KINDS,
  buildWalkthroughRequest,
  describeWalkthroughRefusal,
  parseGeneratedWalkthrough,
  validateWalkthrough,
} from "../src/ui/lib/guides/generated.js";
import { ANSWER_ROUTE_KINDS } from "../src/core/assist/answer-actions.js";

/**
 * The gate a model-authored walkthrough passes through.
 *
 * Everything in a generated step is untrusted input: it arrives from a provider
 * CLI whose context can include a merged agent diff, a dependency README or an
 * annotation somebody posted over HTTP. The thing this file exists to prove is
 * that a step is a DESTINATION and can never be anything else - it lands the
 * user on a real screen, rings a control that really exists, and refuses out
 * loud when it cannot do both. A walkthrough that points at nothing is worse
 * than the prose it replaced, and one that could press something is a chat
 * button that has turned into an unreviewed effect.
 *
 * Every case below is asserted on the REFUSAL, not on "did not crash": a
 * validator that returned `ok: true` with zero steps would satisfy a
 * no-exception test and still open an empty overlay.
 */

/** A step that passes, so each case below changes exactly one thing. */
const GOOD = {
  title: "Flows",
  body: "The playbook a run follows, step by step.",
  todo: "Open a builtin and read its steps.",
  route: { kind: "flows" },
  anchor: "nav-flows",
} as const;

const one = (step: unknown) => validateWalkthrough({ steps: [step] });

describe("generated walkthrough: invented destinations", () => {
  it("refuses a route kind this app does not have", () => {
    expect(one({ ...GOOD, route: { kind: "billing" }, anchor: null })).toEqual({
      ok: false,
      reason: "no-valid-steps",
      dropped: 1,
    });
  });

  it("refuses a path string where a route belongs", () => {
    expect(one({ ...GOOD, route: "/settings/billing", anchor: null }).ok).toBe(false);
    expect(one({ ...GOOD, route: ["flows"], anchor: null }).ok).toBe(false);
  });

  it("refuses an invented anchor", () => {
    expect(one({ ...GOOD, anchor: "nav-billing" })).toEqual({
      ok: false,
      reason: "no-valid-steps",
      dropped: 1,
    });
  });

  it("refuses an anchor inherited from Object.prototype", () => {
    // `"toString" in ANCHOR_PAGES` is true, and indexing it returns a FUNCTION.
    // An `in` check here would take the name and hand the overlay that function
    // as the step's destination.
    //
    // The route is dropped on purpose: with one present, the page-mismatch rule
    // catches these by accident, and a test that passes for the wrong reason
    // would still pass with the anchor check removed.
    for (const anchor of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect({ anchor, ok: one({ ...GOOD, route: null, anchor }).ok }).toEqual({
        anchor,
        ok: false,
      });
    }
  });

  it("refuses an anchor that does not live on the page the step opens", () => {
    // The one thing a walkthrough must never do: navigate somewhere the ring
    // cannot possibly be.
    expect(one({ ...GOOD, route: { kind: "flows" }, anchor: "flow-editor-save" })).toEqual({
      ok: false,
      reason: "no-valid-steps",
      dropped: 1,
    });
  });

  it("refuses a step that is neither a place nor a control", () => {
    expect(one({ title: "Somewhere", body: "Nowhere in particular." }).ok).toBe(false);
  });
});

describe("generated walkthrough: the closed route vocabulary", () => {
  it("accepts every kind it offers the model, and only those", () => {
    // Non-vacuous both ways: an offer the gate then drops advertises a dead
    // destination, and a kind that survives without being offered is a hole.
    const offered = new Set<string>(WALKTHROUGH_ROUTE_KINDS);
    for (const kind of ANSWER_ROUTE_KINDS) {
      const survived = one({ ...GOOD, route: { kind }, anchor: null }).ok;
      expect({ kind, survived }).toEqual({ kind, survived: offered.has(kind) });
    }
  });

  it("refuses a route carrying an id nobody vouched for", () => {
    // This path passes no server-built id lists at all, so every id-bearing
    // destination is a guess. A wrong deep link is worse than a right page.
    for (const route of [
      { kind: "task", taskId: "task-invented" },
      { kind: "run", runId: "run-invented" },
      { kind: "control", runId: "run-invented" },
      { kind: "proposal", proposalId: "p-invented" },
      { kind: "flow", flowId: "flow-invented" },
      { kind: "flow-editor", flowId: "flow-invented" },
      { kind: "crew-editor", crewId: "crew-invented" },
    ]) {
      expect({ route, ok: one({ ...GOOD, route, anchor: null }).ok }).toEqual({ route, ok: false });
    }
  });

  it("refuses a parameterless route that arrived carrying parameters", () => {
    expect(one({ ...GOOD, route: { kind: "flows", flowId: "x" } }).ok).toBe(false);
    expect(one({ ...GOOD, route: { kind: "policies", tier: "block" }, anchor: null }).ok).toBe(
      false,
    );
  });
});

describe("generated walkthrough: a step can only ever navigate", () => {
  it("builds a navigation step and nothing else from a step that asked to act", () => {
    // THE INVARIANT. A step is built key by key from a whitelist, never copied,
    // so a model that thinks it is ordering a click gets a card that stands the
    // user in front of the control and says what it is for. There is no third
    // kind of step, and this is what makes that structural rather than stated:
    // the extra keys are not on the value the overlay renders.
    const res = validateWalkthrough({
      steps: [
        {
          ...GOOD,
          kind: "write",
          action: "click",
          onClick: "submit()",
          value: "my-new-flow",
          run: { flowId: "express" },
          write: { path: ".vibestrate/config.json" },
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.walkthrough.steps).toEqual([
      {
        id: "step-1",
        title: GOOD.title,
        body: GOOD.body,
        todo: GOOD.todo,
        route: { kind: "flows" },
        anchor: "nav-flows",
      },
    ]);
    expect(Object.keys(res.walkthrough.steps[0]!).sort()).toEqual([
      "anchor",
      "body",
      "id",
      "route",
      "title",
      "todo",
    ]);
  });

  it("names no anchor outside the closed vocabulary", () => {
    expect(WALKTHROUGH_ANCHORS.length).toBeGreaterThan(0);
    for (const anchor of WALKTHROUGH_ANCHORS) {
      expect({ anchor, ok: one({ ...GOOD, route: null, anchor }).ok }).toEqual({ anchor, ok: true });
    }
  });
});

describe("generated walkthrough: shape and volume", () => {
  it("refuses an empty itinerary rather than opening one", () => {
    expect(validateWalkthrough({ steps: [] })).toEqual({
      ok: false,
      reason: "no-steps",
      dropped: 0,
    });
    expect(validateWalkthrough({ title: "Show me how" })).toEqual({
      ok: false,
      reason: "no-steps",
      dropped: 0,
    });
    expect(validateWalkthrough({ steps: "flows" })).toEqual({
      ok: false,
      reason: "no-steps",
      dropped: 0,
    });
  });

  it("refuses anything that is not an object", () => {
    for (const raw of [null, undefined, 42, "steps", [GOOD], true]) {
      expect({ raw, res: validateWalkthrough(raw) }).toEqual({
        raw,
        res: { ok: false, reason: "not-an-object", dropped: 0 },
      });
    }
  });

  it("caps a 500-step itinerary and counts every step it threw away", () => {
    const res = validateWalkthrough({ steps: Array.from({ length: 500 }, () => GOOD) });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.walkthrough.steps.length).toBe(GENERATED_WALKTHROUGH_STEPS_MAX);
    // Honest rather than flattering: the ones past the candidate bound were
    // refused too, and the count says so.
    expect(res.dropped).toBe(492);
    const ids = res.walkthrough.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the good steps out of a mostly hostile batch", () => {
    // Per-item isolation: one corrupt entry costs that entry, never the batch.
    const res = validateWalkthrough({
      steps: [
        { ...GOOD, anchor: "nav-invented" },
        GOOD,
        null,
        "flows",
        { ...GOOD, route: { kind: "billing" } },
        { ...GOOD, title: "New flow", route: { kind: "flow-editor" }, anchor: "flow-editor-identity" },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.walkthrough.steps.map((s) => s.title)).toEqual(["Flows", "New flow"]);
    expect(res.dropped).toBe(4);
  });
});

describe("generated walkthrough: copy is text, not markup", () => {
  it("refuses a line that could read as markup or carry control characters", () => {
    expect(one({ ...GOOD, title: "<script>alert(1)</script>" }).ok).toBe(false);
    expect(one({ ...GOOD, body: "Open flows then save" }).ok).toBe(false);
    expect(one({ ...GOOD, title: "x".repeat(61) }).ok).toBe(false);
    expect(one({ ...GOOD, body: 42 }).ok).toBe(false);
  });

  it("costs a bad todo the line and not the step", () => {
    const res = one({ ...GOOD, todo: "<b>press it</b>" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.walkthrough.steps[0]).not.toHaveProperty("todo");
  });

  it("writes house copy: one line, no em-dashes", () => {
    const res = one({ ...GOOD, title: "Flows — the\nplaybook" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.walkthrough.steps[0]?.title).toBe("Flows - the playbook");
  });

  it("falls back on an unusable title rather than losing a good itinerary", () => {
    const res = validateWalkthrough({ title: "<h1>hi</h1>", steps: [GOOD] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.walkthrough.title).toBe("Show me how");
  });
});

describe("generated walkthrough: text in, walkthrough or refusal out", () => {
  it("refuses prose with a stated reason", () => {
    const res = parseGeneratedWalkthrough("Sure. Open Flows, then press New flow.");
    expect(res).toEqual({ ok: false, reason: "no-json", dropped: 0 });
    expect(describeWalkthroughRefusal("no-json")).toBe(
      "The answer came back as prose, so there is no sequence to walk.",
    );
  });

  it("states every refusal in a sentence a reader can act on", () => {
    for (const reason of ["no-json", "not-an-object", "no-steps", "no-valid-steps"] as const) {
      const said = describeWalkthroughRefusal(reason);
      expect({ reason, ends: said.endsWith("."), long: said.length > 20 }).toEqual({
        reason,
        ends: true,
        long: true,
      });
    }
  });

  it("survives junk nested past any sane depth", () => {
    const deep = `${"{\"a\":".repeat(10_000)}1${"}".repeat(10_000)}`;
    expect(parseGeneratedWalkthrough(deep).ok).toBe(false);
    expect(parseGeneratedWalkthrough("{".repeat(50_000)).ok).toBe(false);
    expect(parseGeneratedWalkthrough(`{"steps":[{"a":${JSON.stringify(deep)}}]}`).ok).toBe(false);
  });

  it("never throws, whatever the answer text was", () => {
    for (const text of [
      "",
      "{",
      "}{",
      '{"steps":',
      '{"steps":[{"title":"a","body":"b","route":{"kind":"flows"}}]} trailing }{',
      "```json\n{}\n```",
      '{"title":"a \\" }","steps":[]}',
    ]) {
      expect(() => parseGeneratedWalkthrough(text)).not.toThrow();
    }
  });

  it("reads the walkthrough out of a fenced answer", () => {
    const res = parseGeneratedWalkthrough(
      'Here you go:\n```json\n{"title":"Make a flow","summary":"The playbook a run follows.","steps":[' +
        '{"title":"Flows","body":"Every flow this project can run.","todo":"Read a builtin first.","route":{"kind":"flows"},"anchor":"nav-flows"},' +
        '{"title":"New flow","body":"A blank flow needs an id and a label.","todo":"Name it, then add the steps.","route":{"kind":"flow-editor"},"anchor":"flow-editor-identity"}]}\n```',
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.walkthrough.title).toBe("Make a flow");
    expect(res.walkthrough.generated).toBe(true);
    // Never matchable: the authored catalog is what matchGuide reads.
    expect(res.walkthrough.asks).toEqual([]);
    expect(res.walkthrough.steps.map((s) => s.route)).toEqual([
      { kind: "flows" },
      { kind: "flow-editor", flowId: null },
    ]);
  });
});

describe("the walkthrough request", () => {
  it("offers only vocabulary the gate will accept back", () => {
    const prompt = buildWalkthroughRequest({ ask: "add a review step to a flow" });
    for (const anchor of WALKTHROUGH_ANCHORS) expect(prompt).toContain(anchor);
    for (const kind of WALKTHROUGH_ROUTE_KINDS) expect(prompt).toContain(kind);
    // Advertising a destination that is guaranteed to be dropped is how a
    // walkthrough ends up refused for reasons the model was never told.
    expect(prompt).not.toMatch(/\bproposal\b/);
  });

  it("says a step cannot act, so the model does not write one that tries", () => {
    const prompt = buildWalkthroughRequest({ ask: "make a flow" });
    expect(prompt).toContain("It cannot press, type, save or start anything");
    expect(prompt).toContain("Offering to help fill a form is a sentence, not a step.");
  });

  it("stays inside the size the consult endpoint accepts", () => {
    const prompt = buildWalkthroughRequest({
      ask: "x".repeat(50_000),
      answer: "y".repeat(50_000),
    });
    expect(prompt.length).toBeLessThanOrEqual(3_900);
  });

  it("ends on the output contract, whatever it is carrying", () => {
    // The one line that decides whether the feature works at all: with the
    // contract stated only at the top, a live provider answered in prose and
    // every walkthrough was refused. It has to survive the size cap, so it is
    // reserved out of the budget rather than trimmed off the end.
    const ending = "An answer that does not start with { is discarded.";
    for (const input of [
      { ask: "make a flow" },
      { ask: "make a flow", answer: "Open Flows, then New flow." },
      { ask: "x".repeat(50_000), answer: "y".repeat(50_000) },
      { ask: "", answer: "z".repeat(3_800) },
    ]) {
      expect({ ask: input.ask.length, ends: buildWalkthroughRequest(input).endsWith(ending) }).toEqual(
        { ask: input.ask.length, ends: true },
      );
    }
  });
});
