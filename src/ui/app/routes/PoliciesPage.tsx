import { PoliciesPanel } from "../../components/policies/PoliciesPanel.js";

/**
 * The project's rule surface as a first-class page (docs/design/policy-consolidation.md):
 * owner-authored tiered policies (advise + block) plus the hard, fail-closed security
 * gates. Reachable from the sidebar so it is not buried in Settings.
 */
export function PoliciesPage() {
  return (
    <div className="deep-scene h-full overflow-y-auto">
      <PoliciesPanel />
    </div>
  );
}
