/**
 * Primary navigation slot identifier — drives which TopBar tab renders
 * as active. Used by AppShell + TopBar; kept in its own module so we
 * don't have to drag a heavier component (or the deleted Sidebar) along
 * just for the type.
 */
export type NavId =
  | "home"
  | "runs"
  | "board"
  | "queue"
  | "proposals"
  | "settings"
  | "project"
  | "codebase"
  | "git"
  | "flow"
  | "flows"
  | "metrics"
  | "crew"
  | "profiles";
