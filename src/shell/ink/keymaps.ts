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
        ]},
      ];
    case "roadmap":
      return [
        { name: "Move", hints: [
          { key: "↑↓", label: "task" },
          { key: "←→", label: "state" },
        ]},
        { name: "Actions", hints: [
          { key: "n", label: "new" },
          { key: "e", label: "edit" },
          { key: "d", label: "delete" },
          { key: "Q", label: "queue" },
          { key: "c", label: "→ready" },
        ]},
      ];
    case "queue":
      return [
        { name: "Move", hints: [{ key: "↑↓", label: "task" }] },
        { name: "Actions", hints: [
          { key: "p", label: "pause/resume scheduler" },
          { key: "x", label: "remove selected" },
        ]},
      ];
    case "agents":
    case "skills":
    case "approvals":
    case "suggestions":
    case "notifications":
    case "doctor":
      return [];
  }
}
