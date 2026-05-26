import { useEffect, useState } from "react";
import { Check, Play, Plug, Plus, Star, X } from "lucide-react";
import { api, type ProviderRow } from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { Chip, type ChipTone } from "../../components/design/Chip.js";
import { cn } from "../../components/design/cn.js";

type TestResult = Awaited<ReturnType<typeof api.testProvider>>;
type Busy = { id: string; action: "apply" | "default" | "test" } | null;
type Toast = { kind: "ok" | "err"; text: string } | null;

/**
 * Providers page — the dashboard mirror of `amaco provider …`.
 *
 * Detect / list / set-default / apply-preset / test, all over the narrow,
 * audited server routes in `src/server/routes/providers.ts`. The browser
 * never spawns commands: "apply" writes config through the config-update
 * service, "test" runs the fixed safe-magic-token probe, and login is only
 * ever surfaced as an instruction the user runs themselves in their terminal.
 */
export function ProvidersPage() {
  const [rows, setRows] = useState<ProviderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const [toast, setToast] = useState<Toast>(null);

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

  async function applyPreset(id: string) {
    setBusy({ id, action: "apply" });
    try {
      await api.setupProvider(id, { setAsDefault: false });
      flash({ kind: "ok", text: `Applied the ${id} preset to project.yml.` });
      await load();
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function setDefault(id: string) {
    setBusy({ id, action: "default" });
    try {
      const r = await api.setDefaultProvider(id);
      flash({ kind: "ok", text: `Set ${id} as default for ${r.agentsUpdated.length} agents.` });
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
            {p.available && !p.configured ? (
              <Button
                variant="primary"
                size="sm"
                iconLeft={<Plus size={13} />}
                disabled={isBusy}
                onClick={() => applyPreset(p.id)}
              >
                Apply preset
              </Button>
            ) : null}
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
              title={p.configured ? "Run the safe connectivity test" : "Apply the preset first"}
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
        <div className="eyebrow mb-1.5">Providers · the CLIs Amaco drives</div>
        <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
          {rows ? `${availableCount} detected` : "—"}
          <span className="text-fog-400">
            {rows ? ` · ${configuredCount} configured` : ""}
          </span>
        </h1>
        <p className="text-fog-300 text-[13px] mt-1.5 max-w-[70ch]">
          Detect installed coding-agent CLIs, apply their preset, set a default,
          and run a safe connectivity test — the same actions as{" "}
          <code className="text-violet-soft">amaco provider …</code>. When a
          provider isn't authenticated, Amaco shows the login command to run{" "}
          <span className="text-fog-100">in your own terminal</span> — it never
          logs you in for you.
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
                Detected but never auto-bound. Apply the preset to wire one into
                this project, then test it like any other provider.
              </p>
              {optionalRows.map(renderRow)}
            </section>
          ) : null}
        </>
      )}

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
            Run this <span className="text-fog-100 font-medium">in your own terminal</span> (Amaco won't do it for you):
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
    </div>
  );
}
