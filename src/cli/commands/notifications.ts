import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { NotificationService } from "../../notifications/notification-service.js";
import { NotificationStore } from "../../notifications/notification-store.js";
import { buildDefaultRegistry } from "../../notifications/gateways/gateway-registry.js";
import { envVarName } from "../../notifications/gateways/secret-resolver.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";

async function ctx() {
  const detected = await detectProject(process.cwd());
  return {
    root: detected.projectRoot,
    svc: new NotificationService(detected.projectRoot),
    store: new NotificationStore(detected.projectRoot),
  };
}

const SEVERITY_COLOR: Record<string, (s: string) => string> = {
  info: color.dim,
  success: color.green,
  warning: color.yellow,
  attention: color.cyan,
  critical: color.red,
};

async function cmdList(opts: {
  json?: boolean;
  unreadOnly?: boolean;
  attentionOnly?: boolean;
}): Promise<number> {
  const { svc } = await ctx();
  await svc.init();
  let list = await svc.list();
  if (opts.unreadOnly) list = list.filter((n) => !n.readAt);
  if (opts.attentionOnly) list = list.filter((n) => n.actionRequired);
  if (opts.json) {
    console.log(JSON.stringify(list, null, 2));
    return 0;
  }
  if (list.length === 0) {
    console.log(color.dim("No notifications."));
    return 0;
  }
  console.log(header("Notifications"));
  console.log("");
  for (const n of list.slice(0, 25)) {
    const sevFn = SEVERITY_COLOR[n.severity] ?? color.dim;
    const flags = [
      n.readAt ? color.dim("read") : color.bold("unread"),
      n.actionRequired ? color.cyan("action") : null,
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(`${sevFn(n.severity.padEnd(9))} ${color.bold(n.title)}`);
    console.log(indent(color.dim(`${n.category} · ${flags} · ${n.createdAt}`)));
    if (n.message) console.log(indent(n.message));
    console.log(indent(color.dim(`id: ${n.id}`)));
    console.log("");
  }
  return 0;
}

async function cmdRead(id: string): Promise<number> {
  const { svc } = await ctx();
  const n = await svc.markRead(id);
  if (!n) {
    console.error(`${symbol.fail()} Notification "${id}" not found.`);
    return 1;
  }
  console.log(`${symbol.ok()} Marked read.`);
  return 0;
}

async function cmdResolve(id: string): Promise<number> {
  const { svc } = await ctx();
  const n = await svc.resolve(id);
  if (!n) {
    console.error(`${symbol.fail()} Notification "${id}" not found.`);
    return 1;
  }
  console.log(`${symbol.ok()} Resolved.`);
  return 0;
}

async function cmdReadAll(): Promise<number> {
  const { svc } = await ctx();
  const count = await svc.markAllRead();
  console.log(`${symbol.ok()} Marked ${count} notification(s) read.`);
  return 0;
}

async function cmdSettings(): Promise<number> {
  const { svc, store } = await ctx();
  await svc.init();
  const s = await svc.readSettings();
  const g = await store.readGateways();
  console.log(header("Notification settings"));
  console.log(indent(`enabled: ${s.enabled}`));
  console.log(indent(`min severity: ${s.defaultMinSeverity}`));
  console.log(indent(`channels: cli=${s.cli.enabled} in-app=${s.inApp.enabled} browser=${s.browser.enabled} desktop=${s.desktop.enabled}`));
  console.log(indent(`triggers: approval=${s.notifyOnApprovalRequested} run-completed=${s.notifyOnRunCompleted} run-blocked=${s.notifyOnRunBlocked} run-failed=${s.notifyOnRunFailed} validation=${s.notifyOnValidationFailed} conflict=${s.notifyOnSchedulerConflict} task-blocked=${s.notifyOnTaskBlocked}`));
  console.log("");
  console.log(header("Gateways"));
  if (Object.keys(g.gateways).length === 0) {
    console.log(indent(color.dim("No gateways configured. Run `vibe gateways enable <id>`.")));
  } else {
    for (const [id, cfg] of Object.entries(g.gateways)) {
      const flags = cfg.enabled ? color.green("enabled") : color.dim("disabled");
      console.log(`${color.bold(id)}  ${flags}`);
      const refs: string[] = [];
      for (const [k, v] of Object.entries({ url: cfg.url, token: cfg.token, target: cfg.target })) {
        if (!v) continue;
        const env = envVarName(v);
        if (env) {
          refs.push(
            `${k}: env:${env}${process.env[env] ? "" : color.yellow(" (unset)")}`,
          );
        } else {
          refs.push(`${k}: ${color.dim("[set]")}`);
        }
      }
      if (refs.length > 0) console.log(indent(refs.join(" · ")));
      console.log("");
    }
  }
  return 0;
}

async function cmdGatewayList(opts: { json?: boolean }): Promise<number> {
  const { root, store } = await ctx();
  const reg = await buildDefaultRegistry(root, () => {});
  const file = await store.readGateways();
  const out = reg.list().map((g) => {
    const cfg = file.gateways[g.id] ?? {
      enabled: false,
      url: null,
      token: null,
      target: null,
      minSeverity: "attention" as const,
      categories: [],
    };
    const validation = g.validateConfig(cfg);
    return {
      id: g.id,
      type: g.type,
      displayName: g.displayName,
      enabled: cfg.enabled,
      supportsTest: g.supportsTest,
      valid: validation.ok,
      missingEnvVars: validation.missingEnvVars,
    };
  });
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }
  console.log(header("Gateways"));
  console.log("");
  for (const g of out) {
    const status = g.enabled
      ? g.valid
        ? color.green("enabled")
        : color.yellow("enabled but invalid")
      : color.dim("disabled");
    console.log(`${color.bold(g.id.padEnd(10))} ${status}  ${color.dim(g.displayName)}`);
    if (g.missingEnvVars.length > 0) {
      console.log(indent(color.yellow(`missing env vars: ${g.missingEnvVars.join(", ")}`)));
    }
  }
  return 0;
}

async function cmdGatewayTest(id: string): Promise<number> {
  const { root, store } = await ctx();
  const reg = await buildDefaultRegistry(root, () => {});
  const gateway = reg.get(id);
  if (!gateway) {
    console.error(`${symbol.fail()} No gateway "${id}". Try \`vibe gateways list\`.`);
    return 1;
  }
  if (!gateway.test) {
    console.error(`${symbol.fail()} Gateway "${id}" does not support test mode.`);
    return 1;
  }
  const file = await store.readGateways();
  const cfg = file.gateways[id];
  if (!cfg) {
    console.error(`${symbol.fail()} Gateway "${id}" is not configured. Try \`vibe gateways enable ${id}\` first.`);
    return 1;
  }
  try {
    const r = await gateway.test({ config: cfg });
    if (r.ok) {
      console.log(`${symbol.ok()} ${r.message}`);
      return 0;
    }
    console.error(`${symbol.fail()} ${r.message}`);
    return 2;
  } catch (err) {
    console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
}

async function cmdGatewaySet(id: string, enabled: boolean): Promise<number> {
  const { root, store } = await ctx();
  const reg = await buildDefaultRegistry(root, () => {});
  const gateway = reg.get(id);
  if (!gateway) {
    console.error(`${symbol.fail()} No gateway "${id}". Try \`vibe gateways list\`.`);
    return 1;
  }
  const file = await store.readGateways();
  const current = file.gateways[id] ?? {
    enabled: false,
    url: null,
    token: null,
    target: null,
    minSeverity: "attention" as const,
    categories: [],
  };
  file.gateways[id] = { ...current, enabled };
  await store.writeGateways(file);
  console.log(`${symbol.ok()} Gateway ${color.bold(id)} ${enabled ? "enabled" : "disabled"}.`);
  if (enabled) {
    const validation = gateway.validateConfig(file.gateways[id]!);
    if (!validation.ok) {
      console.log(`${symbol.warn()} ${validation.reason ?? "Configuration is incomplete."}`);
    }
    if (validation.missingEnvVars.length > 0) {
      console.log(
        `${symbol.warn()} Set the env var(s) before running: ${validation.missingEnvVars.join(", ")}.`,
      );
    }
  }
  return 0;
}

export function buildNotificationsCommand(): Command {
  const cmd = new Command("notifications").description(
    "Inspect and manage local Vibestrate notifications.",
  );

  cmd
    .command("list")
    .description("Show notifications.")
    .option("--unread-only", "only show unread")
    .option("--attention-only", "only show items that need action")
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const code = await cmdList(opts);
      process.exit(code);
    });

  cmd
    .command("read <id>")
    .description("Mark a notification read.")
    .action(async (id: string) => {
      const code = await cmdRead(id);
      process.exit(code);
    });

  cmd
    .command("resolve <id>")
    .description("Mark a notification resolved.")
    .action(async (id: string) => {
      const code = await cmdResolve(id);
      process.exit(code);
    });

  cmd
    .command("read-all")
    .description("Mark every unread notification as read.")
    .action(async () => {
      const code = await cmdReadAll();
      process.exit(code);
    });

  cmd
    .command("settings")
    .description("Show current notification settings and configured gateways.")
    .action(async () => {
      const code = await cmdSettings();
      process.exit(code);
    });

  cmd
    .command("test <gatewayId>")
    .description("Send a tiny test notification through a configured gateway.")
    .action(async (id: string) => {
      try {
        const code = await cmdGatewayTest(id);
        process.exit(code);
      } catch (err) {
        console.error(
          `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });

  return cmd;
}

export function buildGatewaysCommand(): Command {
  const cmd = new Command("gateways").description(
    "Inspect and toggle notification delivery gateways.",
  );

  cmd
    .command("list")
    .description("Show available gateways and their enabled/valid status.")
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const code = await cmdGatewayList(opts);
      process.exit(code);
    });

  cmd
    .command("test <gatewayId>")
    .description("Send a test message through a gateway (no real notification persisted).")
    .action(async (id: string) => {
      const code = await cmdGatewayTest(id);
      process.exit(code);
    });

  cmd
    .command("enable <gatewayId>")
    .description("Enable a configured gateway.")
    .action(async (id: string) => {
      const code = await cmdGatewaySet(id, true);
      process.exit(code);
    });

  cmd
    .command("disable <gatewayId>")
    .description("Disable a gateway. Existing config is preserved.")
    .action(async (id: string) => {
      const code = await cmdGatewaySet(id, false);
      process.exit(code);
    });

  return cmd;
}
