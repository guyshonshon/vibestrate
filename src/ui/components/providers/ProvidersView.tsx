import { useEffect, useState } from "react";
import {
  Check,
  Cloud,
  Download,
  Pencil,
  Play,
  Plug,
  Plus,
  Server,
  Star,
} from "lucide-react";
import { api, type ProviderRow } from "../../lib/api.js";
import type { EditorProviderConfig } from "../../lib/provider-yaml.js";
import { Button } from "../design/Button.js";
import { StatTile } from "../design/StatTile.js";
import { cn } from "../design/cn.js";
import { useToast, ToastView } from "../design/useToast.js";
import { Section } from "../layout/PageShell.js";
import { ErrorView } from "../../lib/error-view.js";
import { InstallWizard } from "./InstallWizard.js";
import { ProviderCatalogPanel } from "./ProviderCatalogPanel.js";
import { ProviderEditor, TestResultRow, type TestResult } from "./ProviderEditor.js";

type Busy = { id: string; action: "apply" | "default" | "test" } | null;

/**
 * Providers view - the dashboard mirror of `vibe provider …`, and the
 * complete provider-management surface: detect, set up, **edit
 * command/args/input**, test (with the edit→save→test loop in one place),
 * set-default, login guidance, and **remove**. Full parity with the CLI, so
 * nothing about a provider requires dropping to a terminal.
 *
 * Shell-less: this renders the provider body only; the host page (Crew's
 * Providers tab) supplies the PageShell + PageHeader around it.
 *
 * The browser never spawns commands: edits write config through the audited
 * config-update service, "test" runs the fixed safe-magic-token probe against
 * the *saved* config, and login is only ever surfaced as an instruction the
 * user runs themselves in their terminal.
 */
export function ProvidersView() {
  const [rows, setRows] = useState<ProviderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const { toast, showToast: flash } = useToast(4500);
  const [installFor, setInstallFor] = useState<ProviderRow | null>(null);
  const [editFor, setEditFor] = useState<ProviderRow | null>(null);
  // A from-scratch provider the dashboard can't auto-detect (cloud API, local
  // model server, or a hand-rolled CLI). The user names it and fills the form.
  const [createKind, setCreateKind] = useState<EditorProviderConfig["type"] | null>(null);

  async function load() {
    try {
      const r = await api.listProviders();
      setRows(r.providers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await load();
    };
    void run();
    const id = window.setInterval(run, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  async function setDefault(id: string) {
    setBusy({ id, action: "default" });
    try {
      const r = await api.setDefaultProvider(id);
      flash({ kind: "ok", text: `Set ${id} as default for ${r.profilesUpdated.length} agents.` });
      await load();
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function test(id: string) {
    setBusy({ id, action: "test" });
    try {
      const r = await api.testProvider(id);
      setTests((prev) => ({ ...prev, [id]: r }));
      if (r.ok) flash({ kind: "ok", text: `${id} responded (${r.durationMs}ms).` });
      else if (r.needsLogin) flash({ kind: "err", text: `${id} isn't logged in.` });
      else flash({ kind: "err", text: `${id} test failed (exit ${r.exitCode}).` });
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  const configuredCount = rows?.filter((r) => r.configured).length ?? 0;
  const availableCount = rows?.filter((r) => r.available).length ?? 0;
  const popularRows = rows?.filter((r) => r.kind === "cli" && r.popular) ?? [];
  const optionalRows = rows?.filter((r) => r.kind === "cli" && !r.popular) ?? [];
  // HTTP-backed providers (cloud APIs + local model servers). They only appear
  // once configured, so this section also hosts the "add" controls.
  const httpRows = rows?.filter((r) => r.kind !== "cli") ?? [];

  const renderCard = (p: ProviderRow) => {
    const t = tests[p.id];
    const statusChip = providerStatus(p);
    const isBusy = busy?.id === p.id;
    const Icon =
      p.kind === "http-api" ? Cloud : p.kind === "localhost-proxy" ? Server : Plug;
    return (
      <div
        key={p.id}
        className="flex flex-col rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4"
      >
        {/* Header: icon + name + version, with status as flat tinted text. */}
        <div className="flex items-start gap-2.5">
          <Icon size={16} className="mt-0.5 shrink-0 text-violet-soft" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-chalk-100">
                {p.label}
              </span>
              {p.recommended ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-violet-soft">
                  <Star size={11} />
                  recommended
                </span>
              ) : null}
              <span
                className={cn(
                  "shrink-0 text-[11px] font-semibold",
                  statusChip.textClass,
                )}
              >
                {statusChip.label}
              </span>
            </div>
            <div className="mono mt-0.5 flex items-center gap-1.5 text-[11px] text-chalk-400">
              <span className="truncate">{p.command}</span>
              {p.version ? (
                <span className="shrink-0 text-chalk-300">v{p.version}</span>
              ) : null}
              {p.external ? (
                <span className="shrink-0 text-amber-soft">external</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Guidance / install hint - cards clamp. */}
        {p.notes.length > 0 ? (
          <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-chalk-300">
            {p.notes.join(" ")}
          </p>
        ) : null}

        {/* Facts: which profiles bind to a configured provider, as a tile. */}
        {p.configured ? (
          <div className="mt-3 flex flex-wrap items-stretch gap-1">
            {p.profilesUsing.length > 0 ? (
              <StatTile
                value={p.profilesUsing.length}
                label={p.profilesUsing.length === 1 ? "profile uses" : "profiles use"}
                tone="emerald"
              />
            ) : (
              <StatTile value="0" label="profiles use" />
            )}
          </div>
        ) : null}
        {p.configured && p.profilesUsing.length > 0 ? (
          <p className="mt-2 text-[11.5px] text-chalk-300">
            Used by{" "}
            {p.profilesUsing.map((id, i) => (
              <span key={id}>
                {i > 0 ? ", " : ""}
                <span className="mono text-chalk-100">{id}</span>
              </span>
            ))}
          </p>
        ) : null}

        {t ? (
          <TestResultRow
            result={t}
            loginCommand={p.loginCommand}
            loginNote={p.loginNote}
          />
        ) : null}

        {/* Footer: the real provider actions, preserved verbatim. */}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-[color:var(--line-soft)] pt-3">
          {p.popular && !p.available ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Download size={13} />}
              onClick={() => setInstallFor(p)}
            >
              Install
            </Button>
          ) : null}
          {/* Set up (unconfigured) / Edit (configured) both open the editor -
              the single place to compose command/args/input, test, save. */}
          <Button
            variant={p.configured ? "outline" : "primary"}
            size="sm"
            iconLeft={p.configured ? <Pencil size={12} /> : <Plus size={13} />}
            disabled={isBusy}
            onClick={() => setEditFor(p)}
          >
            {p.configured ? "Edit" : "Set up"}
          </Button>
          {p.configured ? (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Check size={13} />}
              disabled={isBusy}
              onClick={() => setDefault(p.id)}
            >
              Set default
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            iconLeft={<Play size={12} />}
            disabled={isBusy || !p.configured}
            title={p.configured ? "Run the safe connectivity test" : "Set it up first"}
            onClick={() => test(p.id)}
          >
            {isBusy && busy?.action === "test" ? "Testing…" : "Test"}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="mb-4 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
        <div className="flex flex-wrap items-stretch gap-1.5">
          <StatTile
            value={rows ? availableCount : "-"}
            label="detected"
            size="lg"
          />
          <StatTile
            value={rows ? configuredCount : "-"}
            label="configured"
            size="lg"
            tone="emerald"
          />
        </div>
        <p className="mt-3 max-w-[74ch] text-[13px] leading-[1.55] text-chalk-300">
          Detect installed coding-agent CLIs, set up and{" "}
          <span className="text-chalk-100">edit their command/args</span>, run a
          safe connectivity test, set a default, and remove - everything{" "}
          <code className="text-violet-soft">vibe provider …</code> can do,
          here. When a provider isn't authenticated, Vibestrate shows the login
          command to run{" "}
          <span className="text-chalk-100">in your own terminal</span> - it
          never logs you in for you.
        </p>
      </div>

      {error ? <ErrorView err={error} compact onRetry={() => void load()} /> : null}

      {!rows ? (
        <Section>
          <div className="text-[13px] text-chalk-300">Detecting providers…</div>
        </Section>
      ) : (
        <>
          <Section title="Popular">
            <p className="mb-3 max-w-[74ch] text-[12.5px] leading-[1.55] text-chalk-300">
              Configured out of the box - detected and ready to bind to a run.
            </p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {popularRows.map((p) => renderCard(p))}
            </div>
          </Section>

          {optionalRows.length > 0 ? (
            <Section title="Optional">
              <p className="mb-3 max-w-[74ch] text-[12.5px] leading-[1.55] text-chalk-300">
                Opt-in, not auto-configured. Detected but never auto-bound. Set
                one up to wire it into this project, then test it like any other
                provider.
              </p>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {optionalRows.map((p) => renderCard(p))}
              </div>
            </Section>
          ) : null}

          <Section
            title="Cloud APIs & local model servers"
            action={
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Cloud size={13} />}
                  onClick={() => setCreateKind("http-api")}
                >
                  Add cloud API
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Server size={13} />}
                  onClick={() => setCreateKind("localhost-proxy")}
                >
                  Add local server
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<Plus size={13} />}
                  onClick={() => setCreateKind("cli")}
                >
                  Custom CLI
                </Button>
              </div>
            }
          >
            <p className="mb-3 max-w-[74ch] text-[12.5px] leading-[1.55] text-chalk-300">
              Drive a model over HTTP instead of a CLI. Cloud APIs use{" "}
              <span className="text-chalk-100">your own key</span> (an env
              reference, never stored in config) over https; local servers
              (Ollama, LM Studio, vLLM) stay on{" "}
              <span className="text-chalk-100">localhost - no egress</span>.
            </p>
            {httpRows.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {httpRows.map((p) => renderCard(p))}
              </div>
            ) : (
              <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-6 py-8 text-center">
                <p className="text-[13px] text-chalk-300">
                  No cloud APIs or local servers yet. Add one to drive a model
                  over HTTP.
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<Cloud size={13} />}
                    onClick={() => setCreateKind("http-api")}
                  >
                    Add cloud API
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<Server size={13} />}
                    onClick={() => setCreateKind("localhost-proxy")}
                  >
                    Add local server
                  </Button>
                </div>
              </div>
            )}
          </Section>

          <ProviderCatalogPanel />
        </>
      )}

      {installFor ? (
        <InstallWizard
          provider={rows?.find((r) => r.id === installFor.id) ?? installFor}
          onClose={() => setInstallFor(null)}
          onRecheck={async () => {
            await load();
          }}
        />
      ) : null}

      {editFor ? (
        <ProviderEditor
          provider={rows?.find((r) => r.id === editFor.id) ?? editFor}
          onClose={() => setEditFor(null)}
          onChanged={async (text) => {
            await load();
            if (text) flash({ kind: "ok", text });
          }}
          onError={(text) => flash({ kind: "err", text })}
        />
      ) : null}

      {createKind ? (
        <ProviderEditor
          createKind={createKind}
          existingIds={rows?.map((r) => r.id) ?? []}
          onClose={() => setCreateKind(null)}
          onChanged={async (text) => {
            await load();
            if (text) flash({ kind: "ok", text });
          }}
          onError={(text) => flash({ kind: "err", text })}
        />
      ) : null}

      <ToastView toast={toast} />
    </>
  );
}

function providerStatus(p: ProviderRow): { textClass: string; label: string } {
  if (p.configured) return { textClass: "text-emerald-400", label: "configured" };
  if (!p.available) return { textClass: "text-chalk-400", label: "not installed" };
  return { textClass: "text-sky-glow", label: "detected" };
}
