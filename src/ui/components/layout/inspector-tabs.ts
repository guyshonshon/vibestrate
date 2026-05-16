// Pure type module — no React imports — so non-UI tsconfig roots (and the
// node-environment Vitest tests) can import the tab union without pulling
// in JSX.

export type InspectorTabId =
  | "diff"
  | "artifact"
  | "validation"
  | "logs"
  | "notes"
  | "skills"
  | "approvals"
  | "metrics"
  | "agent-work"
  | "git"
  | "suggestions"
  | "terminal"
  | "replay";
