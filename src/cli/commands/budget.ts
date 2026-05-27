import { Command } from "commander";
import { loadConfig } from "../../project/config-loader.js";
import { setConfigValue } from "../../setup/config-update-service.js";
import { computeDailySpendUsd } from "../../core/spend-cap-service.js";
import { color, symbol } from "../ui/format.js";

const ACTIONS = ["stop", "downgrade-model", "reduce-effort"] as const;

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
        console.error(`${symbol.fail()} Not an initialized project (run \`amaco init\`).`);
        process.exit(1);
      }
      const b = loaded.config.budget;
      const today = await computeDailySpendUsd(cwd).catch(() => 0);
      if (!b?.spendCapDailyUsd) {
        console.log(`${symbol.bullet()} No daily spend cap set. Today's spend: ${color.bold(`$${today.toFixed(2)}`)}.`);
        console.log(color.dim(`  Set one: amaco budget set --cap 5 --action stop`));
        return;
      }
      const pct = Math.round((today / b.spendCapDailyUsd) * 100);
      console.log(`${symbol.bullet()} Daily cap: ${color.bold(`$${b.spendCapDailyUsd}`)} · action: ${color.bold(b.capAction)} · warn at ${Math.round((b.warnThresholdPct ?? 0.8) * 100)}%`);
      console.log(`  Today's spend: ${color.bold(`$${today.toFixed(2)}`)} (${pct}% of cap)${b.fallbackProvider ? ` · downgrade → ${b.fallbackProvider}` : ""}`);
    });

  cmd
    .command("set")
    .description("Set the daily spend cap and/or the action taken when it's reached.")
    .option("--cap <usd>", "daily cap in USD (e.g. 5)")
    .option("--action <action>", `what to do at the cap: ${ACTIONS.join(" | ")}`)
    .option("--warn <pct>", "warn threshold as a fraction 0..1 (default 0.8)")
    .option("--fallback <providerId>", "cheaper provider to switch to on downgrade-model")
    .action(
      async (opts: {
        cap?: string;
        action?: string;
        warn?: string;
        fallback?: string;
      }) => {
        const cwd = process.cwd();
        if (
          opts.cap === undefined &&
          opts.action === undefined &&
          opts.warn === undefined &&
          opts.fallback === undefined
        ) {
          console.error(`${symbol.fail()} Nothing to set. Pass --cap, --action, --warn, or --fallback.`);
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
          await setConfigValue(cwd, "budget.fallbackProvider", opts.fallback);
        }
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
