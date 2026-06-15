import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { HeaderBar } from "../src/shell/ink/components/HeaderBar.js";
import type { StatusModel } from "../src/shell/ink/status-model.js";

const base: StatusModel = {
  project: "vibestrate",
  branch: "main",
  worktree: false,
  mode: "write",
  activity: "idle",
  busy: false,
  crew: "default",
  flow: "default",
  runningTask: null,
  budget: null,
  pendingApprovals: 0,
};

function frame(model: StatusModel): string {
  const { lastFrame } = render(
    React.createElement(HeaderBar, { model, page: "runs" }),
  );
  return lastFrame() ?? "";
}

describe("HeaderBar", () => {
  it("renders the brand and the budget chip with the spend ratio", () => {
    const out = frame({ ...base, budget: { label: "$2.30 / $10.00", state: "ok" } });
    expect(out).toContain("vibestrate");
    expect(out).toContain("budget");
    expect(out).toContain("$2.30 / $10.00");
  });

  it("omits the budget chip entirely when there's nothing to show", () => {
    expect(frame(base)).not.toContain("budget");
  });

  it("shows a pending-approvals chip only when approvals are waiting", () => {
    expect(frame({ ...base, pendingApprovals: 0 })).not.toContain("approval");
    const one = frame({ ...base, pendingApprovals: 1 });
    expect(one).toContain("1 approval");
    expect(one).not.toContain("approvals"); // singular
    expect(frame({ ...base, pendingApprovals: 2 })).toContain("2 approvals");
  });
});
