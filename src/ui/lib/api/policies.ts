// Safety + project policies: rules, config, checks, supervisor-assisted authoring.
import { jsonGet, jsonPost, jsonPatch, jsonDelete } from "./http.js";
import type {
  ProjectPolicy,
  PolicyStoreSnapshot,
  PolicyDoctorResult,
  SafetyPoliciesConfig,
  PolicyCheckResult,
  PolicySurface,
  PolicyDraft,
  PolicyTestResult,
} from "../types.js";

export const policiesApi = {
  async listProjectPolicies(): Promise<{ policies: ProjectPolicy[] }> {
    return jsonGet(`/api/policies/rules`);
  },
  async addProjectPolicy(input: {
    id: string;
    statement: string;
    correction?: string | null;
    scopeLenses?: string[];
    tier?: "advise" | "block";
    matcher?: string | null;
  }): Promise<{ policy: ProjectPolicy }> {
    return jsonPost(`/api/policies/rules`, input);
  },
  async removeProjectPolicy(id: string): Promise<{ removed: boolean }> {
    return jsonDelete(`/api/policies/rules/${encodeURIComponent(id)}`);
  },
  async confirmProjectPolicy(id: string): Promise<{ confirmed: boolean }> {
    return jsonPost(`/api/policies/rules/${encodeURIComponent(id)}/confirm`);
  },
  async rejectProjectPolicy(id: string): Promise<{ rejected: boolean }> {
    return jsonPost(`/api/policies/rules/${encodeURIComponent(id)}/reject`);
  },
  async getPolicies(): Promise<PolicyStoreSnapshot> {
    return jsonGet("/api/policies");
  },
  async getPolicyDoctor(): Promise<PolicyDoctorResult> {
    return jsonGet("/api/policies/doctor");
  },
  async getSafetyConfig(): Promise<SafetyPoliciesConfig> {
    const r = await jsonGet<{ config: SafetyPoliciesConfig }>(
      "/api/policies/config",
    );
    return r.config;
  },
  async updateSafetyConfig(
    patch: Partial<Omit<SafetyPoliciesConfig, "requireApprovalAtStages">>,
  ): Promise<SafetyPoliciesConfig> {
    const r = await jsonPatch<{ config: SafetyPoliciesConfig }>(
      "/api/policies/config",
      patch,
    );
    return r.config;
  },
  async checkPatchAgainstPolicies(input: {
    patch: string;
    surface: PolicySurface;
  }): Promise<PolicyCheckResult> {
    return jsonPost("/api/policies/check", input);
  },
  // ── Supervisor-assisted authoring / dry-run ───────────────────────────────
  // draft/suggest hit the model (input redacted server-side) and NEVER write -
  // they return an editable draft the owner adopts with addProjectPolicy().
  // test is deterministic + read-only (matched lines are redacted server-side).
  async draftPolicy(description: string): Promise<{ draft: PolicyDraft }> {
    return jsonPost("/api/policies/draft", { description });
  },
  async suggestPolicies(
    limit?: number,
  ): Promise<{ drafts: PolicyDraft[]; runsScanned: number }> {
    return jsonPost("/api/policies/suggest", limit != null ? { limit } : {});
  },
  async testPolicy(
    rule: {
      regex?: string;
      flags?: string;
      glob?: string;
      appliesTo: PolicySurface[];
    },
    source:
      | { kind: "snippet"; patch: string }
      | { kind: "recent"; limit?: number },
  ): Promise<PolicyTestResult> {
    return jsonPost("/api/policies/test", { rule, source });
  },
};
