import { describe, it, expect } from "vitest";
import { api } from "../src/ui/lib/api.js";
import { runsApi } from "../src/ui/lib/api/runs.js";
import { specUpApi } from "../src/ui/lib/api/spec-up.js";
import { providersApi } from "../src/ui/lib/api/providers.js";
import { supervisorsApi } from "../src/ui/lib/api/supervisors.js";
import { policiesApi } from "../src/ui/lib/api/policies.js";
import { flowsApi } from "../src/ui/lib/api/flows.js";
import { metricsApi } from "../src/ui/lib/api/metrics.js";
import { crewsApi } from "../src/ui/lib/api/crews.js";
import { roadmapApi } from "../src/ui/lib/api/roadmap.js";
import { tasksApi } from "../src/ui/lib/api/tasks.js";
import { integrationApi } from "../src/ui/lib/api/integration.js";
import { workspaceApi } from "../src/ui/lib/api/workspace.js";
import { queueApi } from "../src/ui/lib/api/queue.js";
import { notificationsApi } from "../src/ui/lib/api/notifications.js";
import { configApi } from "../src/ui/lib/api/config.js";
import { projectApi } from "../src/ui/lib/api/project.js";
import { codebaseApi } from "../src/ui/lib/api/codebase.js";
import { gitApi } from "../src/ui/lib/api/git.js";
import { agentWorkApi } from "../src/ui/lib/api/agent-work.js";
import { suggestionsApi } from "../src/ui/lib/api/suggestions.js";
import { bundlesApi } from "../src/ui/lib/api/bundles.js";
import { terminalApi } from "../src/ui/lib/api/terminal.js";
import { paramsApi } from "../src/ui/lib/api/params.js";

const slices: Record<string, Record<string, unknown>> = {
  runsApi,
  specUpApi,
  providersApi,
  supervisorsApi,
  policiesApi,
  flowsApi,
  metricsApi,
  crewsApi,
  roadmapApi,
  tasksApi,
  integrationApi,
  workspaceApi,
  queueApi,
  notificationsApi,
  configApi,
  projectApi,
  codebaseApi,
  gitApi,
  agentWorkApi,
  suggestionsApi,
  bundlesApi,
  terminalApi,
  paramsApi,
};

describe("lib/api barrel composition", () => {
  // The barrel builds `api` by spreading the domain slices; a duplicate method
  // name across two slices would silently last-write-win. Guard: the merged
  // key count must equal the sum of slice key counts.
  it("has no method-name collisions across domain slices", () => {
    const owner = new Map<string, string>();
    for (const [slice, obj] of Object.entries(slices)) {
      for (const key of Object.keys(obj)) {
        expect(
          owner.has(key),
          `method "${key}" defined in both ${owner.get(key)} and ${slice}`,
        ).toBe(false);
        owner.set(key, slice);
      }
    }
    expect(Object.keys(api).length).toBe(owner.size);
  });

  it("every slice method is callable through the merged api object", () => {
    for (const obj of Object.values(slices)) {
      for (const [key, fn] of Object.entries(obj)) {
        expect(api[key as keyof typeof api]).toBe(fn);
      }
    }
  });
});
