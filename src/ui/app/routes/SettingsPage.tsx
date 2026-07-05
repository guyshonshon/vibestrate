import { GatewaySettings } from "../../components/notifications/GatewaySettings.js";
import { ProfileMaintenancePanel } from "../../components/codebase/ProfileMaintenancePanel.js";
import { ProjectParamsPanel } from "../../components/params/ProjectParamsPanel.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";

export function SettingsPage() {
  return (
    <PageShell>
      <PageHeader title="Settings">
        <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 px-4 py-3 text-[13px] leading-relaxed text-chalk-300">
          Project parameters (durable param memory), notification routing, browser
          permissions, communication gateways, and validation profile maintenance.
          Project policies have their own page in the sidebar. Secrets stay on this
          machine.
        </div>
      </PageHeader>
      <Section className="mb-6">
        <div id="project-params">
          <ProjectParamsPanel />
        </div>
      </Section>
      <Section className="mb-6">
        <div id="notifications">
          <GatewaySettings />
        </div>
      </Section>
      <Section>
        <ProfileMaintenancePanel />
      </Section>
    </PageShell>
  );
}
