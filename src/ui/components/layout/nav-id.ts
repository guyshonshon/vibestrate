/**
 * Primary navigation slot identifier - drives which sidebar item renders as
 * active. Kept in its own module so nothing has to import the Sidebar just for
 * the type.
 */
export type NavId =
  | "dashboard"
  | "home"
  | "runs"
  | "board"
  | "queue"
  | "workspace"
  | "proposals"
  | "settings"
  | "policies"
  | "setup"
  | "project"
  | "codebase"
  | "source"
  | "git"
  | "git-tree"
  | "merge"
  | "ledger"
  | "flow"
  | "flows"
  | "metrics"
  | "crew"
  | "providers"
  | "supervisors"
  | "profiles"
  | "config"
  | "consult";
