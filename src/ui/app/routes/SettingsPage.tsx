import { GatewaySettings } from "../../components/notifications/GatewaySettings.js";

export function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-amaco-border bg-amaco-panel/40 px-4 py-3">
        <h1 className="text-[14px] font-medium text-amaco-fg">Settings</h1>
        <p className="mt-0.5 text-[11.5px] text-amaco-fg-muted">
          Notification routing, browser permissions, and communication
          gateways. Secrets stay on this machine.
        </p>
      </div>
      <GatewaySettings />
    </div>
  );
}
