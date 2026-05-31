import type { DiscoveredFlow } from "../../flows/catalog/flow-discovery.js";
import {
  horizontalSelect,
  type HorizontalChoice,
} from "../ui/horizontal-select.js";

/**
 * The `vibe run -i` Flow/Crew picker: two horizontal chip-selects that fill in
 * whichever of `--flow` / `--crew` the user didn't pass, then the run starts.
 * The choice-building is pure (and tested); the picker functions are thin
 * wrappers over the `horizontalSelect` prompt so they only run under a TTY.
 */

export type CrewOption = { id: string; label: string };

/** Build the Flow chips. Project flows first, then built-ins; each labelled
 *  with its source so duplicates-by-name are distinguishable. */
export function buildFlowChoices(
  flows: readonly DiscoveredFlow[],
): HorizontalChoice<string>[] {
  const ordered = [...flows].sort((a, b) => {
    if (a.source.kind !== b.source.kind) {
      return a.source.kind === "project" ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
  return ordered.map((f) => ({
    value: f.id,
    name: f.label || f.id,
    description: [f.description, `${f.source.kind} · ${f.id}`]
      .filter(Boolean)
      .join(" — "),
  }));
}

/** Build the Crew chips, the default crew first and marked. */
export function buildCrewChoices(
  crews: readonly CrewOption[],
  defaultCrewId: string | null,
): HorizontalChoice<string>[] {
  const ordered = [...crews].sort((a, b) => {
    if (a.id === defaultCrewId) return -1;
    if (b.id === defaultCrewId) return 1;
    return a.id.localeCompare(b.id);
  });
  return ordered.map((c) => ({
    value: c.id,
    name: c.id === defaultCrewId ? `${c.label} (default)` : c.label,
    description: c.id,
  }));
}

export async function pickFlow(
  flows: readonly DiscoveredFlow[],
  defaultFlowId?: string,
): Promise<string> {
  return horizontalSelect({
    message: "Flow:",
    choices: buildFlowChoices(flows),
    default: defaultFlowId,
  });
}

export async function pickCrew(
  crews: readonly CrewOption[],
  defaultCrewId: string | null,
): Promise<string> {
  return horizontalSelect({
    message: "Crew:",
    choices: buildCrewChoices(crews, defaultCrewId),
    default: defaultCrewId ?? undefined,
  });
}
