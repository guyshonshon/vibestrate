import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, Terminal } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  ConfigRow,
  ConfigSection,
  ConfigViewResponse,
} from "../../lib/types.js";
import { serializeRoute, type Route } from "../route.js";
import { Button } from "../../components/design/Button.js";
import { Chip } from "../../components/design/Chip.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
import { cn } from "../../components/design/cn.js";

/**
 * Config view - the readable, grouped mirror of `vibe config view` (not the raw
 * `config show` YAML dump). Each section says what it controls and, crucially,
 * where it's editable: a "live" section deep-links to its dedicated editor
 * (Providers / Profiles / Crew / Settings); a "static" one shows the
 * `vibe config set` path. Read-only by design - editing happens on the surface
 * each section points at, preserving UI/CLI parity.
 */
export function ConfigPage() {
  const [data, setData] = useState<ConfigViewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setData(await api.getConfigView());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <PageShell>
      <PageHeader
        title={data?.view.project.name || "Project config"}
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
          <p className="max-w-[72ch] text-[13px] leading-[1.55] text-chalk-300">
            A readable, grouped view of{" "}
            {data ? (
              <code className="mono text-violet-soft">{data.configPath}</code>
            ) : (
              "your project config"
            )}{" "}
            - what each part controls and where to change it. The raw YAML is{" "}
            <code className="mono text-violet-soft">vibe config show</code>.
          </p>
          {data?.view.project.type ? (
            <p className="mt-1.5 text-[12px] text-chalk-400">
              Project type{" "}
              <span className="mono text-chalk-100">
                {data.view.project.type}
              </span>
            </p>
          ) : null}
        </div>
      </PageHeader>

      {error ? (
        <div className="mb-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {data && !data.valid ? (
        <div className="mb-4 rounded-[12px] border border-amber-soft/30 bg-amber-400/5 px-4 py-2.5 text-[12.5px] text-amber-soft">
          <div className="font-semibold">Config has validation issues.</div>
          {data.error ? (
            <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap rounded-[10px] bg-coal-800 px-2 py-1 mono text-[11.5px] text-amber-soft/90">
              {data.error}
            </pre>
          ) : null}
        </div>
      ) : null}

      {!data ? (
        <div className="text-[13px] text-chalk-300">Loading config…</div>
      ) : (
        <Section>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.view.sections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}
          </div>
        </Section>
      )}
    </PageShell>
  );
}

function navTo(route: Route) {
  window.location.hash = serializeRoute(route);
}

function SectionCard({ section }: { section: ConfigSection }) {
  const e = section.editable;
  const editRoute = e.live && e.route ? e.route : null;
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[13.5px] font-bold text-chalk-100">
          {section.title}
        </h3>
        <Chip tone={e.live ? "emerald" : "neutral"}>
          {e.live ? "live editor" : "via CLI"}
        </Chip>
      </div>
      <p className="-mt-1 text-[12px] leading-snug text-chalk-300">
        {section.summary}
      </p>

      <div className="divide-y divide-[color:var(--line-soft)] overflow-hidden rounded-[14px] border border-[color:var(--line)] bg-coal-500/40">
        {section.rows.map((row, i) => (
          <Row key={i} row={row} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {editRoute ? (
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.9} />}
            onClick={() => navTo(routeFor(editRoute))}
          >
            Edit in {e.surface ?? "editor"}
          </Button>
        ) : e.surface ? (
          <span className="text-[11.5px] text-chalk-400">edit: {e.surface}</span>
        ) : null}
        {e.cli.map((cli) => (
          <code
            key={cli}
            className="mono inline-flex items-center gap-1.5 rounded-[10px] bg-coal-800 px-2 py-1 text-[11px] text-chalk-300"
          >
            <Terminal className="h-3 w-3 text-chalk-400" strokeWidth={1.9} />
            {cli}
          </code>
        ))}
      </div>
    </div>
  );
}

const ROW_TONE: Record<NonNullable<ConfigRow["tone"]>, string> = {
  default: "text-chalk-100",
  on: "text-emerald-400",
  off: "text-chalk-400",
  warn: "text-amber-soft",
};

function Row({ row }: { row: ConfigRow }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3 py-1.5">
      <span className="shrink-0 text-[11.5px] text-chalk-300">{row.label}</span>
      <span className="min-w-0 text-right">
        <span className={cn("mono text-[12px]", ROW_TONE[row.tone ?? "default"])}>
          {row.value}
        </span>
        {row.hint ? (
          <span className="block text-[10.5px] text-chalk-400">{row.hint}</span>
        ) : null}
      </span>
    </div>
  );
}

/** Map a section's editable.route (a Route kind) to a concrete Route. */
function routeFor(routeKind: string): Route {
  switch (routeKind) {
    case "providers":
      return { kind: "providers" };
    case "profiles":
      return { kind: "profiles" };
    case "crew":
      return { kind: "crew", crewId: null };
    case "flows":
      return { kind: "flows" };
    case "settings":
      return { kind: "settings" };
    default:
      return { kind: "config" };
  }
}
