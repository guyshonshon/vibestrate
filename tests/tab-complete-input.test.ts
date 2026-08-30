import { describe, it, expect } from "vitest";
import {
  completeStep,
  longestCommonPrefix,
  matchesFor,
  type CompletionCandidate,
} from "../src/cli/ui/tab-complete-input.js";
import { resolveFingerprint } from "../src/cli/commands/todos.js";

const cands = (...values: string[]): CompletionCandidate[] =>
  values.map((value) => ({ value }));

describe("longestCommonPrefix", () => {
  it("is empty for an empty list", () => {
    expect(longestCommonPrefix([])).toBe("");
  });

  it("is the value itself for one entry", () => {
    expect(longestCommonPrefix(["abc"])).toBe("abc");
  });

  it("finds the shared prefix", () => {
    expect(longestCommonPrefix(["abcd", "abce", "abcf"])).toBe("abc");
  });

  it("is empty when nothing is shared", () => {
    expect(longestCommonPrefix(["abc", "xyz"])).toBe("");
  });
});

describe("matchesFor", () => {
  it("matches on prefix, case-insensitively", () => {
    expect(matchesFor("AB", cands("abcd", "abce", "zz"))).toEqual(["abcd", "abce"]);
  });

  it("returns everything for an empty stem", () => {
    expect(matchesFor("", cands("a", "b"))).toEqual(["a", "b"]);
  });
});

describe("completeStep", () => {
  it("completes straight to a single match", () => {
    const step = completeStep({ stem: "ab", tabCount: 0 }, cands("abcd", "zzzz"));
    expect(step.text).toBe("abcd");
    expect(step.cycling).toBe(false);
    expect(step.next).toEqual({ stem: "abcd", tabCount: 0 });
  });

  it("extends to the longest common prefix first", () => {
    const step = completeStep({ stem: "a", tabCount: 0 }, cands("abcd", "abce"));
    expect(step.text).toBe("abc");
    expect(step.cycling).toBe(false);
    expect(step.next.stem).toBe("abc");
  });

  it("cycles once there is nothing left to extend", () => {
    const candidates = cands("abcd", "abce", "abcf");
    let state = { stem: "abc", tabCount: 0 };

    const first = completeStep(state, candidates);
    expect(first.text).toBe("abcd");
    expect(first.cycling).toBe(true);
    state = first.next;

    const second = completeStep(state, candidates);
    expect(second.text).toBe("abce");
    state = second.next;

    const third = completeStep(state, candidates);
    expect(third.text).toBe("abcf");
    state = third.next;

    // Wraps around rather than sticking on the last one.
    expect(completeStep(state, candidates).text).toBe("abcd");
  });

  it("preserves the stem while cycling so the match set stays stable", () => {
    const candidates = cands("abcd", "abce");
    const first = completeStep({ stem: "abc", tabCount: 0 }, candidates);
    expect(first.next.stem).toBe("abc");
    expect(completeStep(first.next, candidates).matches).toEqual(["abcd", "abce"]);
  });

  it("leaves the line alone when nothing matches", () => {
    const step = completeStep({ stem: "qq", tabCount: 0 }, cands("abcd"));
    expect(step.text).toBe("qq");
    expect(step.matches).toEqual([]);
  });

  it("offers everything from an empty line", () => {
    // Pressing TAB with nothing typed is how you discover the options.
    const step = completeStep({ stem: "", tabCount: 0 }, cands("aaa", "bbb"));
    expect(step.matches).toEqual(["aaa", "bbb"]);
  });
});

describe("resolveFingerprint", () => {
  const all = ["aaaa1111bbbb2222", "aaaa9999cccc3333", "ffff0000dddd4444"];

  it("resolves an unambiguous prefix", () => {
    const r = resolveFingerprint("ffff", all);
    expect(r).toEqual({ ok: true, fingerprint: "ffff0000dddd4444" });
  });

  it("resolves an exact full fingerprint", () => {
    const r = resolveFingerprint("aaaa1111bbbb2222", all);
    expect(r).toEqual({ ok: true, fingerprint: "aaaa1111bbbb2222" });
  });

  // Fail closed: promoting the wrong card is invisible until much later, so an
  // ambiguous prefix must never be silently resolved to the first match.
  it("refuses an ambiguous prefix instead of guessing", () => {
    const r = resolveFingerprint("aaaa", all);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected ambiguity");
    expect(r.error).toContain("ambiguous");
  });

  it("reports an unknown prefix", () => {
    const r = resolveFingerprint("zzzz", all);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.error).toContain("No TODO matches");
  });
});
