import { PoliciesPanel } from "../../components/policies/PoliciesPanel.js";

/**
 * The project's rule surface as a first-class page (docs/design/policy-consolidation.md):
 * owner-authored tiered policies (advise + block), the fail-closed safety gates, and
 * the read-only deterministic engine - on the Mission Control design idiom.
 */
export function PoliciesPage() {
  return (
    <div className="h-full overflow-y-auto">
      <PoliciesPanel />
    </div>
  );
}
