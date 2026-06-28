// Preference gates (docs/design/preference-gates.md). Owner-taught,
// supervisor-curated preferences ("use a hyphen, not an em-dash"; "no eyebrow
// labels") rendered into a reviewer turn so a MODEL verifies the artifact against
// them - the enforcement tier for preferences that are real but not mechanizable.
//
// This is the M0 slice: advise-only injection. Unlike reviewLenses (a CLOSED
// vocabulary, because a persona could try to smuggle behavior into a reviewer),
// a preference is free text - safe for the SAME reason specUpPosture is
// (spec-up-posture.ts:5-14): it is owner-committed config, referenced by id, never
// accepted as free text over the run API/CLI. The injectability gate is
// `confirmedAt`: a supervisor-*proposed* (unconfirmed) preference is inert and its
// text never reaches a prompt, so an unconfirmed/smuggled entry is fail-safe.
//
// No code-enforced merge gate rides on a preference in M0 (that is `block`
// severity, deferred to M2 behind its own review - see the design doc); a flagged
// preference rides the existing review -> fix -> re-review loop.

/** A resolved preference record (mirrors the persona-config `preferenceSchema`). */
export type Preference = {
  id: string;
  statement: string;
  /** The fix the reviewer should name; null = state the rule only. */
  correction: string | null;
  /** Scope that decides which reviewer turns this preference reaches. */
  scope: { lenses: string[] };
  source: "owner" | "supervisor-proposed";
  /** null until the owner confirms; null => never injected (the trust gate). */
  confirmedAt: string | null;
};

/** Max preferences injected into a single reviewer turn (keeps context bounded). */
export const PREFERENCE_INJECTION_CAP = 12;

export type PreferenceSelection = {
  /** The prompt block appended to a reviewer turn. */
  block: string;
  /** The preferences that made it into the block (declaration order, deduped). */
  injected: Preference[];
  /** How many confirmed/in-scope preferences were dropped by the cap. */
  droppedForCap: number;
};

/**
 * Pure. Select the confirmed, in-scope preferences for a reviewer turn, deduped by
 * id and capped. A preference is in scope when its `scope.lenses` is empty (global)
 * or intersects the run's active review lenses.
 */
export function selectPreferences(
  preferences: readonly Preference[],
  ctx: { activeLenses: readonly string[] },
): { injected: Preference[]; droppedForCap: number } {
  const active = new Set(ctx.activeLenses);
  const seen = new Set<string>();
  const matched: Preference[] = [];
  for (const p of preferences ?? []) {
    if (!p || p.confirmedAt == null) continue; // trust gate: unconfirmed is inert
    if (seen.has(p.id)) continue;
    const lenses = p.scope?.lenses ?? [];
    const inScope = lenses.length === 0 || lenses.some((l) => active.has(l));
    if (!inScope) continue;
    seen.add(p.id);
    matched.push(p);
  }
  const injected = matched.slice(0, PREFERENCE_INJECTION_CAP);
  return { injected, droppedForCap: matched.length - injected.length };
}

/**
 * Pure. Render the selected preferences into a bounded, labelled reviewer block.
 * Returns null when nothing is selected, so the caller injects nothing and the turn
 * is byte-identical to before.
 */
export function renderPreferenceGateBlock(
  preferences: readonly Preference[],
  ctx: { activeLenses: readonly string[] },
): PreferenceSelection | null {
  const { injected, droppedForCap } = selectPreferences(preferences, ctx);
  if (injected.length === 0) return null;
  const lines = injected.map((p) => {
    const statement = p.statement.trim().replace(/\.+$/, "");
    return p.correction
      ? `- ${statement}. Fix: ${p.correction.trim()}`
      : `- ${statement}.`;
  });
  const block = [
    "Owner preferences - verify the change against each; flag every violation with its exact location and the stated correction (advisory; rides the normal review -> fix loop, never softens a code-enforced gate):",
    ...lines,
  ].join("\n");
  return { block, injected, droppedForCap };
}
