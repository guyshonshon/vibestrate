import { Command } from "commander";
import { loadConfig } from "../../project/config-loader.js";
import { setConfigValue } from "../../setup/config-update-service.js";
import { computeDailySpendUsd } from "../../core/spend-cap-service.js";
import { color, symbol } from "../ui/format.js";

const ACTIONS = ["stop", "downgrade-model", "reduce-effort"] as const;
const OFF = ["off", "none", "null"];

/** Set a count/time ceiling, or clear it with off/none/null. */
async function setCeiling(
  cwd: string,
  key: string,
  raw: string | undefined,
  isInt: boolean,
): Promise<void> {
  if (raw === undefined) return;
  if (OFF.includes(raw.toLowerCase())) {
    await setConfigValue(cwd, key, "null");
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || (isInt && !Number.isInteger(n))) {
    console.error(
      `${symbol.fail()} ${key} must be a positive ${isInt ? "integer" : "number"} (or 'off').`,
    );
    process.exit(2);
  }
  await setConfigValue(cwd, key, String(n));
}

/** Print any configured count/time ceilings (skips the ones left null). */
function printCeilings(b: {
  maxTurnsPerRun?: number | null;
  maxWallClockMinPerRun?: number | null;
  maxTurnsPerDay?: number | null;
  maxWallClockMinPerDay?: number | null;
} | null | undefined): void {
  if (!b) return;
  const parts: string[] = [];
  if (b.maxTurnsPerRun != null) parts.push(`${b.maxTurnsPerRun} turns/run`);
  if (b.maxWallClockMinPerRun != null) parts.push(`${b.maxWallClockMinPerRun} min/run`);
  if (b.maxTurnsPerDay != null) parts.push(`${b.maxTurnsPerDay} turns/day`);
  if (b.maxWallClockMinPerDay != null) parts.push(`${b.maxWallClockMinPerDay} min/day`);
  if (parts.length > 0) {
    console.log(`  Ceilings (bind without measured cost): ${color.bold(parts.join(" · "))}`);
  }
}

export function buildBudgetCommand(): Command {
  const cmd = new Command("budget").description(
    "View or configure the daily spend cap (and what happens when it's hit).",
  );

  cmd
    .command("show", { isDefault: true })
    .description("Show the configured cap, action, and today's spend so far.")
    .action(async () => {
      const cwd = process.cwd();
      const loaded = await loadConfig(cwd).catch(() => null);
      if (!loaded) {
        console.error(`${symbol.fail()} Not an initialized project (run \`vibe init\`).`);
        process.exit(1);
      }
      const b = loaded.config.budget;
      const today = await computeDailySpendUsd(cwd).catch(() => 0);
      if (!b?.spendCapDailyUsd) {
        console.log(`${symbol.bullet()} No daily spend cap set. Today's spend: ${color.bold(`$${today.toFixed(2)}`)}.`);
        console.log(color.dim(`  Set one: vibe budget set --cap 5 --action stop`));
        printCeilings(b);
        return;
      }
      const pct = Math.round((today / b.spendCapDailyUsd) * 100);
      console.log(`${symbol.bullet()} Daily cap: ${color.bold(`$${b.spendCapDailyUsd}`)} · action: ${color.bold(b.capAction)} · warn at ${Math.round((b.warnThresholdPct ?? 0.8) * 100)}%`);
      console.log(`  Today's spend: ${color.bold(`$${today.toFixed(2)}`)} (${pct}% of cap)${b.fallbackProfile ? ` · downgrade → ${b.fallbackProfile}` : ""}`);
      printCeilings(b);
    });

  cmd
    .command("set")
    .description("Set the daily spend cap and/or the action taken when it's reached.")
    .option("--cap <usd>", "daily cap in USD (e.g. 5)")
    .option("--action <action>", `what to do at the cap: ${ACTIONS.join(" | ")}`)
    .option("--warn <pct>", "warn threshold as a fraction 0..1 (default 0.8)")
    .option("--fallback <providerId>", "cheaper Profile to switch to on downgrade-model")
    .option("--max-turns-run <n|off>", "max agent turns in one run (count ceiling)")
    .option("--max-time-run <min|off>", "max wall-clock minutes for one run")
    .option("--max-turns-day <n|off>", "max agent turns across all runs today")
    .option("--max-time-day <min|off>", "max wall-clock minutes across all runs today")
    .action(
      async (opts: {
        cap?: string;
        action?: string;
        warn?: string;
        fallback?: string;
        maxTurnsRun?: string;
        maxTimeRun?: string;
        maxTurnsDay?: string;
        maxTimeDay?: string;
      }) => {
        const cwd = process.cwd();
        const ceilingOpts = [
          opts.maxTurnsRun,
          opts.maxTimeRun,
          opts.maxTurnsDay,
          opts.maxTimeDay,
        ];
        if (
          opts.cap === undefined &&
          opts.action === undefined &&
          opts.warn === undefined &&
          opts.fallback === undefined &&
          ceilingOpts.every((v) => v === undefined)
        ) {
          console.error(
            `${symbol.fail()} Nothing to set. Pass --cap, --action, --warn, --fallback, or a --max-* ceiling.`,
          );
          process.exit(2);
        }
        if (opts.action !== undefined && !ACTIONS.includes(opts.action as (typeof ACTIONS)[number])) {
          console.error(`${symbol.fail()} --action must be one of: ${ACTIONS.join(", ")}.`);
          process.exit(2);
        }
        if (opts.cap !== undefined) {
          const n = Number(opts.cap);
          if (!Number.isFinite(n) || n < 0) {
            console.error(`${symbol.fail()} --cap must be a non-negative number.`);
            process.exit(2);
          }
          await setConfigValue(cwd, "budget.spendCapDailyUsd", String(n));
        }
        if (opts.action !== undefined) {
          await setConfigValue(cwd, "budget.capAction", opts.action);
        }
        if (opts.warn !== undefined) {
          await setConfigValue(cwd, "budget.warnThresholdPct", opts.warn);
        }
        if (opts.fallback !== undefined) {
          await setConfigValue(cwd, "budget.fallbackProfile", opts.fallback);
        }
        await setCeiling(cwd, "budget.maxTurnsPerRun", opts.maxTurnsRun, true);
        await setCeiling(cwd, "budget.maxWallClockMinPerRun", opts.maxTimeRun, false);
        await setCeiling(cwd, "budget.maxTurnsPerDay", opts.maxTurnsDay, true);
        await setCeiling(cwd, "budget.maxWallClockMinPerDay", opts.maxTimeDay, false);
        console.log(`${symbol.ok()} Budget updated.`);
      },
    );

  cmd
    .command("off")
    .description("Remove the daily spend cap.")
    .action(async () => {
      await setConfigValue(process.cwd(), "budget.spendCapDailyUsd", "null");
      console.log(`${symbol.ok()} Daily spend cap removed.`);
    });

  return cmd;
}
