import { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  Webhook,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  GatewayConfigView,
  GatewayView,
  NotificationSettings,
} from "../../lib/types.js";

type Props = {
  // optional injection point for tests
  initialPermission?: NotificationPermission | "unsupported";
};

type FieldKey = "url" | "token" | "target";

function describeField(
  field: FieldKey,
  cfg: GatewayConfigView,
): { label: string; status: "ok" | "missing" | "literal" | "none" } {
  const value = cfg[field];
  if (value === null) return { label: "(not configured)", status: "none" };
  if (value.kind === "env-ref") {
    return {
      label: `env:${value.envVar}${value.envVarSet ? "" : " (unset)"}`,
      status: value.envVarSet ? "ok" : "missing",
    };
  }
  return {
    label: value.hasValue ? "literal value (hidden)" : "(empty)",
    status: value.hasValue ? "literal" : "none",
  };
}

function browserSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function GatewaySettings({ initialPermission }: Props) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [gateways, setGateways] = useState<GatewayView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<
    Record<string, { ok: boolean; message: string } | null>
  >({});
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(
    initialPermission ??
      (browserSupported()
        ? window.Notification.permission
        : "unsupported"),
  );

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.getNotificationSettings();
      setSettings(r.settings);
      setGateways(r.gateways);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function patchSettings(patch: Partial<NotificationSettings>) {
    if (!settings) return;
    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);
    try {
      const r = await api.patchNotificationSettings(patch);
      setSettings(r.settings);
    } catch (err) {
      setSettings(settings);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function requestBrowserPermission() {
    if (!browserSupported()) {
      setPermission("unsupported");
      return;
    }
    try {
      const result = await window.Notification.requestPermission();
      setPermission(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function testGateway(id: string) {
    setTestStatus((prev) => ({ ...prev, [id]: null }));
    try {
      const r = await api.testGateway(id);
      setTestStatus((prev) => ({ ...prev, [id]: r }));
    } catch (err) {
      setTestStatus((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  }

  if (busy && !settings) {
    return (
      <div className="px-4 py-6 text-[12px] text-amaco-fg-muted">Loading…</div>
    );
  }
  if (error && !settings) {
    return <div className="px-4 py-6 text-[12px] text-amaco-fail">{error}</div>;
  }
  if (!settings) return null;

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      {error ? (
        <div className="rounded border border-amaco-fail/40 bg-amaco-fail/10 px-3 py-2 text-[12px] text-amaco-fail">
          {error}
        </div>
      ) : null}

      <section className="rounded border border-amaco-border">
        <header className="flex items-center gap-2 border-b border-amaco-border px-3 py-2">
          <Bell className="h-3.5 w-3.5 text-amaco-accent" strokeWidth={1.5} />
          <span className="text-[13px] font-medium text-amaco-fg">
            Notification routing
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="ml-auto rounded border border-amaco-border p-1 text-amaco-fg-dim hover:bg-amaco-panel-2"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
          </button>
        </header>
        <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2">
          <Toggle
            label="Notifications enabled"
            value={settings.enabled}
            onChange={(v) => void patchSettings({ enabled: v })}
          />
          <Toggle
            label="In-app"
            value={settings.inApp.enabled}
            onChange={(v) => void patchSettings({ inApp: { enabled: v } })}
          />
          <Toggle
            label="CLI"
            value={settings.cli.enabled}
            onChange={(v) => void patchSettings({ cli: { enabled: v } })}
          />
          <Toggle
            label="Browser (system)"
            value={settings.browser.enabled}
            onChange={(v) => void patchSettings({ browser: { enabled: v } })}
          />
          <Toggle
            label="Notify on approval requested"
            value={settings.notifyOnApprovalRequested}
            onChange={(v) =>
              void patchSettings({ notifyOnApprovalRequested: v })
            }
          />
          <Toggle
            label="Notify on run completed"
            value={settings.notifyOnRunCompleted}
            onChange={(v) => void patchSettings({ notifyOnRunCompleted: v })}
          />
          <Toggle
            label="Notify on run blocked"
            value={settings.notifyOnRunBlocked}
            onChange={(v) => void patchSettings({ notifyOnRunBlocked: v })}
          />
          <Toggle
            label="Notify on run failed"
            value={settings.notifyOnRunFailed}
            onChange={(v) => void patchSettings({ notifyOnRunFailed: v })}
          />
          <Toggle
            label="Notify on validation failed"
            value={settings.notifyOnValidationFailed}
            onChange={(v) =>
              void patchSettings({ notifyOnValidationFailed: v })
            }
          />
          <Toggle
            label="Notify on scheduler conflict"
            value={settings.notifyOnSchedulerConflict}
            onChange={(v) =>
              void patchSettings({ notifyOnSchedulerConflict: v })
            }
          />
          <Toggle
            label="Notify on task blocked"
            value={settings.notifyOnTaskBlocked}
            onChange={(v) => void patchSettings({ notifyOnTaskBlocked: v })}
          />
        </div>
      </section>

      <section className="rounded border border-amaco-border">
        <header className="flex items-center gap-2 border-b border-amaco-border px-3 py-2">
          <Bell className="h-3.5 w-3.5 text-amaco-accent" strokeWidth={1.5} />
          <span className="text-[13px] font-medium text-amaco-fg">
            Browser notifications
          </span>
        </header>
        <div className="flex items-center gap-3 p-3">
          <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[11px] text-amaco-fg-dim">
            {permission}
          </span>
          {permission === "default" ? (
            <button
              type="button"
              onClick={() => void requestBrowserPermission()}
              className="inline-flex items-center gap-1.5 rounded border border-amaco-accent/40 bg-amaco-accent-soft/30 px-2.5 py-1 text-[12px] text-amaco-fg hover:bg-amaco-accent-soft/50"
            >
              <Bell className="h-3.5 w-3.5" strokeWidth={1.5} />
              Allow browser notifications
            </button>
          ) : null}
          <span className="text-[11.5px] text-amaco-fg-muted">
            {permission === "granted"
              ? "Attention/critical alerts will surface as system notifications."
              : permission === "denied"
                ? "Browser denied — change permission in your browser settings."
                : permission === "unsupported"
                  ? "Browser does not support the Notifications API."
                  : "Click to allow system notifications."}
          </span>
        </div>
      </section>

      <section className="rounded border border-amaco-border">
        <header className="flex items-center gap-2 border-b border-amaco-border px-3 py-2">
          <Webhook className="h-3.5 w-3.5 text-amaco-accent" strokeWidth={1.5} />
          <span className="text-[13px] font-medium text-amaco-fg">
            Communication gateways
          </span>
        </header>
        <div className="divide-y divide-amaco-border">
          {gateways.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-amaco-fg-muted">
              No gateways configured. Run{" "}
              <span className="amaco-mono">amaco gateways list</span> for help.
            </div>
          ) : (
            gateways.map((g) => {
              const url = describeField("url", g.config);
              const token = describeField("token", g.config);
              const target = describeField("target", g.config);
              const test = testStatus[g.id];
              return (
                <div key={g.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-medium text-amaco-fg">
                      {g.displayName}
                    </span>
                    <span className="amaco-mono rounded border border-amaco-border px-1 text-[10px] text-amaco-fg-muted">
                      {g.type}
                    </span>
                    <span className="amaco-mono rounded border border-amaco-border px-1 text-[10px] text-amaco-fg-muted">
                      {g.channel}
                    </span>
                    {g.config.enabled ? (
                      <span className="amaco-mono rounded border border-amaco-success/40 px-1 text-[10px] text-amaco-success">
                        enabled
                      </span>
                    ) : (
                      <span className="amaco-mono rounded border border-amaco-border px-1 text-[10px] text-amaco-fg-muted">
                        disabled
                      </span>
                    )}
                    {g.valid ? (
                      <CheckCircle2
                        className="h-3.5 w-3.5 text-amaco-success"
                        strokeWidth={1.5}
                        aria-label="config valid"
                      />
                    ) : (
                      <AlertTriangle
                        className="h-3.5 w-3.5 text-amaco-warn"
                        strokeWidth={1.5}
                        aria-label="config invalid"
                      />
                    )}
                    {g.supportsTest ? (
                      <button
                        type="button"
                        onClick={() => void testGateway(g.id)}
                        className="ml-auto inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[11px] text-amaco-fg-dim hover:bg-amaco-panel-2"
                      >
                        <Send className="h-3 w-3" strokeWidth={1.5} />
                        Test
                      </button>
                    ) : null}
                  </div>
                  {g.validationReason ? (
                    <div className="mt-1 text-[11.5px] text-amaco-warn">
                      {g.validationReason}
                    </div>
                  ) : null}
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[11px]">
                    <FieldRow
                      label="url"
                      info={url}
                      hide={g.config.url === null}
                    />
                    <FieldRow
                      label="token"
                      info={token}
                      hide={g.config.token === null}
                    />
                    <FieldRow
                      label="target"
                      info={target}
                      hide={g.config.target === null}
                    />
                  </div>
                  {g.missingEnvVars.length > 0 ? (
                    <div className="mt-1 amaco-mono text-[10.5px] text-amaco-warn">
                      missing: {g.missingEnvVars.join(", ")}
                    </div>
                  ) : null}
                  {test ? (
                    <div
                      className={`mt-1.5 rounded border px-2 py-1 text-[11px] ${
                        test.ok
                          ? "border-amaco-success/40 bg-amaco-success/10 text-amaco-success"
                          : "border-amaco-fail/40 bg-amaco-fail/10 text-amaco-fail"
                      }`}
                    >
                      {test.message}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        <p className="border-t border-amaco-border px-3 py-2 text-[10.5px] text-amaco-fg-muted">
          Secrets stay on your machine. The dashboard never receives token or
          URL values — only whether they are set. Configure with{" "}
          <span className="amaco-mono">env:VAR_NAME</span> via the CLI or{" "}
          <span className="amaco-mono">.amaco/notifications/gateways.json</span>.
        </p>
      </section>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded border border-amaco-border bg-amaco-panel-2 px-2.5 py-1.5 text-[12px] text-amaco-fg">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5"
      />
      <span>{label}</span>
    </label>
  );
}

function FieldRow({
  label,
  info,
  hide,
}: {
  label: string;
  info: { label: string; status: "ok" | "missing" | "literal" | "none" };
  hide: boolean;
}) {
  if (hide) return null;
  const color =
    info.status === "ok"
      ? "text-amaco-success"
      : info.status === "missing"
        ? "text-amaco-warn"
        : info.status === "literal"
          ? "text-amaco-fg-dim"
          : "text-amaco-fg-muted";
  return (
    <div className="rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1">
      <div className="text-[10px] uppercase tracking-[0.12em] text-amaco-fg-muted">
        {label}
      </div>
      <div className={`amaco-mono mt-0.5 truncate text-[11px] ${color}`}>
        {info.label}
      </div>
    </div>
  );
}
