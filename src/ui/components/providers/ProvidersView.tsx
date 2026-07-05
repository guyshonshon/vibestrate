import { useEffect, useState } from "react";
import {
  Check,
  Cloud,
  Copy,
  Download,
  GripVertical,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Server,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { api, type ProviderRow } from "../../lib/api.js";
import type { ProviderCatalogResponse } from "../../lib/types.js";
import { stringify as stringifyYaml } from "yaml";
import {
  extractProviderConfigFromYaml,
  parseArgs,
  renderProviderYaml,
  type EditorProviderConfig,
} from "../../lib/provider-yaml.js";
import { applyOrder, reorderByDrop } from "../../lib/reorder.js";
import { usePersistedState } from "../../lib/usePersistedState.js";
import { setDragGhost } from "../../lib/drag-ghost.js";
import { Button } from "../design/Button.js";
import { Chip, type ChipTone } from "../design/Chip.js";
import { StatTile } from "../design/StatTile.js";
import { cn } from "../design/cn.js";
import { LockToggle } from "./LockToggle.js";
import { Section } from "../layout/PageShell.js";

/** The CLI sections whose rows can be drag-reordered (a client-side preference). */
type ReorderSection = "popular" | "optional";

type TestResult = Awaited<ReturnType<typeof api.testProvider>>;
type Busy = { id: string; action: "apply" | "default" | "test" } | null;
type Toast = { kind: "ok" | "err"; text: string } | null;

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
  const [toast, setToast] = useState<Toast>(null);
  const [installFor, setInstallFor] = useState<ProviderRow | null>(null);
  const [editFor, setEditFor] = useState<ProviderRow | null>(null);
  // A from-scratch provider the dashboard can't auto-detect (cloud API, local
  // model server, or a hand-rolled CLI). The user names it and fills the form.
  const [createKind, setCreateKind] = useState<EditorProviderConfig["type"] | null>(null);

  // Drag-to-reorder + lock are a purely local view preference (providers bind
  // to runs via profiles, not list position), so they live in localStorage -
  // no config write, no server round-trip. `order` holds the user's per-section
  // sequence; `lockedIds` are rows pinned out of the drag (a locked row can't be
  // picked up). `dragId`/`overId` are transient drag-in-flight state.
  const [order, setOrder] = usePersistedState<Partial<Record<ReorderSection, string[]>>>(
    "vibestrate.providers.order",
    {},
  );
  const [lockedIds, setLockedIds] = usePersistedState<string[]>(
    "vibestrate.providers.locked",
    [],
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const isLocked = (id: string) => lockedIds.includes(id);
  const toggleLock = (id: string) =>
    setLockedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const reorder = (section: ReorderSection, ids: string[], target: string) => {
    if (!dragId) return;
    setOrder((prev) => ({ ...prev, [section]: reorderByDrop(ids, dragId, target) }));
  };

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

  function flash(t: Toast) {
    setToast(t);
    window.setTimeout(() => setToast(null), 4500);
  }

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
  // Apply the saved drag preference to the two CLI sections (HTTP rows aren't
  // reorderable - they're a small, config-driven set).
  const orderedPopular = applyOrder(popularRows, order.popular ?? []);
  const orderedOptional = applyOrder(optionalRows, order.optional ?? []);
  const popularIds = orderedPopular.map((r) => r.id);
  const optionalIds = orderedOptional.map((r) => r.id);

  const renderRow = (
    p: ProviderRow,
    dnd?: { section: ReorderSection; ids: string[] },
  ) => {
    const t = tests[p.id];
    const statusChip = providerStatus(p);
    const isBusy = busy?.id === p.id;
    const Icon =
      p.kind === "http-api" ? Cloud : p.kind === "localhost-proxy" ? Server : Plug;
    const locked = isLocked(p.id);
    const isDragging = dragId === p.id;
    const isDropTarget = dnd != null && overId === p.id && dragId !== p.id;
    return (
      <div
        key={p.id}
        onDragOver={
          dnd
            ? (e) => {
                if (!dragId || dragId === p.id) return;
                e.preventDefault();
                setOverId(p.id);
              }
            : undefined
        }
        onDragLeave={
          dnd ? () => setOverId((o) => (o === p.id ? null : o)) : undefined
        }
        onDrop={
          dnd
            ? (e) => {
                e.preventDefault();
                reorder(dnd.section, dnd.ids, p.id);
                setDragId(null);
                setOverId(null);
              }
            : undefined
        }
        className={cn(
          "rounded-[18px] border bg-coal-600 px-4 py-3.5 transition",
          isDropTarget
            ? "border-violet-soft/60 ring-1 ring-violet-soft/40"
            : "border-[color:var(--line)]",
          isDragging && "opacity-50",
        )}
      >
        <div className="flex items-start gap-3">
          {dnd ? (
            <span
              draggable={!locked}
              onDragStart={(e) => {
                if (locked) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", p.id);
                setDragGhost(e.dataTransfer, p.label);
                setDragId(p.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              title={locked ? "Locked - unlock to reorder" : "Drag to reorder"}
              className={cn(
                "mt-1 grid h-6 w-5 shrink-0 place-items-center rounded text-chalk-400",
                locked
                  ? "cursor-not-allowed opacity-30"
                  : "cursor-grab hover:text-chalk-200 active:cursor-grabbing",
              )}
            >
              <GripVertical size={15} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <Icon size={15} className="text-violet-soft shrink-0" />
              <span className="text-[15px] text-chalk-100 font-medium">
                {p.label}
              </span>
              <span className="mono text-[11.5px] text-chalk-400">
                {p.command}
                {p.version ? ` v${p.version}` : ""}
              </span>
              <Chip tone={statusChip.tone}>{statusChip.label}</Chip>
              {p.external ? (
                <Chip tone="amber">external</Chip>
              ) : null}
              {p.recommended ? (
                <Chip tone="violet">
                  <Star size={10} className="inline -mt-px mr-1" />
                  recommended
                </Chip>
              ) : null}
            </div>
            {p.notes.length > 0 ? (
              <ul className="mt-2 space-y-0.5">
                {p.notes.map((n, i) => (
                  <li key={i} className="text-[12px] text-chalk-300 leading-snug">
                    {n}
                  </li>
                ))}
              </ul>
            ) : null}
            {p.configured ? (
              <div className="mt-2 text-[11.5px] text-chalk-400">
                {p.profilesUsing.length > 0 ? (
                  <>
                    Used by{" "}
                    {p.profilesUsing.map((id, i) => (
                      <span key={id}>
                        {i > 0 ? ", " : ""}
                        <span className="mono text-chalk-300">{id}</span>
                      </span>
                    ))}{" "}
                    {p.profilesUsing.length === 1 ? "profile" : "profiles"}.
                  </>
                ) : (
                  <span className="text-chalk-400">
                    No profiles run on this provider yet.
                  </span>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {dnd ? (
              <LockToggle locked={locked} onToggle={() => toggleLock(p.id)} />
            ) : null}
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
              iconLeft={
                p.configured ? <Pencil size={12} /> : <Plus size={13} />
              }
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

        {t ? <TestResultRow result={t} loginCommand={p.loginCommand} loginNote={p.loginNote} /> : null}
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

      {error ? <ErrorBanner text={error} /> : null}

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
            <div className="space-y-3">
              {orderedPopular.map((p) =>
                renderRow(p, { section: "popular", ids: popularIds }),
              )}
            </div>
          </Section>

          {optionalRows.length > 0 ? (
            <Section title="Optional">
              <p className="mb-3 max-w-[74ch] text-[12.5px] leading-[1.55] text-chalk-300">
                Opt-in, not auto-configured. Detected but never auto-bound. Set
                one up to wire it into this project, then test it like any other
                provider. Drag the handle to reorder, or lock a row to pin it.
              </p>
              <div className="space-y-3">
                {orderedOptional.map((p) =>
                  renderRow(p, { section: "optional", ids: optionalIds }),
                )}
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
              <div className="space-y-3">{httpRows.map((p) => renderRow(p))}</div>
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

      {toast ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[12.5px] shadow-2xl",
            toast.kind === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/30 bg-rose-500/10 text-rose-200",
          )}
        >
          {toast.kind === "ok" ? (
            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          )}
          {toast.text}
        </div>
      ) : null}
    </>
  );
}

/** Inline page-level error banner in the new idiom. */
function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="mb-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
      {text}
    </div>
  );
}

function providerStatus(p: ProviderRow): { tone: ChipTone; label: string } {
  if (p.configured) return { tone: "emerald", label: "configured" };
  if (!p.available) return { tone: "neutral", label: "not installed" };
  return { tone: "sky", label: "detected" };
}

/**
 * Capability catalog - the in-UI mirror of `vibe provider catalog`. Shows the
 * model/effort knobs the Profile editor offers per provider, where each came
 * from (built-in vs your `.vibestrate/providers-catalog.yml` overlay), and the
 * overlay's status. Read-only: the overlay is hand-authored (auto-probe is a
 * planned, opt-in step), so this surfaces it rather than editing it.
 */
function ProviderCatalogPanel() {
  const [data, setData] = useState<ProviderCatalogResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .getProviderCatalog()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        /* non-critical panel; stay hidden on error */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      const r = await api.refreshProviderCatalog({});
      const updated = r.findings.filter((f) => f.status === "added");
      const failed = r.findings.filter((f) => f.status === "probe-failed");
      const deltas = updated
        .filter((f) => (f.added?.length ?? 0) > 0 || (f.removed?.length ?? 0) > 0)
        .map((f) => {
          const a = f.added?.length ? `+${f.added.join(", ")}` : "";
          const rem = f.removed?.length ? `-${f.removed.join(", ")}` : "";
          return `${f.providerId}: ${[a, rem].filter(Boolean).join(" ")}`;
        });
      setNote(
        failed.length > 0
          ? `Detected ${updated.length}; ${failed.length} failed - ${failed[0]!.providerId}: ${failed[0]!.detail ?? "probe failed"}`
          : deltas.length > 0
            ? `Detected real models - ${deltas.join(" · ")}`
            : updated.length > 0
              ? `Updated ${updated.length} provider(s) from their real catalog.`
              : "No changes - built-in + your overlay already match what the providers report.",
      );
      setData(await api.getProviderCatalog());
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  // Only show providers that actually expose a knob (or are overlaid) - hides
  // the many CLIs with no model/effort spec, which would just be noise.
  const ids = Object.keys(data.catalog)
    .filter((id) => {
      const c = data.catalog[id]!;
      return c.models.length > 0 || c.powerLevels.length > 0 || data.sources[id] === "overlay";
    })
    .sort();

  return (
    <Section
      title="Capability catalog"
      action={
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<RefreshCw size={13} />}
          disabled={busy}
          title="Detect each provider's real models/efforts (codex `debug models`, else --help) and write them to the overlay (local only)"
          onClick={() => void refresh()}
        >
          {busy ? "Detecting…" : "Refresh from providers"}
        </Button>
      }
    >
      <p className="mb-3 max-w-[74ch] text-[12.5px] leading-[1.55] text-chalk-300">
        Models & effort per provider - the model and effort knobs the Profile
        editor offers, built-in plus your overlay.{" "}
        <code className="text-violet-soft">vibe provider catalog</code> shows the
        same.
      </p>

      {note ? (
        <div className="mb-3 rounded-[12px] border border-[color:var(--line)] bg-coal-500/60 px-3 py-2 text-[12px] text-chalk-300">
          {note}
        </div>
      ) : null}

      <div className="mb-3 text-[12px]">
        {data.overlay.present ? (
          <span className="inline-flex items-center gap-2">
            <Chip tone="violet">overlay active</Chip>
            <code className="mono text-[11.5px] text-chalk-400">
              {data.overlay.path}
            </code>
          </span>
        ) : (
          <span className="text-chalk-400">
            No overlay. Create{" "}
            <code className="mono text-chalk-300">{data.overlay.path}</code> to
            add or refine a provider's models / effort.
          </span>
        )}
      </div>

      <div className="space-y-2">
        {ids.map((id) => {
          const c = data.catalog[id]!;
          const overlaid = data.sources[id] === "overlay";
          return (
            <div
              key={id}
              className="rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="mono text-[13.5px] font-medium text-chalk-100">
                  {id}
                </span>
                <Chip tone={overlaid ? "violet" : "neutral"}>
                  {overlaid ? "overlay" : "built-in"}
                </Chip>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-chalk-300">
                <span>
                  <span className="text-chalk-400">models </span>
                  {c.models.length ? (
                    <span className="mono text-chalk-200">
                      {c.models.join(", ")}
                    </span>
                  ) : (
                    <span className="text-chalk-400">
                      {c.modelEnabled ? "free-text" : "n/a"}
                    </span>
                  )}
                </span>
                <span>
                  <span className="text-chalk-400">effort </span>
                  {c.powerLevels.length ? (
                    <span className="mono text-chalk-200">
                      {c.powerLevels.join(" / ")}
                    </span>
                  ) : (
                    <span className="text-chalk-400">none</span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** Local mirror of the server's env-ref rule (provider-schema.ts). Validated
 *  client-side for a fast hint; the server enforces it on write regardless. */
const ENV_REF_RE = /^env:[A-Z][A-Z0-9_]*$/;

type ApiName = "anthropic" | "openai" | "ollama";
type ProviderKind = EditorProviderConfig["type"];

function defaultBaseUrl(kind: ProviderKind, api: ApiName): string {
  if (kind === "http-api") {
    return api === "anthropic"
      ? "https://api.anthropic.com"
      : "https://api.openai.com/v1";
  }
  if (kind === "localhost-proxy") {
    return api === "ollama" ? "http://localhost:11434" : "http://localhost:1234/v1";
  }
  return "";
}

function defaultModel(api: ApiName): string {
  if (api === "anthropic") return "claude-sonnet-4-6";
  if (api === "ollama") return "qwen3.5";
  return "gpt-4o";
}

function parseHeaders(text: string): { value?: Record<string, string>; error?: string } {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const idx = t.indexOf(":");
    if (idx <= 0) return { error: `Header line "${t}" must be "Name: value".` };
    out[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
  }
  return { value: out };
}

/**
 * The complete create/edit/test/remove loop for one provider - the in-UI
 * equivalent of `vibe provider setup` + `vibe provider test` + `vibe provider
 * remove`, for **every** provider type: CLI (command/args/input), cloud
 * `http-api` (api/baseUrl/model/key), and `localhost-proxy` model servers.
 * Previews the exact YAML and offers "Save & test" so the loop lives in one
 * place.
 *
 * Secrets never enter config: a cloud API key is captured as an env reference
 * (`env:NAME`) only - never a literal. The browser still spawns nothing; the
 * safe-test runs against the *saved* config server-side.
 */
function ProviderEditor({
  provider: p,
  createKind,
  existingIds,
  onClose,
  onChanged,
  onError,
}: {
  /** Edit an existing provider. Omit (with `createKind`) to create a new one. */
  provider?: ProviderRow;
  /** Create a brand-new provider of this type (the dashboard can't detect
   *  cloud/local-server/custom providers, so the user names + fills it). */
  createKind?: ProviderKind;
  existingIds?: string[];
  onClose: () => void;
  onChanged: (toast?: string) => Promise<void> | void;
  onError: (text: string) => void;
}) {
  const isNew = !p;
  const kind: ProviderKind = p ? p.kind : createKind!;
  const initialApi: ApiName =
    kind === "http-api" ? "anthropic" : kind === "localhost-proxy" ? "ollama" : "openai";

  const [id, setId] = useState(p?.id ?? "");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [input, setInput] = useState<"stdin" | "arg">("stdin");
  const [apiName, setApiName] = useState<ApiName>(initialApi);
  const [baseUrl, setBaseUrl] = useState(() =>
    isNew ? defaultBaseUrl(kind, initialApi) : "",
  );
  const [model, setModel] = useState(() => (isNew ? defaultModel(initialApi) : ""));
  const [apiKey, setApiKey] = useState(() =>
    isNew && kind === "http-api" ? "env:ANTHROPIC_API_KEY" : "",
  );
  const [maxTokens, setMaxTokens] = useState("4096");
  const [headersText, setHeadersText] = useState("");
  const [profilesUsing, setProfilesUsing] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState<null | "save" | "saveTest" | "remove">(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Advanced escape hatch: edit the provider's raw YAML directly, so anything
  // the form doesn't model (env, claude-code settings, extraArgs, custom
  // headers) is still editable in the UI - never a trip to the CLI. `rawConfig`
  // is the full fetched config so seeding the editor doesn't drop those fields.
  const [yamlMode, setYamlMode] = useState(false);
  const [yamlText, setYamlText] = useState("");
  const [rawConfig, setRawConfig] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (isNew || !p) return;
    let cancelled = false;
    setLoading(true);
    void api
      .getProviderConfig(p.id)
      .then((r) => {
        if (cancelled) return;
        const c = r.config;
        setRawConfig(c as unknown as Record<string, unknown>);
        if (c.type === "http-api" || c.type === "localhost-proxy") {
          setApiName(c.api);
          setBaseUrl(c.baseUrl);
          setModel(c.model);
          setApiKey("apiKey" in c && c.apiKey ? c.apiKey : "");
          setMaxTokens(String(c.maxTokens));
          if (c.type === "http-api" && c.headers) {
            setHeadersText(
              Object.entries(c.headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n"),
            );
          }
        } else {
          setCommand(c.command);
          setArgs(c.args.join(" "));
          setInput(c.input);
        }
        setProfilesUsing(r.profilesUsing);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);
        onError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  const idForSave = (isNew ? id.trim() : p!.id) || "";

  // Build the typed config from the form; `error` is shown only on submit.
  const built: { config?: EditorProviderConfig; error?: string } = (() => {
    if (kind === "cli") {
      if (!command.trim()) return { error: "Command is required." };
      return {
        config: { type: "cli", command: command.trim(), args: parseArgs(args), input },
      };
    }
    const mt = Number.parseInt(maxTokens, 10);
    if (!Number.isFinite(mt) || mt <= 0) return { error: "maxTokens must be a positive number." };
    if (!baseUrl.trim()) return { error: "baseUrl is required." };
    if (!model.trim()) return { error: "model is required." };
    if (kind === "http-api") {
      if (!ENV_REF_RE.test(apiKey.trim()))
        return { error: "API key must be an env reference like env:ANTHROPIC_API_KEY - never a literal key." };
      const headers = parseHeaders(headersText);
      if (headers.error) return { error: headers.error };
      const hasHeaders = headers.value && Object.keys(headers.value).length > 0;
      return {
        config: {
          type: "http-api",
          api: apiName as "anthropic" | "openai",
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          apiKey: apiKey.trim(),
          maxTokens: mt,
          ...(hasHeaders ? { headers: headers.value } : {}),
        },
      };
    }
    if (apiKey.trim() && !ENV_REF_RE.test(apiKey.trim()))
      return { error: "API key, if set, must be an env reference like env:NAME." };
    return {
      config: {
        type: "localhost-proxy",
        api: apiName as "openai" | "ollama",
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        maxTokens: mt,
      },
    };
  })();

  const yamlPreview = built.config
    ? renderProviderYaml(idForSave || "<id>", built.config)
    : "# fill in the fields above to preview the YAML";

  const idValid = !isNew || /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(idForSave);
  const canSubmit =
    idForSave.length > 0 &&
    idValid &&
    (yamlMode ? yamlText.trim().length > 0 : !!built.config);

  // Seed the YAML editor from the real config (existing) or the form (new), so
  // env / settings / extraArgs survive a round-trip through Advanced mode.
  const toggleYamlMode = (): void => {
    setYamlMode((on) => {
      if (!on) {
        const cfg = rawConfig ?? built.config ?? {};
        setYamlText(stringifyYaml({ providers: { [idForSave || "provider"]: cfg } }));
      }
      return !on;
    });
  };

  async function save(): Promise<boolean> {
    if (isNew && !idValid) {
      onError("Provider id must start with a letter; letters/digits/dash/underscore only.");
      return false;
    }
    if (isNew && existingIds?.includes(idForSave)) {
      onError(`A provider named "${idForSave}" already exists.`);
      return false;
    }
    let config: EditorProviderConfig | Record<string, unknown>;
    if (yamlMode) {
      const extracted = extractProviderConfigFromYaml(yamlText, idForSave);
      if (!extracted.config) {
        onError(extracted.error ?? "Invalid provider YAML.");
        return false;
      }
      config = extracted.config;
    } else {
      if (!built.config) {
        onError(built.error ?? "Invalid provider config.");
        return false;
      }
      config = built.config;
    }
    try {
      await api.setupProvider(idForSave, { config });
      return true;
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async function onSave() {
    setBusy("save");
    const ok = await save();
    setBusy(null);
    if (ok) {
      await onChanged(`Saved ${idForSave} to project.yml.`);
      onClose();
    }
  }

  async function onSaveTest() {
    setBusy("saveTest");
    setResult(null);
    const ok = await save();
    if (!ok) {
      setBusy(null);
      return;
    }
    await onChanged();
    try {
      const r = await api.testProvider(idForSave);
      setResult(r);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    if (!p) return;
    setBusy("remove");
    try {
      await api.removeProvider(p.id);
      await onChanged(`Removed ${p.id} from project.yml.`);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      setBusy(null);
      setConfirmRemove(false);
    }
  }

  const anyBusy = busy !== null;
  const modalKind = isNew
    ? kind === "http-api"
      ? "Add cloud API provider"
      : kind === "localhost-proxy"
        ? "Add local model server"
        : "Add custom CLI provider"
    : p!.configured
      ? "Edit provider"
      : "Set up provider";
  const headerTitle = isNew ? id || "new provider" : p!.label;
  const apiOptions: ApiName[] =
    kind === "http-api" ? ["anthropic", "openai"] : ["openai", "ollama"];

  function onApiChange(next: ApiName) {
    setApiName(next);
    // In create mode, follow the destination defaults as the user switches.
    if (isNew) {
      setBaseUrl(defaultBaseUrl(kind, next));
      setModel(defaultModel(next));
      if (kind === "http-api") {
        setApiKey(next === "anthropic" ? "env:ANTHROPIC_API_KEY" : "env:OPENAI_API_KEY");
      }
    }
  }

  const inputCls =
    "mono w-full h-9 rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 text-[12.5px] text-chalk-100 placeholder:text-chalk-400 focus:outline-none focus:border-violet-soft/50";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${modalKind} ${headerTitle}`}
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 font-jakarta"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[620px] rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-violet-vivid">
              {modalKind}
            </div>
            <h2 className="mt-0.5 text-[19px] font-extrabold tracking-[-0.02em] text-chalk-100">
              {headerTitle}
            </h2>
            <div className="mono mt-1 flex flex-wrap items-center gap-2 text-[11px] text-chalk-400">
              {!isNew ? <span>{p!.id}</span> : null}
              {!isNew ? <span className="text-chalk-400">·</span> : null}
              {kind === "cli" ? (
                <span className={p?.available ? "text-emerald-400" : "text-amber-soft"}>
                  {p?.available ? "CLI detected" : "CLI not detected"}
                </span>
              ) : kind === "http-api" ? (
                <span className="text-amber-soft">external · egress over https</span>
              ) : (
                <span className="text-emerald-400">local only · no egress</span>
              )}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            iconLeft={<X size={13} />}
          >
            Close
          </Button>
        </div>

        {loading ? (
          <div className="mt-5 text-[13px] text-chalk-300">Loading config…</div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-2.5">
              {isNew ? (
                <FormField label="provider id">
                  <input
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder={kind === "http-api" ? "anthropic-cloud" : kind === "localhost-proxy" ? "ollama-local" : "myagent"}
                    className={inputCls}
                  />
                </FormField>
              ) : null}

              {kind === "cli" ? (
                <>
                  <FormField label="command">
                    <input
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder={idForSave || "my-cli"}
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="args">
                    <input
                      value={args}
                      onChange={(e) => setArgs(e.target.value)}
                      placeholder='space-separated · e.g. "exec"'
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="input">
                    <div className="inline-flex rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 p-[2px]">
                      {(["stdin", "arg"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setInput(mode)}
                          className={cn(
                            "mono h-[26px] rounded-[8px] px-3 text-[11.5px] font-medium transition",
                            input === mode
                              ? "bg-coal-500 text-chalk-100"
                              : "text-chalk-300 hover:text-chalk-100",
                          )}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </FormField>
                </>
              ) : (
                <>
                  <FormField label="api (wire protocol)">
                    <div className="inline-flex rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 p-[2px]">
                      {apiOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => onApiChange(opt)}
                          className={cn(
                            "mono h-[26px] rounded-[8px] px-3 text-[11.5px] font-medium transition",
                            apiName === opt
                              ? "bg-coal-500 text-chalk-100"
                              : "text-chalk-300 hover:text-chalk-100",
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </FormField>
                  <FormField label="baseUrl">
                    <input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder={defaultBaseUrl(kind, apiName)}
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="model">
                    <input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={defaultModel(apiName)}
                      className={inputCls}
                    />
                  </FormField>
                  <FormField
                    label={kind === "http-api" ? "api key (env reference)" : "api key (optional, env reference)"}
                  >
                    <input
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="env:ANTHROPIC_API_KEY"
                      className={inputCls}
                    />
                    <p className="mt-1 text-[10.5px] text-chalk-400">
                      An <span className="text-chalk-300">env reference</span> like{" "}
                      <code className="text-violet-soft">env:NAME</code> - the key
                      stays in your environment, never in config.
                    </p>
                  </FormField>
                  <FormField label="maxTokens">
                    <input
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(e.target.value)}
                      inputMode="numeric"
                      placeholder="4096"
                      className={inputCls}
                    />
                  </FormField>
                  {kind === "http-api" ? (
                    <FormField label="headers (optional · one per line, Name: value)">
                      <textarea
                        value={headersText}
                        onChange={(e) => setHeadersText(e.target.value)}
                        rows={2}
                        spellCheck={false}
                        placeholder="anthropic-beta: prompt-caching-2024-07-31"
                        className="mono w-full resize-y rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[12px] text-chalk-100 placeholder:text-chalk-400 focus:outline-none focus:border-violet-soft/50"
                      />
                    </FormField>
                  ) : null}
                </>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[12px] font-semibold text-violet-vivid">
                  {yamlMode
                    ? "Advanced - raw provider YAML"
                    : "YAML written to .vibestrate/project.yml"}
                </span>
                <button
                  type="button"
                  onClick={toggleYamlMode}
                  className="text-[12.5px] font-semibold text-violet-soft transition hover:text-violet-soft/80"
                >
                  {yamlMode ? "Back to form" : "Edit as YAML"}
                </button>
              </div>
              {yamlMode ? (
                <>
                  <textarea
                    value={yamlText}
                    onChange={(e) => setYamlText(e.target.value)}
                    spellCheck={false}
                    rows={Math.min(22, Math.max(8, yamlText.split("\n").length + 1))}
                    className="mono w-full resize-y rounded-[12px] border border-violet-soft/40 bg-coal-800 px-3 py-2.5 text-[11.5px] text-chalk-100 focus:border-violet-soft/60 focus:outline-none"
                  />
                  <div className="mt-1.5 text-[11px] leading-relaxed text-chalk-400">
                    Edit the whole block, so anything the form doesn't surface is
                    still yours to set here:{" "}
                    <span className="mono text-chalk-300">env</span>, claude-code{" "}
                    <span className="mono text-chalk-300">settings</span>,{" "}
                    <span className="mono text-chalk-300">extraArgs</span>, custom
                    headers. Keep the{" "}
                    <span className="mono text-chalk-300">
                      providers: {idForSave || "<id>"}:
                    </span>{" "}
                    shape - it's validated on save.
                  </div>
                </>
              ) : (
                <pre className="mono overflow-x-auto whitespace-pre rounded-[12px] border border-[color:var(--line)] bg-coal-800 px-3 py-2.5 text-[11.5px] text-chalk-200">
                  {yamlPreview}
                </pre>
              )}
              {profilesUsing.length > 0 ? (
                <div className="mt-2 text-[11px] text-chalk-400">
                  Used by role{profilesUsing.length === 1 ? "" : "s"}:{" "}
                  <span className="mono text-chalk-300">
                    {profilesUsing.join(", ")}
                  </span>
                </div>
              ) : null}
            </div>

            {result ? (
              <TestResultRow
                result={result}
                loginCommand={p?.loginCommand ?? null}
                loginNote={p?.loginNote ?? ""}
              />
            ) : null}

            <div className="mt-5 flex items-center gap-2 flex-wrap">
              <Button
                variant="primary"
                size="sm"
                disabled={anyBusy || !canSubmit}
                iconLeft={<Play size={12} />}
                onClick={() => void onSaveTest()}
              >
                {busy === "saveTest" ? "Saving & testing…" : "Save & test"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={anyBusy || !canSubmit}
                onClick={() => void onSave()}
              >
                {busy === "save" ? "Saving…" : "Save"}
              </Button>
              <div className="ml-auto">
                {!isNew && p!.configured ? (
                  confirmRemove ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11.5px] text-rose-300">
                        {profilesUsing.length > 0
                          ? `In use by ${profilesUsing.length} role(s)`
                          : "Remove?"}
                      </span>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={anyBusy || profilesUsing.length > 0}
                        title={
                          profilesUsing.length > 0
                            ? "Reassign the roles using it first"
                            : undefined
                        }
                        iconLeft={<Trash2 size={12} />}
                        onClick={() => void onRemove()}
                      >
                        {busy === "remove" ? "Removing…" : "Confirm"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmRemove(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={anyBusy}
                      iconLeft={<Trash2 size={12} />}
                      onClick={() => setConfirmRemove(true)}
                    >
                      Remove
                    </Button>
                  )
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[12px] font-semibold text-violet-vivid">
        {label}
      </div>
      {children}
    </label>
  );
}

function TestResultRow({
  result,
  loginCommand,
  loginNote,
}: {
  result: TestResult;
  loginCommand: string | null;
  loginNote: string;
}) {
  if (result.ok) {
    return (
      <div className="mt-3 flex items-center gap-1.5 rounded-[12px] border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-200">
        <Check size={13} className="shrink-0" />
        Responded with the magic token in {result.durationMs}ms.
      </div>
    );
  }
  if (result.needsLogin) {
    const cmd = result.loginCommand ?? loginCommand;
    return (
      <div className="mt-3 rounded-[12px] border border-amber-soft/30 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-200">
        <div className="font-medium">Not logged in - authenticate to continue.</div>
        {cmd ? (
          <div className="mt-1.5">
            Run this{" "}
            <span className="font-medium text-chalk-100">
              in your own terminal
            </span>{" "}
            (Vibestrate won't do it for you):
            <pre className="mono mt-1 overflow-x-auto rounded-[10px] bg-coal-800 px-2 py-1 text-[12px] text-amber-100">
              {cmd}
            </pre>
          </div>
        ) : (
          <div className="mt-1 text-amber-soft">{loginNote}</div>
        )}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
      <div className="flex items-center gap-1.5">
        <X size={12} className="shrink-0" /> Test failed (exit {result.exitCode}) -
        check the config, then test again.
      </div>
      {result.hint ? (
        <div className="mt-1 text-rose-300">{result.hint}</div>
      ) : null}
      {result.stderr ? (
        <pre className="mono mt-1.5 max-h-24 overflow-x-auto whitespace-pre-wrap break-all rounded-[10px] bg-coal-800 px-2 py-1 text-[11px] text-rose-300/80">
          {result.stderr.slice(0, 400)}
        </pre>
      ) : null}
    </div>
  );
}

/** Pull the backtick-wrapped commands out of an install hint sentence. */
function extractCommands(hint: string | null): string[] {
  if (!hint) return [];
  return (hint.match(/`([^`]+)`/g) ?? []).map((s) => s.slice(1, -1));
}

/**
 * Flowd install for a popular provider. Shows the exact install + login
 * commands to run locally and a re-check - it never runs anything itself
 * (the browser spawns no commands; everything happens in the user's own
 * terminal, on their machine, with their credentials).
 */
function InstallWizard({
  provider: p,
  onClose,
  onRecheck,
}: {
  provider: ProviderRow;
  onClose: () => void;
  onRecheck: () => Promise<void>;
}) {
  const [rechecking, setRechecking] = useState(false);
  const installCmds = extractCommands(p.installHint);

  async function recheck() {
    setRechecking(true);
    try {
      await onRecheck();
    } finally {
      setRechecking(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 font-jakarta"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-violet-vivid">
              Install - runs on your machine
            </div>
            <h2 className="mt-0.5 text-[18px] font-extrabold tracking-[-0.02em] text-chalk-100">
              {p.label}
            </h2>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            iconLeft={<X size={13} />}
          >
            Close
          </Button>
        </div>

        {p.available ? (
          <div className="mt-4 flex items-start gap-1.5 rounded-[12px] border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-200">
            <Check size={14} className="mt-px shrink-0" />
            <span>
              {p.command} detected{p.version ? ` (v${p.version})` : ""}. Close
              this, then <span className="text-chalk-100">Set up</span> and{" "}
              <span className="text-chalk-100">Test</span>.
            </span>
          </div>
        ) : null}

        <ol className="mt-4 space-y-3.5">
          <li>
            <div className="text-[12.5px] font-medium text-chalk-200">
              1 - Install the CLI
            </div>
            {installCmds.length > 0 ? (
              installCmds.map((c, i) => <CopyLine key={i} cmd={c} />)
            ) : (
              <p className="mt-1 text-[12px] text-chalk-300">
                See {p.label}'s site for install instructions.
              </p>
            )}
          </li>
          <li>
            <div className="text-[12.5px] font-medium text-chalk-200">
              2 - Authenticate
            </div>
            {p.loginCommand ? <CopyLine cmd={p.loginCommand} /> : null}
            <p className="mt-1 text-[11.5px] text-chalk-400">{p.loginNote}</p>
          </li>
          <li>
            <div className="text-[12.5px] font-medium text-chalk-200">
              3 - Verify
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={rechecking}
              iconLeft={<Check size={13} />}
              onClick={() => void recheck()}
              className="mt-1.5"
            >
              {rechecking ? "Checking…" : "Re-check"}
            </Button>
          </li>
        </ol>

        <p className="mt-4 text-[11px] text-chalk-400">
          Install and login run entirely on your machine - Vibestrate never runs
          them for you and never sees your credentials.
        </p>
      </div>
    </div>
  );
}

function CopyLine({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 flex items-center gap-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-800 px-2 py-1.5">
      <code className="mono flex-1 truncate text-[12px] text-chalk-100">{cmd}</code>
      <button
        type="button"
        title="Copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {
            /* ignore */
          }
        }}
        className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-semibold text-chalk-400 transition hover:text-chalk-100"
      >
        <Copy size={12} /> {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
