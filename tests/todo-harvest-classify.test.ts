import { describe, it, expect } from "vitest";
import {
  classifyTodoLine,
  normalizeTodoText,
  todoFingerprint,
  todoArea,
  TODO_GREP_QUERY,
} from "../src/project/todo-harvest.js";

const F = "src/core/thing.ts";

function classify(line: string) {
  return classifyTodoLine(F, 10, line);
}

describe("comment-only guard", () => {
  // The naive-grep failure this module exists to prevent: a marker that is not
  // in a comment must never become a Board card.
  it("rejects a marker inside a string literal", () => {
    expect(classify('const label = "TODO";')).toBeNull();
    expect(classify("const label = 'FIXME: not a comment';")).toBeNull();
    expect(classify("throw new Error(`XXX bad state here`);")).toBeNull();
  });

  it("rejects a marker that is part of an identifier", () => {
    expect(classify("const TODO_LIMIT = 5;")).toBeNull();
    expect(classify("import { FIXME_FLAG } from './x.js';")).toBeNull();
  });

  it("rejects a mid-line asterisk, which is multiplication not a comment", () => {
    expect(classify("const rate = base * TODO_RATE;")).toBeNull();
    expect(classify("const n = a * TODO;")).toBeNull();
  });

  it("rejects a marker with no comment opener at all", () => {
    expect(classify("TODO: this is bare prose in code")).toBeNull();
  });

  it("rejects a single-dash list item (only `--` opens a comment)", () => {
    expect(classify("- TODO: this is a yaml list entry")).toBeNull();
  });
});

describe("comment styles", () => {
  it("accepts a line comment", () => {
    expect(classify("// TODO: fix the retry loop")?.marker).toBe("TODO");
  });

  it("accepts a trailing comment after code", () => {
    const got = classify("await flush(); // FIXME: handle the timeout properly");
    expect(got?.marker).toBe("FIXME");
    expect(got?.text).toBe("handle the timeout properly");
  });

  it("accepts a hash comment", () => {
    expect(classify("# TODO: pin the base image version")?.marker).toBe("TODO");
  });

  it("accepts a javadoc continuation at line start", () => {
    const got = classify(" * XXX: this ordering is load bearing");
    expect(got?.marker).toBe("XXX");
    expect(got?.text).toBe("this ordering is load bearing");
  });

  it("accepts a block comment and strips the closer", () => {
    const got = classify("/* HACK: works around the upstream bug */");
    expect(got?.marker).toBe("HACK");
    expect(got?.text).toBe("works around the upstream bug");
  });

  it("accepts an html comment and strips the closer", () => {
    const got = classify("<!-- TODO: rewrite this section properly -->");
    expect(got?.text).toBe("rewrite this section properly");
  });

  it("accepts a sql double-dash comment", () => {
    expect(classify("-- TODO: add the covering index here")?.marker).toBe("TODO");
  });

  it("accepts every marker in the set", () => {
    for (const marker of ["TODO", "FIXME", "HACK", "XXX", "BUG"] as const) {
      expect(classify(`// ${marker}: something substantial here`)?.marker).toBe(marker);
    }
  });
});

describe("text extraction", () => {
  it("strips an owner annotation", () => {
    const got = classify("// TODO(guy): fix the broken parser");
    expect(got?.text).toBe("fix the broken parser");
  });

  it("strips a dash separator", () => {
    expect(classify("// TODO - fix the broken parser")?.text).toBe(
      "fix the broken parser",
    );
  });

  it("works with no separator at all", () => {
    expect(classify("// FIXME handle the timeout properly")?.text).toBe(
      "handle the timeout properly",
    );
  });

  it("collapses whitespace", () => {
    expect(classify("//   TODO:   fix    the   spacing   here")?.text).toBe(
      "fix the spacing here",
    );
  });

  it("builds a sentence-cased title distinct from the raw line", () => {
    const got = classify("// TODO: fix the retry loop");
    expect(got?.suggestedTitle).toBe("Fix the retry loop");
    expect(got?.raw).toBe("// TODO: fix the retry loop");
  });

  it("truncates a long title on a word boundary", () => {
    const long = `// TODO: ${"alpha ".repeat(40)}`;
    const got = classify(long);
    expect(got!.suggestedTitle.length).toBeLessThanOrEqual(100);
    expect(got!.suggestedTitle.endsWith(" ")).toBe(false);
    expect(got!.suggestedTitle.endsWith("alph")).toBe(false);
  });
});

describe("substance bar", () => {
  it("marks a bare marker low-signal", () => {
    expect(classify("// TODO")?.lowSignal).toBe(true);
  });

  it("marks a too-short body low-signal", () => {
    expect(classify("// TODO: fix")?.lowSignal).toBe(true);
  });

  it("marks a single long word low-signal", () => {
    expect(classify("// TODO: reimplementation")?.lowSignal).toBe(true);
  });

  it("accepts a body with enough substance", () => {
    expect(classify("// TODO: fix the retry loop")?.lowSignal).toBe(false);
  });

  it("still produces a valid title for a bare marker", () => {
    // The schema requires a non-empty title; a bare marker must round-trip
    // rather than throwing on write.
    expect(classify("// TODO")?.suggestedTitle).toBe("TODO");
  });
});

describe("priority derivation", () => {
  it("maps markers to priorities deterministically", () => {
    expect(classify("// FIXME: this is genuinely broken")?.suggestedPriority).toBe("high");
    expect(classify("// BUG: this is genuinely broken")?.suggestedPriority).toBe("high");
    expect(classify("// TODO: this is ordinary work")?.suggestedPriority).toBe("medium");
    expect(classify("// HACK: this is a workaround")?.suggestedPriority).toBe("low");
    expect(classify("// XXX: this is a workaround")?.suggestedPriority).toBe("low");
  });
});

describe("fingerprint", () => {
  it("survives line drift", () => {
    // The whole point: inserting code above a TODO must not orphan the card
    // promoted from it.
    const a = classifyTodoLine(F, 10, "// TODO: fix the retry loop");
    const b = classifyTodoLine(F, 940, "// TODO: fix the retry loop");
    expect(a!.fingerprint).toBe(b!.fingerprint);
    expect(a!.line).not.toBe(b!.line);
  });

  it("ignores casing and trailing punctuation", () => {
    const a = classifyTodoLine(F, 1, "// TODO: Fix The Retry Loop.");
    const b = classifyTodoLine(F, 1, "// TODO: fix the retry loop");
    expect(a!.fingerprint).toBe(b!.fingerprint);
  });

  it("separates identical text in different files", () => {
    const a = classifyTodoLine("src/a.ts", 1, "// TODO: handle the error case");
    const b = classifyTodoLine("src/b.ts", 1, "// TODO: handle the error case");
    expect(a!.fingerprint).not.toBe(b!.fingerprint);
  });

  it("separates different text in the same file", () => {
    const a = classifyTodoLine(F, 1, "// TODO: handle the error case");
    const b = classifyTodoLine(F, 1, "// TODO: handle the success case");
    expect(a!.fingerprint).not.toBe(b!.fingerprint);
  });

  it("normalizes as documented", () => {
    expect(normalizeTodoText("  Fix   The  Thing.  ")).toBe("fix the thing");
    expect(todoFingerprint("a.ts", "x")).toHaveLength(16);
  });
});

describe("area grouping", () => {
  it("uses the top-level directory", () => {
    expect(todoArea("src/core/thing.ts")).toBe("src");
    expect(todoArea("tests/x.test.ts")).toBe("tests");
  });

  it("labels repo-root files", () => {
    expect(todoArea("package.json")).toBe("(root)");
  });

  it("is carried onto the harvested item", () => {
    expect(classify("// TODO: fix the retry loop")?.area).toBe("src");
  });
});

describe("grep pre-filter portability", () => {
  // The regression guard on the silent -P -> -E fallback in
  // codebase-search-service. If someone "improves" this pattern with \b or a
  // lookahead, git builds without PCRE would quietly match a different set of
  // lines with no error surfaced. Keep it plain alternation.
  it("uses only POSIX-ERE-safe constructs", () => {
    expect(TODO_GREP_QUERY).toBe("(TODO|FIXME|HACK|XXX|BUG)");
    expect(TODO_GREP_QUERY).not.toMatch(/\\b|\\d|\\w|\\s|\(\?/);
  });
});
