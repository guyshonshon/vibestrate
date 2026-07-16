// Durable param memory (project parameters).
import { jsonGet, jsonPost, jsonDelete } from "./http.js";
import type {
  ProjectParamsView,
  FlowParamValue,
} from "./types.js";

export const paramsApi = {
  /** The full stored params. Secret entries hold an `env:NAME` ref, never raw. */
  async getParams(): Promise<ProjectParamsView> {
    const r = await jsonGet<{ params: ProjectParamsView }>("/api/params");
    return r.params;
  },
  /** The stored values that apply to one flow, keyed by param name (for the
   *  Composer form prefill). Secret values are blanked - only the flag ships. */
  async getFlowParams(flowId: string): Promise<Record<string, FlowParamValue>> {
    const r = await jsonGet<{ values: Record<string, FlowParamValue> }>(
      `/api/params/flow/${encodeURIComponent(flowId)}`,
    );
    return r.values;
  },
  /** Persist values. With `flowId`, keys are the flow's declared params (typed,
   *  secret-aware, namespaced); without it, keys are raw param keys. */
  async setParams(input: {
    flowId?: string | null;
    values: Record<string, string>;
  }): Promise<{ ok: true; warnings: string[]; params: ProjectParamsView }> {
    return jsonPost("/api/params", input);
  },
  async unsetParamKey(key: string): Promise<{ ok: true; removed: string[] }> {
    return jsonDelete(`/api/params/${encodeURIComponent(key)}`);
  },
  /** Model-independent "generate a default" for a param declaring a `generate`
   *  hint. Strictly user-initiated; returns a suggestion the user reviews. */
  async generateParam(
    flowId: string,
    param: string,
  ): Promise<{ suggestion: string }> {
    return jsonPost(`/api/params/generate`, { flowId, param });
  },
};
