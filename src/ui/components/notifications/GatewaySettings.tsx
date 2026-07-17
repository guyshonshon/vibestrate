import { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { Button } from "../design/Button.js";
import { Chip } from "../design/Chip.js";
import type { ChipTone } from "../design/Chip.js";
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
      <div className="px-4 py-6 text-[12px] text-chalk-400">Loading…</div>
    );
  }
  if (error && !settings) {
    return <div className="px-4 py-6 text-[12px] text-rose-300">{error}</div>;
  }
  if (!settings) return null;

  const permTone: ChipTone =
    permission === "granted"
      ? "emerald"
      : permission === "denied"
        ? "rose"
        : "neutral";

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      {error ? (
        <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      ) : null}

      <section
        id="notification-routing"
        className="rounded-[16px] border border-[color:var(--line)] bg-coal-600"
      >
        <header className="flex items-center gap-2 border-b border-[color:var(--line)] px-3 py-2">
          <Bell className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} />
          <span className="text-[13px] font-medium text-chalk-100">
            Notification routing
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refresh()}
            title="Refresh"
            className="ml-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.9} />
          </Button>
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

      <section className="rounded-[16px] border border-[color:var(--line)] bg-coal-600">
        <header className="flex items-center gap-2 border-b border-[color:var(--line)] px-3 py-2">
          <Bell className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} />
          <span className="text-[13px] font-medium text-chalk-100">
            Browser notifications
          </span>
        </header>
        <div className="flex items-center gap-3 p-3">
          <Chip contained tone={permTone}>
            {permission}
          </Chip>
          {permission === "default" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void requestBrowserPermission()}
              iconLeft={<Bell className="h-3.5 w-3.5" strokeWidth={1.9} />}
            >
              Allow browser notifications
            </Button>
          ) : null}
          <span className="text-[11.5px] text-chalk-300">
            {permission === "granted"
              ? "Attention/critical alerts will surface as system notifications."
              : permission === "denied"
                ? "Browser denied - change permission in your browser settings."
                : permission === "unsupported"
                  ? "Browser does not support the Notifications API."
                  : "Click to allow system notifications."}
          </span>
        </div>
      </section>

      <section className="rounded-[16px] border border-[color:var(--line)] bg-coal-600">
        <header className="flex items-center gap-2 border-b border-[color:var(--line)] px-3 py-2">
          <Bell className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} />
          <span className="text-[13px] font-medium text-chalk-100">
            Notification gateways
          </span>
        </header>
        <div className="divide-y divide-[color:var(--line)]">
          {gateways.length === 0 ? (
            // Defensive only: the built-in registry always ships in-app + cli,
            // so this list is never actually empty today. If it ever were, the
            // real fix lives above (this component's own routing toggles), not
            // on the Config page - gateway delivery config lives in
            // .vibestrate/notifications/gateways.json, a separate store from
            // project.yml, so Config has no matching fields to link to.
            <div className="flex flex-col items-start gap-2.5 px-3 py-4">
              <p className="text-[12px] text-chalk-300">
                No gateways configured. Turn on CLI or in-app delivery above to
                start routing notifications.
              </p>
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Bell className="h-3.5 w-3.5" strokeWidth={1.9} />}
                onClick={() =>
                  document
                    .getElementById("notification-routing")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                Configure delivery
              </Button>
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
                    <span className="text-[12.5px] font-medium text-chalk-100">
                      {g.displayName}
                    </span>
                    <Chip contained tone="neutral">
                      {g.type}
                    </Chip>
                    <Chip contained tone="neutral">
                      {g.channel}
                    </Chip>
                    {g.config.enabled ? (
                      <Chip contained tone="emerald">
                        enabled
                      </Chip>
                    ) : (
                      <Chip contained tone="neutral">
                        disabled
                      </Chip>
                    )}
                    {g.valid ? (
                      <CheckCircle2
                        className="h-3.5 w-3.5 text-emerald"
                        strokeWidth={1.9}
                        aria-label="config valid"
                      />
                    ) : (
                      <AlertTriangle
                        className="h-3.5 w-3.5 text-amber-soft"
                        strokeWidth={1.9}
                        aria-label="config invalid"
                      />
                    )}
                    {g.supportsTest ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!g.valid}
                        onClick={() => void testGateway(g.id)}
                        title={
                          g.valid
                            ? "Send a probe through this gateway"
                            : "Configure the gateway first to enable testing"
                        }
                        iconLeft={<Send className="h-3 w-3" strokeWidth={1.9} />}
                        className="ml-auto"
                      >
                        Test
                      </Button>
                    ) : null}
                  </div>
                  {g.validationReason ? (
                    <div className="mt-1 text-[11.5px] text-amber-soft">
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
                    <div className="mono mt-1 text-[10.5px] text-amber-soft">
                      missing: {g.missingEnvVars.join(", ")}
                    </div>
                  ) : null}
                  {test ? (
                    <div
                      className={`mt-1.5 rounded-[10px] border px-2 py-1 text-[11px] ${
                        test.ok
                          ? "border-emerald/30 bg-emerald/10 text-emerald"
                          : "border-rose-400/30 bg-rose-500/10 text-rose-300"
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
        <p className="border-t border-[color:var(--line)] px-3 py-2 text-[10.5px] text-chalk-400">
          Secrets stay on your machine. The dashboard never receives token or
          URL values - only whether they are set. Configure with{" "}
          <span className="mono text-chalk-300">env:VAR_NAME</span> via the CLI or{" "}
          <span className="mono text-chalk-300">.vibestrate/notifications/gateways.json</span>.
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
    <label className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-[color:var(--line)] bg-coal-500 px-2.5 py-1.5 text-[12px] text-chalk-100">
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
      ? "text-emerald"
      : info.status === "missing"
        ? "text-amber-soft"
        : info.status === "literal"
          ? "text-chalk-300"
          : "text-chalk-400";
  return (
    <div className="rounded-[10px] border border-[color:var(--line)] bg-coal-500 px-2 py-1">
      <div className="text-[10px] font-semibold text-chalk-400">{label}</div>
      <div className={`mono mt-0.5 truncate text-[11px] ${color}`}>
        {info.label}
      </div>
    </div>
  );
}
