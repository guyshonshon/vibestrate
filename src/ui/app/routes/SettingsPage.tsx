import { GatewaySettings } from "../../components/notifications/GatewaySettings.js";
import { ProfileMaintenancePanel } from "../../components/codebase/ProfileMaintenancePanel.js";
import { ProjectParamsPanel } from "../../components/params/ProjectParamsPanel.js";

export function SettingsPage() {
  return (
    <div className="deep-scene h-full overflow-y-auto">
      <div className="border-b border-vibestrate-border bg-vibestrate-panel px-4 py-3">
        <h1 className="text-[14px] font-medium text-vibestrate-fg">Settings</h1>
        <p className="mt-0.5 text-[11.5px] text-vibestrate-fg-muted">
          Project parameters (durable param memory), notification routing, browser
          permissions, communication gateways, and validation profile maintenance.
          Project policies have their own page in the sidebar. Secrets stay on this
          machine.
        </p>
      </div>
      <div id="project-params">
        <ProjectParamsPanel />
      </div>
      <div className="border-t border-vibestrate-border" />
      <div id="notifications">
        <GatewaySettings />
      </div>
      <div className="border-t border-vibestrate-border" />
      <ProfileMaintenancePanel />
    </div>
  );
}
