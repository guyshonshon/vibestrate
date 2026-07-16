// Cross-project workspace: project list, open/close, overview.
import { jsonGet, jsonPost } from "./http.js";
import type {
  OverviewRange,
  WorkspaceOverview,
  EnsureServerResult,
  WorkspaceBusyStatus,
  WorkspaceCloseResult,
} from "./types.js";

export const workspaceApi = {
  async listWorkspace(): Promise<{
    current: string;
    projects: {
      root: string;
      label: string;
      lastPort: number | null;
      lastOpenedAt: string;
      current: boolean;
      live: boolean;
    }[];
  }> {
    return jsonGet("/api/workspace");
  },
  /** Ensure a project's own dashboard is live (starting it if dormant) and
   *  return its URL so the caller can open a new tab. */
  async openWorkspaceProject(project: string): Promise<EnsureServerResult> {
    return jsonPost("/api/workspace/open", { project });
  },
  /** What a project is currently doing (for the Close confirmation). */
  async getWorkspaceStatus(project: string): Promise<WorkspaceBusyStatus> {
    return jsonGet(`/api/workspace/status?project=${encodeURIComponent(project)}`);
  },
  /** Shut down a project's own dashboard + scheduler. */
  async closeWorkspaceProject(project: string): Promise<WorkspaceCloseResult> {
    return jsonPost("/api/workspace/close", { project });
  },
  async getWorkspaceOverview(range: OverviewRange): Promise<WorkspaceOverview> {
    return jsonGet(`/api/workspace/overview?range=${encodeURIComponent(range)}`);
  },
};
