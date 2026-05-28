import { GatewaySettings } from "../../components/notifications/GatewaySettings.js";
import { ProfileMaintenancePanel } from "../../components/codebase/ProfileMaintenancePanel.js";
import { PoliciesPanel } from "../../components/policies/PoliciesPanel.js";

export function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-vibestrate-border bg-vibestrate-panel/40 px-4 py-3">
        <h1 className="text-[14px] font-medium text-vibestrate-fg">Settings</h1>
        <p className="mt-0.5 text-[11.5px] text-vibestrate-fg-muted">
          Notification routing, browser permissions, communication gateways,
          validation profile maintenance, and user policy rules. Secrets stay
          on this machine.
        </p>
      </div>
      <div id="notifications">
        <GatewaySettings />
      </div>
      <div className="border-t border-vibestrate-border" />
      <ProfileMaintenancePanel />
      <div className="border-t border-vibestrate-border" />
      <PoliciesPanel />
    </div>
  );
}
