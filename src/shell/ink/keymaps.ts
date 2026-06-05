// Per-page contextual keymap groups for the footer. Each function
// returns the *page-specific* groups; the App glues `PAGES_GROUP`
// on at the end so the global "1-9/0 switch · ? help · q quit"
// affordances are always visible.

import type { HintGroup } from "./components/Footer.js";
import type { PageId } from "./ui-state.js";

export function keymapForPage(page: PageId): HintGroup[] {
  switch (page) {
    case "dashboard":
      return [];
    case "profiles":
      return [
        { name: "Move", hints: [{ key: "↑↓", label: "profile" }] },
        { name: "Edit", hints: [
          { key: "e/E", label: "effort -/+" },
          { key: "m/M", label: "model" },
        ]},
        { name: "Actions", hints: [
          { key: "n", label: "new" },
          { key: "d", label: "duplicate" },
          { key: "x", label: "delete" },
        ]},
      ];
    case "flows":
      return [
        { name: "Move", hints: [{ key: "↑↓", label: "flow" }] },
        { name: "Actions", hints: [
          { key: "f", label: "fork builtin → project" },
          { key: "h", label: "hub browse/install" },
        ]},
      ];
    case "runs":
      return [
        { name: "Move", hints: [
          { key: "↑↓", label: "run" },
          { key: "tab", label: "section" },
        ]},
        { name: "Filter", hints: [{ key: "/", label: "events" }]},
        { name: "Actions", hints: [
          { key: "p", label: "pause" },
          { key: "r", label: "resume" },
          { key: "a", label: "abort" },
          { key: "R", label: "re-run" },
        ]},
      ];
    case "roadmap":
      return [
        { name: "Move", hints: [
          { key: "↑↓", label: "task" },
          { key: "←→", label: "state" },
        ]},
        { name: "Actions", hints: [
          { key: "↵/r", label: "run" },
          { key: "n", label: "new" },
          { key: "e", label: "edit" },
          { key: "d", label: "delete" },
          { key: "Q", label: "queue" },
          { key: "c", label: "ready ↔ backlog" },
        ]},
      ];
    case "crew":
      return [
        { name: "Move", hints: [{ key: "↑↓", label: "agent" }] },
      ];
    case "skills":
      return [
        { name: "Move", hints: [
          { key: "↑↓", label: "skill" },
          { key: "←→", label: "agent" },
        ]},
        { name: "Actions", hints: [
          { key: "↵/space", label: "toggle assignment" },
        ]},
      ];
    case "approvals":
    case "suggestions":
      return [
        { name: "Move", hints: [{ key: "↑↓", label: "item" }] },
        { name: "Actions", hints: [
          { key: "a", label: "approve" },
          { key: "r", label: "reject" },
        ]},
      ];
    case "notifications":
      return [{ name: "Move", hints: [{ key: "↑↓", label: "notification" }] }];
    case "config":
      return [{ name: "Move", hints: [{ key: "↑↓", label: "section" }] }];
    case "consult":
      return [
        { name: "Move", hints: [{ key: "↑↓", label: "proposal" }] },
        { name: "Actions", hints: [
          { key: "a", label: "apply" },
          { key: "x", label: "reject" },
          { key: "r", label: "refresh" },
        ]},
      ];
    case "doctor":
      return [
        { name: "Actions", hints: [
          { key: "r", label: "rerun" },
          { key: "f", label: "apply safe fixes" },
        ]},
      ];
  }
}
