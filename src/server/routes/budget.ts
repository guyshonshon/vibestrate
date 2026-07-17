import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadConfig } from "../../project/config-loader.js";
import { setConfigValue } from "../../setup/config-update-service.js";
import { computeDailySpendUsd } from "../../core/metrics/spend-cap-service.js";
import { HttpError } from "../security.js";

export type BudgetRoutesDeps = { projectRoot: string };

const updateSchema = z
  .object({
    spendCapDailyUsd: z.number().nonnegative().nullable().optional(),
    capAction: z.enum(["stop", "downgrade-model", "reduce-effort"]).optional(),
    warnThresholdPct: z.number().min(0).max(1).optional(),
    fallbackProfile: z.string().min(1).nullable().optional(),
    // Count/time ceilings (unattended-resilience).
    maxTurnsPerRun: z.number().int().positive().nullable().optional(),
    maxWallClockMinPerRun: z.number().positive().nullable().optional(),
    maxTurnsPerDay: z.number().int().positive().nullable().optional(),
    maxWallClockMinPerDay: z.number().positive().nullable().optional(),
    onLimit: z.enum(["stop", "pause"]).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });

const CEILING_KEYS = [
  "maxTurnsPerRun",
  "maxWallClockMinPerRun",
  "maxTurnsPerDay",
  "maxWallClockMinPerDay",
] as const;

/**
 * Read / configure the daily spend cap. Writes go through the same
 * path-guarded config-update service the CLI uses; the orchestrator enforces
 * the cap (see spend-cap-service). No run is touched here.
 */
export async function registerBudgetRoutes(
  app: FastifyInstance,
  deps: BudgetRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/budget", async () => {
    const loaded = await loadConfig(projectRoot).catch(() => null);
    if (!loaded) throw new HttpError(409, "Project is not initialized.");
    const todaySpendUsd = await computeDailySpendUsd(projectRoot).catch(() => 0);
    return { budget: loaded.config.budget, todaySpendUsd };
  });

  app.patch("/api/budget", async (req) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid budget.");
    }
    const b = parsed.data;
    if (b.spendCapDailyUsd !== undefined) {
      await setConfigValue(projectRoot, "budget.spendCapDailyUsd", b.spendCapDailyUsd === null ? "null" : String(b.spendCapDailyUsd));
    }
    if (b.capAction !== undefined) {
      await setConfigValue(projectRoot, "budget.capAction", b.capAction);
    }
    if (b.warnThresholdPct !== undefined) {
      await setConfigValue(projectRoot, "budget.warnThresholdPct", String(b.warnThresholdPct));
    }
    if (b.fallbackProfile !== undefined) {
      await setConfigValue(projectRoot, "budget.fallbackProfile", b.fallbackProfile === null ? "null" : b.fallbackProfile);
    }
    for (const key of CEILING_KEYS) {
      const v = b[key];
      if (v !== undefined) {
        await setConfigValue(projectRoot, `budget.${key}`, v === null ? "null" : String(v));
      }
    }
    if (b.onLimit !== undefined) {
      await setConfigValue(projectRoot, "budget.onLimit", b.onLimit);
    }
    const loaded = await loadConfig(projectRoot);
    return { ok: true, budget: loaded.config.budget };
  });
}
