import { GatewaySettings } from "../../components/notifications/GatewaySettings.js";
import { ProfileMaintenancePanel } from "../../components/codebase/ProfileMaintenancePanel.js";
import { ProjectParamsPanel } from "../../components/params/ProjectParamsPanel.js";
import { PageShell } from "../../components/layout/PageShell.js";
import { Deck, Cell, Stack } from "../../components/layout/Deck.js";
import { PageHero } from "../../components/layout/PageHero.js";

/**
 * Settings - everything that configures the project but does not judge a run.
 *
 * Two columns rather than three stacked full-width panels. Notification routing
 * is the tall one and gets a column; params and profile maintenance stack in
 * the other, which keeps the two columns close in height instead of leaving a
 * void beside the short one. The anchor ids are load-bearing - other surfaces
 * deep-link to `#project-params` and `#notifications`.
 */
export function SettingsPage() {
  return (
    <PageShell>
      <Deck>
        <Cell size="full" reason="masthead">
          <PageHero
            title="Settings"
            purpose="Project settings, notifications, permissions and validation. Policies have their own page."
            footer="Nothing here leaves this machine, or reaches a prompt."
          />
        </Cell>

        <Cell size="half">
          <Stack>
            <div id="project-params">
              <ProjectParamsPanel />
            </div>
            <ProfileMaintenancePanel />
          </Stack>
        </Cell>

        <Cell size="half">
          <div id="notifications">
            <GatewaySettings />
          </div>
        </Cell>
      </Deck>
    </PageShell>
  );
}
