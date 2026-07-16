// Per-run agent work report (who did what).
import { jsonGet } from "./http.js";
import type {
  RoleWorkReport,
} from "../types.js";

export const agentWorkApi = {
  async getRoleWork(runId: string): Promise<RoleWorkReport> {
    const r = await jsonGet<{ report: RoleWorkReport }>(
      `/api/runs/${encodeURIComponent(runId)}/agent-work`,
    );
    return r.report;
  },
};
