// Flow definitions, resolution, hub sharing, composer presets, skills.
import { jsonGet, jsonPost, jsonPatch, jsonDelete } from "./http.js";
import type {
  DiscoveredSkill,
  DiscoveredFlow,
  SkillAssignmentSummary,
  FlowContextPolicy,
  FlowSuggestion,
  ResolvedFlowSnapshot,
  FlowCoverage,
  HubFlowRow,
  HubPublishResult,
} from "../types.js";
import type {
  FlowPatch,
  ComposerPreset,
} from "./types.js";

export const flowsApi = {
  async listSkills(): Promise<{
    skills: DiscoveredSkill[];
    assignments: SkillAssignmentSummary[];
  }> {
    return jsonGet("/api/skills");
  },
  async listFlows(): Promise<{
    flows: DiscoveredFlow[];
    invalid: { path: string; message: string }[];
    defaultFlow?: string | null;
  }> {
    return jsonGet("/api/flows");
  },
  async patchFlow(
    flowId: string,
    patch: FlowPatch,
  ): Promise<{ ok: true; flow: DiscoveredFlow; definitionPath: string }> {
    return jsonPatch(`/api/flows/${encodeURIComponent(flowId)}`, patch);
  },
  async forkFlowToProject(flowId: string): Promise<{
    ok: true;
    flowId: string;
    definitionPath: string;
    alreadyForked: boolean;
    flow: DiscoveredFlow;
  }> {
    return jsonPost(`/api/flows/${encodeURIComponent(flowId)}/fork`);
  },
  async deleteFlow(flowId: string): Promise<{ ok: true; flowId: string }> {
    return jsonDelete(`/api/flows/${encodeURIComponent(flowId)}`);
  },
  /** Export a flow as canonical YAML for sharing / backup. */
  async exportFlow(flowId: string): Promise<{
    flowId: string;
    source: { kind: string; ref: string };
    yaml: string;
  }> {
    return jsonGet(`/api/flows/${encodeURIComponent(flowId)}/export`);
  },
  /** Import a single flow from raw YAML or a URL into .vibestrate/flows/. */
  async importFlow(input: {
    yaml?: string;
    url?: string;
    overwrite?: boolean;
  }): Promise<{
    ok: true;
    flowId: string;
    definitionPath: string;
    overwritten: boolean;
    flow: DiscoveredFlow;
  }> {
    return jsonPost("/api/flows/import", input);
  },
  // ─── hub (real API) ──────────────────────────────────────────────────
  async listHubFlows(q?: string): Promise<{ flows: HubFlowRow[] }> {
    return jsonGet(`/api/flows/hub${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  },
  /** Errors surface as thrown ApiError (the route maps install refusals to
   *  4xx/5xx with the reasons in the message). */
  async installHubFlow(input: {
    ref: string;
    overwrite?: boolean;
  }): Promise<{
    result: { ok: true; flowId: string; overwritten: boolean };
  }> {
    return jsonPost("/api/flows/hub/install", input);
  },
  /** Publish a project flow to the hub. The `confirm` literal is merged in
   *  automatically - the caller does not need to pass it. Errors surface as
   *  thrown ApiError (the route maps refusals to 4xx/5xx). */
  async publishHubFlow(input: {
    flowId: string;
    version: string;
    name?: string;
    handle: string;
  }): Promise<{ result: HubPublishResult; warnings: string[] }> {
    return jsonPost("/api/flows/hub/publish", { ...input, confirm: "publish" });
  },
  /** Create a project flow from a full definition (the flow-creator API). */
  async createFlow(
    flow: unknown,
    overwrite?: boolean,
  ): Promise<{
    ok: true;
    flowId: string;
    definitionPath: string;
    overwritten: boolean;
    flow: DiscoveredFlow;
  }> {
    return jsonPost("/api/flows", { flow, overwrite });
  },
  async listComposerPresets(): Promise<{ presets: ComposerPreset[] }> {
    return jsonGet("/api/composer/presets");
  },
  async saveComposerPreset(input: ComposerPreset): Promise<{
    ok: true;
    preset: ComposerPreset;
  }> {
    return jsonPost("/api/composer/presets", input);
  },
  async deleteComposerPreset(name: string): Promise<{ ok: true }> {
    return jsonDelete(`/api/composer/presets/${encodeURIComponent(name)}`);
  },
  async resolveFlow(
    flowId: string,
    input: {
      task: string;
      brief?: string | null;
      contextPolicy?: FlowContextPolicy;
      crewId?: string;
      profileOverride?: string;
      seatRoleOverrides?: Record<string, string>;
      stepProfileOverrides?: Record<string, string>;
      skippedOptionalSteps?: string[];
    },
  ): Promise<ResolvedFlowSnapshot> {
    const r = await jsonPost<{ snapshot: ResolvedFlowSnapshot }>(
      `/api/flows/${encodeURIComponent(flowId)}/resolve`,
      input,
    );
    return r.snapshot;
  },
  async flowCoverage(
    flowId: string,
    input: { crewId?: string | null; seatRoleOverrides?: Record<string, string> } = {},
  ): Promise<FlowCoverage> {
    const r = await jsonPost<{ coverage: FlowCoverage }>(
      `/api/flows/${encodeURIComponent(flowId)}/coverage`,
      input,
    );
    return r.coverage;
  },
  async setDefaultFlow(flowId: string): Promise<{ ok: true; defaultFlow: string }> {
    return jsonPost(`/api/flows/default`, { flowId });
  },
  async suggestFlows(input: {
    task: string;
    files?: string[];
    riskLevel?: "low" | "medium" | "high" | null;
  }): Promise<FlowSuggestion[]> {
    const r = await jsonPost<{ suggestions: FlowSuggestion[] }>(
      "/api/flows/suggest",
      input,
    );
    return r.suggestions;
  },
  async assignSkill(input: {
    skillId: string;
    roleId: string;
  }): Promise<{ assignments: SkillAssignmentSummary[] }> {
    const r = await jsonPost<{ assignments: SkillAssignmentSummary[] }>(
      `/api/skills/${encodeURIComponent(input.skillId)}/assign`,
      { roleId: input.roleId },
    );
    return r;
  },
  async unassignSkill(input: {
    skillId: string;
    roleId: string;
  }): Promise<{ assignments: SkillAssignmentSummary[] }> {
    const r = await jsonPost<{ assignments: SkillAssignmentSummary[] }>(
      `/api/skills/${encodeURIComponent(input.skillId)}/unassign`,
      { roleId: input.roleId },
    );
    return r;
  },
};
