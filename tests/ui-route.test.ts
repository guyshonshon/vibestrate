import { describe, it, expect } from "vitest";
import { parseHashRoute, serializeRoute, type Route } from "../src/ui/app/route.js";

describe("parseHashRoute", () => {
  it("defaults to mission-control for empty / unknown hashes", () => {
    expect(parseHashRoute("").kind).toBe("mission");
    expect(parseHashRoute("#/").kind).toBe("mission");
    expect(parseHashRoute("#/totally-unknown").kind).toBe("mission");
    expect(parseHashRoute("#/mission").kind).toBe("mission");
  });

  it("parses /runs (the legacy runs list) as kind=runs", () => {
    expect(parseHashRoute("#/runs").kind).toBe("runs");
  });

  it("parses /runs/<id> with no tab or replay focus", () => {
    const r = parseHashRoute("#/runs/run-abc");
    expect(r.kind).toBe("run");
    if (r.kind === "run") {
      expect(r.runId).toBe("run-abc");
      expect(r.tab).toBeNull();
      expect(r.replayFocus).toBeNull();
    }
  });

  it("accepts ?tab=replay only when the value is a known inspector tab", () => {
    const ok = parseHashRoute("#/runs/run-1?tab=replay");
    const bad = parseHashRoute("#/runs/run-1?tab=fictional");
    if (ok.kind === "run") expect(ok.tab).toBe("replay");
    else throw new Error("expected run route");
    if (bad.kind === "run") expect(bad.tab).toBeNull();
    else throw new Error("expected run route");
  });

  it("parses ?replayEvent=<n> as an event focus", () => {
    const r = parseHashRoute("#/runs/run-1?tab=replay&replayEvent=42");
    if (r.kind !== "run") throw new Error("expected run route");
    expect(r.replayFocus).toEqual({ kind: "event", eventIndex: 42 });
  });

  it("rejects non-integer / negative replayEvent values", () => {
    expect(
      (parseHashRoute("#/runs/run-1?replayEvent=-3") as Route & {
        kind: "run";
      }).replayFocus,
    ).toBeNull();
    expect(
      (parseHashRoute("#/runs/run-1?replayEvent=1.5") as Route & {
        kind: "run";
      }).replayFocus,
    ).toBeNull();
    expect(
      (parseHashRoute("#/runs/run-1?replayEvent=foo") as Route & {
        kind: "run";
      }).replayFocus,
    ).toBeNull();
  });

  it("parses ?replayPhase=<key> only for known phase keys", () => {
    const ok = parseHashRoute("#/runs/run-1?replayPhase=suggestions");
    const bad = parseHashRoute("#/runs/run-1?replayPhase=invented");
    if (ok.kind !== "run") throw new Error("expected run route");
    if (bad.kind !== "run") throw new Error("expected run route");
    expect(ok.replayFocus).toEqual({ kind: "phase", phase: "suggestions" });
    expect(bad.replayFocus).toBeNull();
  });

  it("parses ?replayMatch=<kind>:<id> only for known cross-link kinds", () => {
    const sugg = parseHashRoute("#/runs/run-1?replayMatch=suggestion:sug-7");
    const appr = parseHashRoute("#/runs/run-1?replayMatch=approval:appr-12");
    const notif = parseHashRoute("#/runs/run-1?replayMatch=notification:n-3");
    const bogus = parseHashRoute("#/runs/run-1?replayMatch=other:x");
    const noId = parseHashRoute("#/runs/run-1?replayMatch=suggestion:");
    if (sugg.kind !== "run" || appr.kind !== "run" || notif.kind !== "run") {
      throw new Error("expected run routes");
    }
    expect(sugg.replayFocus).toEqual({
      kind: "match",
      match: { kind: "suggestion", id: "sug-7" },
    });
    expect(appr.replayFocus).toEqual({
      kind: "match",
      match: { kind: "approval", id: "appr-12" },
    });
    expect(notif.replayFocus).toEqual({
      kind: "match",
      match: { kind: "notification", id: "n-3" },
    });
    expect((bogus as Route & { kind: "run" }).replayFocus).toBeNull();
    expect((noId as Route & { kind: "run" }).replayFocus).toBeNull();
  });

  it("prefers replayEvent over replayPhase over replayMatch when all are set", () => {
    const r = parseHashRoute(
      "#/runs/run-1?replayEvent=5&replayPhase=suggestions&replayMatch=suggestion:abc",
    );
    if (r.kind !== "run") throw new Error("expected run route");
    expect(r.replayFocus).toEqual({ kind: "event", eventIndex: 5 });
  });
});

describe("serializeRoute", () => {
  it("emits the bare # for mission control (the default landing route)", () => {
    expect(serializeRoute({ kind: "mission" })).toBe("#/");
  });

  it("emits #/runs for the legacy runs list", () => {
    expect(serializeRoute({ kind: "runs" })).toBe("#/runs");
  });

  it("omits the query string when no tab / focus is set", () => {
    expect(
      serializeRoute({
        kind: "run",
        runId: "run-x",
        tab: null,
        replayFocus: null,
      }),
    ).toBe("#/runs/run-x");
  });

  it("emits ?tab=<tab> when only a tab is set", () => {
    expect(
      serializeRoute({
        kind: "run",
        runId: "run-x",
        tab: "replay",
      }),
    ).toBe("#/runs/run-x?tab=replay");
  });

  it("emits the right query key per replay-focus variant", () => {
    expect(
      serializeRoute({
        kind: "run",
        runId: "r",
        tab: "replay",
        replayFocus: { kind: "event", eventIndex: 9 },
      }),
    ).toBe("#/runs/r?tab=replay&replayEvent=9");
    expect(
      serializeRoute({
        kind: "run",
        runId: "r",
        tab: "replay",
        replayFocus: { kind: "phase", phase: "verifying" },
      }),
    ).toBe("#/runs/r?tab=replay&replayPhase=verifying");
    expect(
      serializeRoute({
        kind: "run",
        runId: "r",
        tab: "replay",
        replayFocus: {
          kind: "match",
          match: { kind: "approval", id: "appr-1" },
        },
      }),
    ).toBe("#/runs/r?tab=replay&replayMatch=approval%3Aappr-1");
  });
});

describe("round-trip", () => {
  it("parseHashRoute(serializeRoute(r)) recovers the run route, tab, and focus", () => {
    const cases: Route[] = [
      { kind: "run", runId: "r1", tab: null, replayFocus: null },
      { kind: "run", runId: "r2", tab: "replay", replayFocus: null },
      {
        kind: "run",
        runId: "r3",
        tab: "replay",
        replayFocus: { kind: "event", eventIndex: 0 },
      },
      {
        kind: "run",
        runId: "r4",
        tab: "replay",
        replayFocus: { kind: "phase", phase: "approvals" },
      },
      {
        kind: "run",
        runId: "r5",
        tab: "replay",
        replayFocus: {
          kind: "match",
          match: { kind: "notification", id: "notif-42" },
        },
      },
    ];
    for (const r of cases) {
      const parsed = parseHashRoute(serializeRoute(r));
      expect(parsed).toEqual({
        kind: "run",
        runId: (r as { runId: string }).runId,
        tab: (r as { tab: unknown }).tab ?? null,
        replayFocus: (r as { replayFocus: unknown }).replayFocus ?? null,
      });
    }
  });

  it("round-trips the simple kind-only routes (incl. guides)", () => {
    const kinds: Route[] = [
      { kind: "guides" },
      { kind: "metrics" },
      { kind: "agents" },
      { kind: "providers" },
    ];
    for (const r of kinds) {
      expect(parseHashRoute(serializeRoute(r))).toEqual(r);
    }
    expect(parseHashRoute("#/guides").kind).toBe("guides");
    expect(serializeRoute({ kind: "guides" })).toBe("#/guides");
  });
});
