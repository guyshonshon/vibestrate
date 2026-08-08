import { PoliciesPanel } from "../../components/policies/PoliciesPanel.js";

/**
 * The project's rule surface: owner-authored tiered policies (advise + block),
 * the fail-closed safety gates, and the read-only deterministic engine.
 */
export function PoliciesPage() {
  return <PoliciesPanel />;
}
