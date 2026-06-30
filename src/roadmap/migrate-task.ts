// One-time, read-time migration: the legacy "saga" task shape -> the run-mode
// shape. Runs BEFORE `taskSchema.parse` (in roadmap-store.getTask), so a task
// persisted under the old shape never throws on parse and is never silently
// dropped by getTask's `catch { return null }`. Idempotent; a no-op on an
// already-migrated task or a non-object.
//
// Legacy -> new:
//   kind: "saga"            -> runMode: "supervised"
//   kind: "single" (or none)-> runMode: "plain"
//   sagaState/Halt/Invariants/PendingRevision -> supervised: { state, halt, invariants, pendingRevision }
//   sagaBudget              -> runOptions: { budget }
//
// This is a one-shot rewrite of the owner's own data (the migrated task is
// persisted on the next write), NOT a permanent compatibility shim. It can be
// deleted once no legacy stores remain.

const LEGACY_KEYS = [
  "kind",
  "sagaState",
  "sagaHalt",
  "sagaInvariants",
  "sagaPendingRevision",
  "sagaBudget",
] as const;

export function migrateTaskShape(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const t = raw as Record<string, unknown>;
  if (!LEGACY_KEYS.some((k) => k in t)) return raw; // already new-shape

  const out: Record<string, unknown> = { ...t };

  if (!("runMode" in out)) {
    out.runMode = t.kind === "saga" ? "supervised" : "plain";
  }
  if (!("supervised" in out)) {
    out.supervised = {
      state: t.sagaState ?? "idle",
      halt: t.sagaHalt ?? null,
      invariants: t.sagaInvariants ?? [],
      pendingRevision: t.sagaPendingRevision ?? null,
    };
  }
  if (!("runOptions" in out) && "sagaBudget" in t) {
    out.runOptions = { budget: t.sagaBudget };
  }

  for (const k of LEGACY_KEYS) delete out[k];
  return out;
}
