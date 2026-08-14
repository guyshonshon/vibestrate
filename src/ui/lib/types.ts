// The dashboard's shared types, by domain.
//
// One 2,344-line file held nine unrelated areas, so a change to notifications
// landed in the same file as the git-merge types. The sections it already
// carried are now modules; this barrel re-exports them so all 105 importers
// keep working unchanged.
//
// Types only - nothing here emits runtime code.

export type * from "./types/runs.js";
export type * from "./types/crews.js";
export type * from "./types/config.js";
export type * from "./types/proposals.js";
export type * from "./types/notifications.js";
export type * from "./types/codebase.js";
export type * from "./types/todos.js";
export type * from "./types/git.js";
export type * from "./types/suggestions.js";
export type * from "./types/policies.js";
