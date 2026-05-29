import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Pencil,
  Play,
  Plug,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { api, type ProviderRow } from "../../lib/api.js";
import { parseArgs, renderProviderYaml } from "../../lib/provider-yaml.js";
import { Button } from "../../components/design/Button.js";
import { Chip, type ChipTone } from "../../components/design/Chip.js";
import { cn } from "../../components/design/cn.js";

type TestResult = Awaited<ReturnType<typeof api.testProvider>>;
type Busy = { id: string; action: "apply" | "default" | "test" } | null;
type Toast = { kind: "ok" | "err"; text: string } | null;

/**
 * Providers page — the dashboard mirror of `vibe provider …`, and the
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
  const popularRows = rows?.filter((r) => r.popular) ?? [];
  const optionalRows = rows?.filter((r) => !r.popular) ?? [];

  const renderRow = (p: ProviderRow) => {
    const t = tests[p.id];
    const statusChip = providerStatus(p);
    const isBusy = busy?.id === p.id;
    return (
      <div
        key={p.id}
        className="rounded-xl border border-white/10 surface-ink-100-55 px-4 py-3.5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Plug size={15} className="text-violet-soft shrink-0" />
              <span className="text-[15px] text-fog-100 font-medium">
                {p.label}
              </span>
              <span className="mono text-[11.5px] text-fog-500">
                {p.command}
                {p.version ? ` · v${p.version}` : ""}
              </span>
              <Chip tone={statusChip.tone}>{statusChip.label}</Chip>
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
            {/* Set up (unconfigured) / Edit (configured) both open the editor —
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
          {rows ? `${availableCount} detected` : "—"}
          <span className="text-fog-400">
            {rows ? ` · ${configuredCount} configured` : ""}
          </span>
        </h1>
        <p className="text-fog-300 text-[13px] mt-1.5 max-w-[70ch]">
          Detect installed coding-agent CLIs, set up and{" "}
          <span className="text-fog-100">edit their command/args</span>, run a
          safe connectivity test, set a default, and remove — everything{" "}
          <code className="text-violet-soft">vibe provider …</code> can do,
          here. When a provider isn't authenticated, Vibestrate shows the login
          command to run <span className="text-fog-100">in your own terminal</span>{" "}
          — it never logs you in for you.
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
            {popularRows.map(renderRow)}
          </section>

          {optionalRows.length > 0 ? (
            <section className="mt-7 space-y-3">
              <div className="eyebrow">Optional · opt-in, not auto-configured</div>
              <p className="text-fog-400 text-[12.5px] -mt-1 max-w-[70ch]">
                Detected but never auto-bound. Set one up to wire it into this
                project, then test it like any other provider.
              </p>
              {optionalRows.map(renderRow)}
            </section>
          ) : null}
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
 * The complete edit/test/remove loop for one provider — the in-UI equivalent
 * of `vibe provider setup` + `vibe provider test` + `vibe provider remove`.
 * Edits command/args/input, previews the YAML, and (because the safe-test
 * runs the *saved* config — the browser may not name an arbitrary command to
 * run) offers "Save & test" so the edit→save→test loop lives in one place.
 */
function ProviderEditor({
  provider: p,
  onClose,
  onChanged,
  onError,
}: {
  provider: ProviderRow;
  onClose: () => void;
  onChanged: (toast?: string) => Promise<void> | void;
  onError: (text: string) => void;
}) {
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [input, setInput] = useState<"stdin" | "arg">("stdin");
  const [profilesUsing, setRolesUsing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "save" | "saveTest" | "remove">(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api
      .getProviderConfig(p.id)
      .then((r) => {
        if (cancelled) return;
        setCommand(r.config.command);
        setArgs(r.config.args.join(" "));
        setInput(r.config.input);
        setRolesUsing(r.profilesUsing);
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
  }, [p.id]);

  const yamlPreview = renderProviderYaml(p.id, {
    command,
    args: parseArgs(args),
    input,
  });

  async function save(): Promise<boolean> {
    try {
      await api.setupProvider(p.id, {
        config: { command: command.trim(), args: parseArgs(args), input },
      });
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
      await onChanged(`Saved ${p.id} to project.yml.`);
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
      const r = await api.testProvider(p.id);
      setResult(r);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Set up ${p.label}`}
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-[620px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">
              {p.configured ? "Edit provider" : "Set up provider"}
            </div>
            <h2 className="text-display text-[19px] mt-0.5">{p.label}</h2>
            <div className="mono text-[11px] text-fog-500 mt-1 flex items-center gap-2 flex-wrap">
              <span>{p.id}</span>
              <span className="text-fog-600">·</span>
              <span className={p.available ? "text-emerald-300/90" : "text-amber-300"}>
                {p.available ? "CLI detected" : "CLI not detected"}
              </span>
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
              <FormField label="command">
                <input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder={p.id}
                  className="mono w-full h-9 rounded-md border border-white/10 bg-white/[0.03] px-3 text-[12.5px] text-fog-100 focus:outline-none focus:border-violet-soft/40"
                />
              </FormField>
              <FormField label="args">
                <input
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder='space-separated · e.g. "exec"'
                  className="mono w-full h-9 rounded-md border border-white/10 bg-white/[0.03] px-3 text-[12.5px] text-fog-100 focus:outline-none focus:border-violet-soft/40"
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
            </div>

            <div className="mt-4">
              <div className="eyebrow mb-2">
                YAML written to .vibestrate/project.yml
              </div>
              <pre className="mono text-[11.5px] text-fog-200 rounded-md border border-white/[0.07] bg-black/40 px-3 py-2.5 overflow-x-auto whitespace-pre">
                {yamlPreview}
              </pre>
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
                loginCommand={p.loginCommand}
                loginNote={p.loginNote}
              />
            ) : null}

            <div className="mt-5 flex items-center gap-2 flex-wrap">
              <Button
                variant="primary"
                size="sm"
                disabled={anyBusy || !command.trim()}
                iconLeft={<Play size={12} />}
                onClick={() => void onSaveTest()}
              >
                {busy === "saveTest" ? "Saving & testing…" : "Save & test"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={anyBusy || !command.trim()}
                onClick={() => void onSave()}
              >
                {busy === "save" ? "Saving…" : "Save"}
              </Button>
              <div className="ml-auto">
                {p.configured ? (
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
 * commands to run locally and a re-check — it never runs anything itself
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
          Install and login run entirely on your machine — Vibestrate never runs them
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
