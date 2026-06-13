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
import { Button } from "../../components/design/Button.js";
import { Chip, type ChipTone } from "../../components/design/Chip.js";
import { cn } from "../../components/design/cn.js";
import { LockToggle } from "../../components/providers/LockToggle.js";

/** The CLI sections whose rows can be drag-reordered (a client-side preference). */
type ReorderSection = "popular" | "optional";

type TestResult = Awaited<ReturnType<typeof api.testProvider>>;
type Busy = { id: string; action: "apply" | "default" | "test" } | null;
type Toast = { kind: "ok" | "err"; text: string } | null;

/**
 * Providers page - the dashboard mirror of `vibe provider …`, and the
 * complete provider-management surface: detect, set up, **edit
 * command/args/input**, test (with the edit→save→test loop in one place),
 * set-default, login guidance, and **remove**. Full parity with the CLI, so
 * nothing about a provider requires dropping to a terminal.
 *
 * The browser never spawns commands: edits write config through the audited
 * config-update service, "test" runs the fixed safe-magic-token probe against
 * the *saved* config, and login is only ever surfaced as an instruction the
 * user runs themselves in their terminal.
 */
export function ProvidersPage() {
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
          "rounded-xl border surface-ink-100-55 px-4 py-3.5 transition",
          isDropTarget
            ? "border-violet-soft/60 ring-1 ring-violet-soft/40"
            : "border-white/10",
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
                "mt-1 grid h-6 w-5 shrink-0 place-items-center rounded text-fog-600",
                locked
                  ? "cursor-not-allowed opacity-30"
                  : "cursor-grab hover:text-fog-300 active:cursor-grabbing",
              )}
            >
              <GripVertical size={15} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <Icon size={15} className="text-violet-soft shrink-0" />
              <span className="text-[15px] text-fog-100 font-medium">
                {p.label}
              </span>
              <span className="mono text-[11.5px] text-fog-500">
                {p.command}
                {p.version ? ` · v${p.version}` : ""}
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
                  <li key={i} className="text-[12px] text-fog-400 leading-snug">
                    {n}
                  </li>
                ))}
              </ul>
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
    <div className="relative z-10 mx-auto max-w-[1100px] px-8 pt-6 pb-16 fade-up">
      <section className="mt-1">
        <div className="eyebrow mb-1.5">Providers · the CLIs Vibestrate drives</div>
        <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
          {rows ? `${availableCount} detected` : "-"}
          <span className="text-fog-400">
            {rows ? ` · ${configuredCount} configured` : ""}
          </span>
        </h1>
        <p className="text-fog-300 text-[13px] mt-1.5 max-w-[70ch]">
          Detect installed coding-agent CLIs, set up and{" "}
          <span className="text-fog-100">edit their command/args</span>, run a
          safe connectivity test, set a default, and remove - everything{" "}
          <code className="text-violet-soft">vibe provider …</code> can do,
          here. When a provider isn't authenticated, Vibestrate shows the login
          command to run <span className="text-fog-100">in your own terminal</span>{" "}
          - it never logs you in for you.
        </p>
      </section>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {!rows ? (
        <section className="mt-7">
          <div className="text-fog-400 text-[13px]">Detecting providers…</div>
        </section>
      ) : (
        <>
          <section className="mt-7 space-y-3">
            <div className="eyebrow">Popular · configured out of the box</div>
            {orderedPopular.map((p) =>
              renderRow(p, { section: "popular", ids: popularIds }),
            )}
          </section>

          {optionalRows.length > 0 ? (
            <section className="mt-7 space-y-3">
              <div className="eyebrow">Optional · opt-in, not auto-configured</div>
              <p className="text-fog-400 text-[12.5px] -mt-1 max-w-[70ch]">
                Detected but never auto-bound. Set one up to wire it into this
                project, then test it like any other provider. Drag the handle to
                reorder, or lock a row to pin it.
              </p>
              {orderedOptional.map((p) =>
                renderRow(p, { section: "optional", ids: optionalIds }),
              )}
            </section>
          ) : null}

          <section className="mt-7 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="eyebrow">Cloud APIs & local model servers</div>
                <p className="text-fog-400 text-[12.5px] mt-0.5 max-w-[70ch]">
                  Drive a model over HTTP instead of a CLI. Cloud APIs use{" "}
                  <span className="text-fog-100">your own key</span> (an env
                  reference, never stored in config) over https; local servers
                  (Ollama, LM Studio, vLLM) stay on{" "}
                  <span className="text-fog-100">localhost - no egress</span>.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  iconLeft={<Cloud size={13} />}
                  onClick={() => setCreateKind("http-api")}
                >
                  Add cloud API
                </Button>
                <Button
                  variant="outline"
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
            </div>
            {httpRows.length > 0 ? (
              httpRows.map((p) => renderRow(p))
            ) : (
              <p className="text-fog-500 text-[12px]">
                None configured yet. Add a cloud API or a local model server above.
              </p>
            )}
          </section>

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
            "fixed bottom-4 right-4 z-30 rounded-lg border px-3.5 py-2 text-[12.5px] shadow-2xl",
            toast.kind === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/30 bg-rose-500/10 text-rose-200",
          )}
        >
          {toast.kind === "ok" ? "✓ " : "✗ "}
          {toast.text}
        </div>
      ) : null}
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
    <section className="mt-9 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow">Capability catalog · models & effort per provider</div>
          <p className="text-fog-400 text-[12.5px] mt-0.5 max-w-[70ch]">
            The model and effort knobs the Profile editor offers - built-in, plus
            your overlay.{" "}
            <code className="text-violet-soft">vibe provider catalog</code> shows
            the same.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          iconLeft={<RefreshCw size={13} />}
          disabled={busy}
          title="Detect each provider's real models/efforts (codex `debug models`, else --help) and write them to the overlay (local only)"
          onClick={() => void refresh()}
        >
          {busy ? "Detecting…" : "Refresh from providers"}
        </Button>
      </div>

      {note ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-fog-300">
          {note}
        </div>
      ) : null}

      <div className="text-[12px]">
        {data.overlay.present ? (
          <span className="inline-flex items-center gap-2">
            <Chip tone="violet">overlay active</Chip>
            <code className="mono text-fog-400 text-[11.5px]">{data.overlay.path}</code>
          </span>
        ) : (
          <span className="text-fog-500">
            No overlay. Create{" "}
            <code className="mono text-fog-300">{data.overlay.path}</code> to add or
            refine a provider's models / effort.
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
              className="rounded-lg border border-white/[0.08] surface-ink-100-55 px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] text-fog-100 font-medium mono">{id}</span>
                <Chip tone={overlaid ? "violet" : "neutral"}>
                  {overlaid ? "overlay" : "built-in"}
                </Chip>
              </div>
              <div className="mt-1.5 text-[12px] text-fog-400 flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  <span className="text-fog-500">models </span>
                  {c.models.length ? (
                    <span className="mono text-fog-200">{c.models.join(", ")}</span>
                  ) : (
                    <span className="text-fog-600">{c.modelEnabled ? "free-text" : "n/a"}</span>
                  )}
                </span>
                <span>
                  <span className="text-fog-500">effort </span>
                  {c.powerLevels.length ? (
                    <span className="mono text-fog-200">{c.powerLevels.join(" / ")}</span>
                  ) : (
                    <span className="text-fog-600">none</span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
  const eyebrow = isNew
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
    "mono w-full h-9 rounded-md border border-white/10 bg-white/[0.03] px-3 text-[12.5px] text-fog-100 focus:outline-none focus:border-violet-soft/40";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${eyebrow} ${headerTitle}`}
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-[620px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h2 className="text-display text-[19px] mt-0.5">{headerTitle}</h2>
            <div className="mono text-[11px] text-fog-500 mt-1 flex items-center gap-2 flex-wrap">
              {!isNew ? <span>{p!.id}</span> : null}
              {!isNew ? <span className="text-fog-600">·</span> : null}
              {kind === "cli" ? (
                <span className={p?.available ? "text-emerald-300/90" : "text-amber-300"}>
                  {p?.available ? "CLI detected" : "CLI not detected"}
                </span>
              ) : kind === "http-api" ? (
                <span className="text-amber-300">external · egress over https</span>
              ) : (
                <span className="text-emerald-300/90">local only · no egress</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-white/10 px-2 py-1 text-[12px] text-fog-300 hover:text-fog-100"
          >
            Close
          </button>
        </div>

        {loading ? (
          <div className="mt-5 text-[13px] text-fog-400">Loading config…</div>
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
                    <div className="inline-flex rounded-md border border-white/10 bg-white/[0.025] p-[2px]">
                      {(["stdin", "arg"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setInput(mode)}
                          className={cn(
                            "h-[26px] px-3 rounded text-[11.5px] font-medium mono",
                            input === mode
                              ? "bg-white/[0.08] text-fog-100"
                              : "text-fog-400 hover:text-fog-100",
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
                    <div className="inline-flex rounded-md border border-white/10 bg-white/[0.025] p-[2px]">
                      {apiOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => onApiChange(opt)}
                          className={cn(
                            "h-[26px] px-3 rounded text-[11.5px] font-medium mono",
                            apiName === opt
                              ? "bg-white/[0.08] text-fog-100"
                              : "text-fog-400 hover:text-fog-100",
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
                    <p className="text-[10.5px] text-fog-500 mt-1">
                      An <span className="text-fog-300">env reference</span> like{" "}
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
                        className="mono w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-fog-100 focus:outline-none focus:border-violet-soft/40 resize-y"
                      />
                    </FormField>
                  ) : null}
                </>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="eyebrow">
                  {yamlMode ? "Advanced · raw provider YAML" : "YAML written to .vibestrate/project.yml"}
                </span>
                <button
                  type="button"
                  onClick={toggleYamlMode}
                  className="text-[11px] text-violet-soft hover:text-violet-300"
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
                    className="mono text-[11.5px] w-full resize-y text-fog-100 rounded-md border border-violet-soft/30 bg-black/40 px-3 py-2.5 focus:outline-none focus:border-violet-soft/60"
                  />
                  <div className="text-[11px] text-fog-500 mt-1.5 leading-relaxed">
                    Edit the whole block, so anything the form doesn't surface is
                    still yours to set here:{" "}
                    <span className="mono text-fog-300">env</span>, claude-code{" "}
                    <span className="mono text-fog-300">settings</span>,{" "}
                    <span className="mono text-fog-300">extraArgs</span>, custom
                    headers. Keep the{" "}
                    <span className="mono text-fog-300">
                      providers: {idForSave || "<id>"}:
                    </span>{" "}
                    shape - it's validated on save.
                  </div>
                </>
              ) : (
                <pre className="mono text-[11.5px] text-fog-200 rounded-md border border-white/[0.07] bg-black/40 px-3 py-2.5 overflow-x-auto whitespace-pre">
                  {yamlPreview}
                </pre>
              )}
              {profilesUsing.length > 0 ? (
                <div className="text-[11px] text-fog-500 mt-2">
                  Used by role{profilesUsing.length === 1 ? "" : "s"}:{" "}
                  <span className="mono text-fog-300">{profilesUsing.join(", ")}</span>
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
                        variant="outline"
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
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(false)}
                        className="text-[11.5px] text-fog-400 hover:text-fog-200"
                      >
                        cancel
                      </button>
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
      <div className="mono text-[10px] uppercase tracking-[0.14em] text-fog-500 mb-1">
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
      <div className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-500/5 px-3 py-2 text-[12px] text-emerald-200">
        ✓ Responded with the magic token in {result.durationMs}ms.
      </div>
    );
  }
  if (result.needsLogin) {
    const cmd = result.loginCommand ?? loginCommand;
    return (
      <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-400/5 px-3 py-2.5 text-[12px] text-amber-200">
        <div className="font-medium">Not logged in.</div>
        {cmd ? (
          <div className="mt-1.5">
            Run this <span className="text-fog-100 font-medium">in your own terminal</span> (Vibestrate won't do it for you):
            <pre className="mt-1 rounded bg-black/30 px-2 py-1 mono text-[12px] text-amber-100 overflow-x-auto">
              {cmd}
            </pre>
          </div>
        ) : (
          <div className="mt-1 text-amber-300/90">{loginNote}</div>
        )}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-200">
      <div className="flex items-center gap-1.5">
        <X size={12} /> Test failed (exit {result.exitCode}).
      </div>
      {result.hint ? <div className="mt-1 text-rose-300/90">{result.hint}</div> : null}
      {result.stderr ? (
        <pre className="mt-1.5 rounded bg-black/30 px-2 py-1 mono text-[11px] text-rose-300/80 overflow-x-auto max-h-24 whitespace-pre-wrap break-all">
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
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="glass w-full max-w-[560px] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Install · runs on your machine</div>
            <h2 className="text-display text-[18px] mt-0.5">{p.label}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-2 py-1 text-[12px] text-fog-300 hover:text-fog-100"
          >
            Close
          </button>
        </div>

        {p.available ? (
          <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-500/5 px-3 py-2 text-[12.5px] text-emerald-200">
            ✓ {p.command} detected{p.version ? ` (v${p.version})` : ""}. Close this,
            then <span className="text-fog-100">Set up</span> and{" "}
            <span className="text-fog-100">Test</span>.
          </div>
        ) : null}

        <ol className="mt-4 space-y-3.5">
          <li>
            <div className="text-[12.5px] font-medium text-fog-200">1 · Install the CLI</div>
            {installCmds.length > 0 ? (
              installCmds.map((c, i) => <CopyLine key={i} cmd={c} />)
            ) : (
              <p className="mt-1 text-[12px] text-fog-400">
                See {p.label}'s site for install instructions.
              </p>
            )}
          </li>
          <li>
            <div className="text-[12.5px] font-medium text-fog-200">2 · Authenticate</div>
            {p.loginCommand ? <CopyLine cmd={p.loginCommand} /> : null}
            <p className="mt-1 text-[11.5px] text-fog-500">{p.loginNote}</p>
          </li>
          <li>
            <div className="text-[12.5px] font-medium text-fog-200">3 · Verify</div>
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

        <p className="mt-4 text-[11px] text-fog-500">
          Install and login run entirely on your machine - Vibestrate never runs them
          for you and never sees your credentials.
        </p>
      </div>
    </div>
  );
}

function CopyLine({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 flex items-center gap-2 rounded-md bg-black/30 px-2 py-1.5">
      <code className="mono flex-1 truncate text-[12px] text-fog-100">{cmd}</code>
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
        className="inline-flex shrink-0 items-center gap-1 text-[10.5px] text-fog-400 hover:text-fog-100"
      >
        <Copy size={12} /> {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
