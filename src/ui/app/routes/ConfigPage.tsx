import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ConfigFieldDto } from "../../lib/types.js";
import { serializeRoute, type Route } from "../route.js";
import { Button } from "../../components/design/Button.js";
import { Select } from "../../components/design/Select.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
import { ErrorView } from "../../lib/error-view.js";
import { cn } from "../../components/design/cn.js";

/**
 * Config editor - the schema-driven, fully-editable mirror of project.yml. Every
 * settable leaf key the CLI's `vibe config set` can write is editable here too:
 * the field list comes straight from the Zod schema (GET /api/config/fields) and
 * each edit calls the SAME setter over POST /api/config/set. UI/CLI parity by
 * construction.
 *
 * Record containers (providers/crews/profiles/personas) aren't raw-edited - they
 * link out to their dedicated rich editors, which stay UI-editable, so parity
 * still holds.
 */

/** Human label for a top-level namespace (the part before the first "."). */
const GROUP_LABELS: Record<string, string> = {
  project: "Project",
  git: "Git",
  workflow: "Workflow",
  execution: "Execution",
  budget: "Budget",
  commands: "Validation commands",
  commits: "Commits",
  merge: "Merge",
  scheduler: "Scheduler",
  policies: "Safety policies",
  posture: "Posture",
  supervised: "Supervised runs",
  resilience: "Resilience",
  session: "Session",
  editor: "Editor",
  permissions: "Permissions",
  providers: "Providers",
  profiles: "Profiles",
  crews: "Crews",
  personas: "Supervisors",
};

/** A settable top-level key with no namespace prefix (e.g. defaultCrew). */
const ROOT_GROUP = "General";

function groupOf(fullKey: string): string {
  const dot = fullKey.indexOf(".");
  return dot === -1 ? ROOT_GROUP : fullKey.slice(0, dot);
}

function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}

export function ConfigPage() {
  const [fields, setFields] = useState<ConfigFieldDto[] | null>(null);
  const [configPath, setConfigPath] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.getConfigFields();
      setFields(r.fields);
      setConfigPath(r.configPath);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Group by top-level namespace, preserving schema order within each group.
  const groups = useMemo(() => {
    const out: { group: string; fields: ConfigFieldDto[] }[] = [];
    const index = new Map<string, ConfigFieldDto[]>();
    for (const f of fields ?? []) {
      const g = groupOf(f.fullKey);
      let bucket = index.get(g);
      if (!bucket) {
        bucket = [];
        index.set(g, bucket);
        out.push({ group: g, fields: bucket });
      }
      bucket.push(f);
    }
    return out;
  }, [fields]);

  return (
    <PageShell>
      <PageHeader
        title="Project config"
        actions={
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.9} />}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        }
      >
        <div className="mt-3 rounded-[16px] border border-[color:var(--line)] bg-coal-600 px-4 py-3">
          <p className="max-w-[74ch] text-[13px] leading-[1.55] text-chalk-300">
            Every setting in{" "}
            {configPath ? (
              <code className="mono text-violet-soft">{configPath}</code>
            ) : (
              "your project config"
            )}
            , editable in place. Each change is equivalent to{" "}
            <code className="mono text-violet-soft">vibe config set</code>; the raw
            YAML is <code className="mono text-violet-soft">vibe config show</code>.
          </p>
        </div>
      </PageHeader>

      {error ? (
        <ErrorView className="mb-4" compact err={error} onRetry={() => void load()} />
      ) : null}

      {!fields ? (
        <div className="text-[13px] text-chalk-300">Loading config…</div>
      ) : (
        groups.map(({ group, fields: groupFields }) => (
          <Section key={group} title={groupLabel(group)}>
            <div className="flex flex-col divide-y divide-[color:var(--line-soft)] overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-coal-600">
              {groupFields.map((f) => (
                <FieldRow key={f.fullKey} field={f} />
              ))}
            </div>
          </Section>
        ))
      )}
    </PageShell>
  );
}

function navTo(route: Route) {
  window.location.hash = serializeRoute(route);
}

/** Map a record-container key to its dedicated editor + a label. */
function recordDestination(
  fullKey: string,
): { route: Route; label: string } | null {
  switch (groupOf(fullKey)) {
    case "providers":
      return { route: { kind: "providers" }, label: "Providers" };
    case "crews":
      return { route: { kind: "crew", crewId: null }, label: "Crew" };
    case "profiles":
      return { route: { kind: "profiles" }, label: "Profiles" };
    case "personas":
      return { route: { kind: "supervisors" }, label: "Supervisors" };
    case "permissions":
      return { route: { kind: "settings" }, label: "Settings" };
    default:
      return null;
  }
}

/** Compact one-line display of a value (record summaries + read-only cells). */
function summarize(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === "object") {
    const n = Object.keys(value as Record<string, unknown>).length;
    return `${n} entr${n === 1 ? "y" : "ies"}`;
  }
  return String(value);
}

/** Stringify a value for a text input / JSON textarea. */
function toEditString(value: unknown, type: string): string {
  if (value === null || value === undefined) {
    if (type.startsWith("array<")) return "[]";
    return "";
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

const INPUT_RECIPE =
  "w-full rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none";

function FieldRow({ field }: { field: ConfigFieldDto }) {
  const [value, setValue] = useState<unknown>(field.current);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  // Re-sync when the parent reloads the field list.
  useEffect(() => {
    setValue(field.current);
    setRowError(null);
  }, [field.current]);

  // Commit a raw string to the server. Optimistic: keep the typed value on
  // success; roll back to the previous value on error.
  async function commit(nextRaw: string, optimistic: unknown) {
    const prev = value;
    setValue(optimistic);
    setPending(true);
    setRowError(null);
    setSaved(false);
    try {
      const r = await api.setConfigValue(field.fullKey, nextRaw);
      setValue(r.value);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setValue(prev);
      setRowError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  const dest = field.isRecordContainer ? recordDestination(field.fullKey) : null;

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <code className="mono text-[12px] font-semibold text-chalk-100">
            {field.fullKey}
          </code>
          {field.description ? (
            <p className="mt-0.5 max-w-[68ch] text-[12px] leading-snug text-chalk-300">
              {field.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {saved ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-400">
              <Check className="h-3.5 w-3.5" strokeWidth={2} />
              saved
            </span>
          ) : null}
          <div className="w-[240px] max-w-[46vw]">
            <FieldControl
              field={field}
              value={value}
              pending={pending}
              onCommit={commit}
            />
          </div>
        </div>
      </div>
      {dest ? (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-[11.5px] text-chalk-300">
            {summarize(field.current)} - edit on the dedicated page.
          </span>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.9} />}
            onClick={() => navTo(dest.route)}
          >
            Open {dest.label}
          </Button>
        </div>
      ) : field.execGuarded ? (
        <div className="pt-0.5">
          <span className="text-[11.5px] text-chalk-400">
            Runs shell commands - set with{" "}
            <code className="mono text-chalk-300">
              vibe config set {field.fullKey}
            </code>{" "}
            for safety.
          </span>
        </div>
      ) : null}
      {rowError ? (
        <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
          {rowError}
        </div>
      ) : null}
    </div>
  );
}

/** The type-driven editor for a single field. */
function FieldControl({
  field,
  value,
  pending,
  onCommit,
}: {
  field: ConfigFieldDto;
  value: unknown;
  pending: boolean;
  onCommit: (raw: string, optimistic: unknown) => void;
}) {
  // Record containers are read-only here (they link out via the row's CTA).
  // Exec-guarded keys are read-only here too (CLI-authored for safety).
  if (field.isRecordContainer || field.execGuarded) {
    return (
      <div className="rounded-[12px] border border-[color:var(--line)] bg-coal-800/60 px-3 py-2 text-right text-[12px] text-chalk-400">
        {summarize(field.current)}
      </div>
    );
  }

  const baseType = field.type.replace(/ \| null$/, "");

  if (baseType === "boolean") {
    return (
      <Toggle
        checked={value === true}
        disabled={pending}
        onChange={(next) => onCommit(String(next), next)}
      />
    );
  }

  if (baseType === "enum" && field.enum && field.enum.length > 0) {
    return (
      <Select
        value={value === null || value === undefined ? "" : String(value)}
        options={field.enum.map((v) => ({ value: v, label: v }))}
        disabled={pending}
        ariaLabel={field.fullKey}
        onChange={(next) => onCommit(next, next)}
      />
    );
  }

  if (baseType.startsWith("array<") || baseType === "object") {
    return (
      <JsonField
        value={value}
        type={baseType}
        pending={pending}
        ariaLabel={field.fullKey}
        onCommit={onCommit}
      />
    );
  }

  // number | string (and anything else): a text input, save on blur / Enter.
  return (
    <TextField
      value={value}
      type={baseType}
      pending={pending}
      ariaLabel={field.fullKey}
      onCommit={onCommit}
    />
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-[11.5px] text-chalk-300">{checked ? "on" : "off"}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition disabled:opacity-50",
          checked
            ? "border-violet-soft/50 bg-violet-soft/30"
            : "border-[color:var(--line-strong)] bg-coal-800",
        )}
      >
        <span
          className={cn(
            "absolute h-4 w-4 rounded-full transition",
            checked ? "left-6 bg-violet-vivid" : "left-1 bg-chalk-300",
          )}
        />
      </button>
    </div>
  );
}

function TextField({
  value,
  type,
  pending,
  ariaLabel,
  onCommit,
}: {
  value: unknown;
  type: string;
  pending: boolean;
  ariaLabel: string;
  onCommit: (raw: string, optimistic: unknown) => void;
}) {
  const [draft, setDraft] = useState<string>(toEditString(value, type));

  useEffect(() => {
    setDraft(toEditString(value, type));
  }, [value, type]);

  const commit = () => {
    const current = toEditString(value, type);
    if (draft === current) return; // no change
    const optimistic =
      type === "number" && draft.trim() !== "" ? Number(draft) : draft;
    onCommit(draft, optimistic);
  };

  return (
    <input
      type={type === "number" ? "number" : "text"}
      value={draft}
      disabled={pending}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(INPUT_RECIPE, "text-right disabled:opacity-50")}
    />
  );
}

function JsonField({
  value,
  type,
  pending,
  ariaLabel,
  onCommit,
}: {
  value: unknown;
  type: string;
  pending: boolean;
  ariaLabel: string;
  onCommit: (raw: string, optimistic: unknown) => void;
}) {
  const [draft, setDraft] = useState<string>(toEditString(value, type));
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toEditString(value, type));
    setParseError(null);
  }, [value, type]);

  const commit = () => {
    const current = toEditString(value, type);
    if (draft === current) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setParseError("Invalid JSON - fix the syntax to save.");
      return;
    }
    setParseError(null);
    onCommit(draft, parsed);
  };

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={draft}
        disabled={pending}
        rows={Math.min(6, Math.max(2, draft.split("\n").length))}
        aria-label={ariaLabel}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        className={cn(
          INPUT_RECIPE,
          "mono resize-none text-[12px] disabled:opacity-50",
        )}
      />
      {parseError ? (
        <span className="text-[11px] text-rose-300">{parseError}</span>
      ) : null}
    </div>
  );
}
