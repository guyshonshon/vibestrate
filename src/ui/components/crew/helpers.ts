import type { ChipTone } from "../design/Chip.js";
import type { CrewView, DiscoveredFlow } from "../../lib/types.js";

// Tailwind can't see runtime-built class names, so map each tone to literal
// classes (these strings appear verbatim for the JIT to pick up). All tones map
// through the coal/chalk/accent palette so they flip correctly in both themes -
// no raw hex, no `.slab`.
// The role card's tonal header wash - the task hero's tonal-anchor treatment
// (TaskOverviewPanel TONE.colBg): colour as a structural surface region inside
// an overflow-hidden card, never an edge stripe.
export const TONE_WASH: Record<ChipTone, string> = {
  neutral: "bg-coal-500/40",
  violet: "bg-violet-soft/[0.08]",
  sky: "bg-sky-glow/[0.08]",
  emerald: "bg-emerald-500/[0.09]",
  amber: "bg-amber-500/[0.09]",
  rose: "bg-rose-500/[0.09]",
};
// The role avatar chip (initials) - tinted fill + accent text.
export const TONE_AVATAR: Record<ChipTone, string> = {
  neutral: "bg-coal-500 text-chalk-300",
  violet: "bg-violet-soft/14 text-violet-soft",
  sky: "bg-sky-glow/14 text-sky-glow",
  emerald: "bg-emerald-400/14 text-emerald-400",
  amber: "bg-amber-soft/14 text-amber-soft",
  rose: "bg-rose-400/14 text-rose-300",
};
// A seat this role takes (selected state), toned to the role.
export const TONE_SEAT_ON: Record<ChipTone, string> = {
  neutral: "border-chalk-400/40 bg-coal-500 text-chalk-100",
  violet: "border-violet-soft/40 bg-violet-soft/10 text-chalk-100",
  sky: "border-sky-glow/40 bg-sky-glow/10 text-chalk-100",
  emerald: "border-emerald-400/40 bg-emerald-400/10 text-chalk-100",
  amber: "border-amber-soft/40 bg-amber-soft/10 text-chalk-100",
  rose: "border-rose-400/40 bg-rose-400/10 text-chalk-100",
};

export const TONE_TEXT: Record<ChipTone, string> = {
  neutral: "text-chalk-400",
  violet: "text-violet-soft",
  sky: "text-sky-glow",
  emerald: "text-emerald-400",
  amber: "text-amber-soft",
  rose: "text-rose-300",
};

// Border + wire colours for the hover detail tree (Tailwind can't apply an
// opacity modifier to `currentColor`, so each tone maps to a literal class).
export const TONE_LINE: Record<ChipTone, string> = {
  neutral: "border-chalk-400/40",
  violet: "border-violet-soft/50",
  sky: "border-sky-glow/50",
  emerald: "border-emerald-400/50",
  amber: "border-amber-soft/50",
  rose: "border-rose-400/50",
};

export const TONE_WIRE: Record<ChipTone, string> = {
  neutral: "bg-chalk-400/40",
  violet: "bg-violet-soft/50",
  sky: "bg-sky-glow/50",
  emerald: "bg-emerald-400/50",
  amber: "bg-amber-soft/50",
  rose: "bg-rose-400/50",
};

export const PERMISSION_OPTIONS = [
  "read_only",
  "code_write",
  "review_only",
  "verify_only",
];

// Human labels for the permission tokens - never surface the raw snake_case id
// (a design anti-pattern: a code slug masquerading as a label).
export const PERMISSION_LABEL: Record<string, string> = {
  read_only: "Read only",
  code_write: "Can write",
  review_only: "Review only",
  verify_only: "Verify only",
};

// A seat's work-type category, derived from the permission of the role that
// fills it: read / write / review / verify. "Not all seats are equal" - this is
// their kind of work, and it's complete (every role has a permission) and
// authoritative, unlike per-step flow stages which many seats never set.
export const WORKTYPE_LABEL: Record<string, string> = {
  read_only: "Reading",
  code_write: "Writing",
  review_only: "Reviewing",
  verify_only: "Verifying",
};

export type SeatStatus = "covered" | "uncovered" | "ambiguous";
export type SeatCoverageEntry = { roleIds: string[]; status: SeatStatus };

/** Seats any flow asks for (plus seats the crew already assigns) and how many
 *  of the crew's roles fill each - shared by the hub cards and the config page
 *  so the numbers always agree. Pure. */
export function computeCoverage(
  crew: CrewView | null,
  flows: DiscoveredFlow[],
): { knownSeats: string[]; coverage: Map<string, SeatCoverageEntry> } {
  const set = new Set<string>();
  for (const f of flows) {
    for (const seatId of Object.keys(f.definition.seats ?? {})) set.add(seatId);
  }
  for (const r of crew?.roles ?? []) for (const s of r.seats) set.add(s);
  const knownSeats = [...set].sort();
  const coverage = new Map<string, SeatCoverageEntry>();
  for (const seat of knownSeats) {
    const roleIds = (crew?.roles ?? [])
      .filter((r) => r.seats.includes(seat))
      .map((r) => r.id);
    const status: SeatStatus =
      roleIds.length === 0 ? "uncovered" : roleIds.length > 1 ? "ambiguous" : "covered";
    coverage.set(seat, { roleIds, status });
  }
  return { knownSeats, coverage };
}
