import { describe, it, expect } from "vitest";
import {
  initTaskForm,
  reduceTaskForm,
  validateTaskForm,
} from "../src/shell/ink/roadmap/form.js";

describe("validateTaskForm", () => {
  it("requires a non-empty title", () => {
    const s = initTaskForm("create", null);
    const r = validateTaskForm(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.title).toMatch(/required/i);
  });

  it("normalizes empty effort to null and empty profileOverride to null", () => {
    let s = initTaskForm("create", null, { title: "x" });
    s = reduceTaskForm(s, { type: "field", field: "profileOverride", value: "  " });
    const r = validateTaskForm(s);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.effort).toBeNull();
      expect(r.value.profileOverride).toBeNull();
    }
  });

  it("preserves valid effort + provider overrides", () => {
    let s = initTaskForm("create", null, { title: "x" });
    s = reduceTaskForm(s, { type: "field", field: "effort", value: "high" });
    s = reduceTaskForm(s, { type: "field", field: "profileOverride", value: "codex" });
    s = reduceTaskForm(s, { type: "field", field: "readOnly", value: true });
    const r = validateTaskForm(s);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.effort).toBe("high");
      expect(r.value.profileOverride).toBe("codex");
      expect(r.value.readOnly).toBe(true);
    }
  });
});

describe("reduceTaskForm", () => {
  it("focus.cycle wraps in both directions", () => {
    let s = initTaskForm("create", null);
    expect(s.focused).toBe("title");
    s = reduceTaskForm(s, { type: "focus.cycle", direction: -1 });
    expect(s.focused).toBe("readOnly");
    s = reduceTaskForm(s, { type: "focus.cycle", direction: 1 });
    expect(s.focused).toBe("title");
  });

  it("typing into a field clears that field's error", () => {
    let s = initTaskForm("create", null);
    s = reduceTaskForm(s, {
      type: "errors",
      value: { title: "Title is required." },
    });
    expect(s.errors.title).toBeDefined();
    s = reduceTaskForm(s, { type: "field", field: "title", value: "ok" });
    expect(s.errors.title).toBeUndefined();
  });

  it("invalid priority values are ignored", () => {
    let s = initTaskForm("create", null);
    s = reduceTaskForm(s, { type: "field", field: "priority", value: "bogus" });
    expect(s.priority).toBe("medium");
  });

  it("seeds an edit form with the existing task's values", () => {
    const s = initTaskForm("edit", "T-1", {
      title: "abc",
      description: "hi",
      priority: "high",
      effort: "low",
      profileOverride: "codex",
      readOnly: true,
    });
    expect(s.mode).toBe("edit");
    expect(s.existingId).toBe("T-1");
    expect(s.title).toBe("abc");
    expect(s.priority).toBe("high");
    expect(s.effort).toBe("low");
    expect(s.profileOverride).toBe("codex");
    expect(s.readOnly).toBe(true);
  });
});
