import { useEffect, useState } from "react";
import { Check, Play, Trash2, X } from "lucide-react";
import { api, type ProviderRow } from "../../lib/api.js";
import { stringify as stringifyYaml } from "yaml";
import {
  extractProviderConfigFromYaml,
  parseArgs,
  renderProviderYaml,
  type EditorProviderConfig,
} from "../../lib/provider-yaml.js";
import { Button } from "../design/Button.js";
import { FormField } from "../design/FormField.js";
import { cn } from "../design/cn.js";

export type TestResult = Awaited<ReturnType<typeof api.testProvider>>;

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
export function ProviderEditor({
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

export function TestResultRow({
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
