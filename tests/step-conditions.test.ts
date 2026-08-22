import { describe, it, expect } from "vitest";
import {
  evaluateStepCondition,
  STEP_CONDITIONS,
  type DiffFileFacts,
  type StepCondition,
} from "../src/core/run/step-conditions.js";

const f = (path: string, ...addedLines: string[]): DiffFileFacts => ({ path, addedLines });

describe("evaluateStepCondition - uncertainty NEVER skips", () => {
  it("does not skip on an empty change set, which is indistinguishable from an unreadable diff", () => {
    for (const c of STEP_CONDITIONS) {
      const d = evaluateStepCondition(c, []);
      expect(d.skip, c).toBe(false);
    }
  });

  it("does not skip on a condition it does not know", () => {
    const d = evaluateStepCondition("nonsense" as StepCondition, [f("a.ts", "x")]);
    expect(d.skip).toBe(false);
  });
});

describe("no_auth_surface", () => {
  it("keeps the review when a path smells of auth", () => {
    expect(evaluateStepCondition("no_auth_surface", [f("src/middleware/session.ts", "const a = 1")]).skip).toBe(false);
  });

  it("keeps the review when an added line touches identity, whatever the file is called", () => {
    expect(
      evaluateStepCondition("no_auth_surface", [f("src/widget.ts", "if (booking.owner !== req.user) return res.status(403).end();")]).skip,
    ).toBe(false);
  });

  it("skips only when nothing in the change is about who may act", () => {
    const d = evaluateStepCondition("no_auth_surface", [
      f("src/format.ts", "export const pad = (n) => String(n).padStart(2, '0');"),
    ]);
    expect(d.skip).toBe(true);
    if (d.skip) expect(d.evidence.reason).toContain("authentication or authorization");
  });
});

describe("no_untrusted_input", () => {
  it("keeps the review when caller data reaches a sink", () => {
    expect(evaluateStepCondition("no_untrusted_input", [f("src/x.ts", "el.innerHTML = `<td>${row.user}</td>`;")]).skip).toBe(false);
    expect(evaluateStepCondition("no_untrusted_input", [f("src/y.ts", "const { deskId } = req.body;")]).skip).toBe(false);
  });

  it("skips a pure internal refactor", () => {
    expect(evaluateStepCondition("no_untrusted_input", [f("src/math.ts", "const sum = (a, b) => a + b;")]).skip).toBe(true);
  });
});

describe("no_schema_change / no_ui_change / no_dependency_change", () => {
  it("detects a migration by content even in an oddly named file", () => {
    expect(evaluateStepCondition("no_schema_change", [f("src/setup.ts", "db.exec('ALTER TABLE bookings ADD COLUMN team_id')")]).skip).toBe(false);
  });

  it("detects a rendered surface by extension", () => {
    expect(evaluateStepCondition("no_ui_change", [f("public/index.html", "<p>hi</p>")]).skip).toBe(false);
  });

  it("detects a dependency change by path", () => {
    expect(evaluateStepCondition("no_dependency_change", [f("package.json", '"express": "^4"')]).skip).toBe(false);
  });

  it("skips each when the change is unrelated", () => {
    const unrelated = [f("docs/notes.md", "just prose")];
    expect(evaluateStepCondition("no_schema_change", unrelated).skip).toBe(true);
    expect(evaluateStepCondition("no_dependency_change", unrelated).skip).toBe(true);
  });
});

describe("matchers over-detect on purpose", () => {
  it("catches the real stored XSS this project measured, on the injection lens", () => {
    const real = [f("public/app.js", "tr.innerHTML = `<td>${row.user}</td>`;")];
    expect(evaluateStepCondition("no_untrusted_input", real).skip).toBe(false);
  });

  it("withdraws the lens that genuinely has nothing to check", () => {
    // Rendering a value unescaped is an INJECTION defect, not an authorization
    // one: nothing here decides who may act. The authz lens correctly stands
    // down, which is the entire point - a lens per risk, not a lens per fear.
    const real = [f("public/app.js", "tr.innerHTML = `<td>${row.user}</td>`;")];
    expect(evaluateStepCondition("no_auth_surface", real).skip).toBe(true);
  });

  it("but keeps authz the moment the same file decides who may act", () => {
    const guarded = [f("public/app.js", "if (booking.owner !== currentUser) hideCancel();")];
    expect(evaluateStepCondition("no_auth_surface", guarded).skip).toBe(false);
  });
});
