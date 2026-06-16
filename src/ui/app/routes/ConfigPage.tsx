import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, Settings2, Terminal } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  ConfigRow,
  ConfigSection,
  ConfigViewResponse,
} from "../../lib/types.js";
import { serializeRoute, type Route } from "../route.js";
import { Button } from "../../components/design/Button.js";
import { Chip } from "../../components/design/Chip.js";
import { SectionEyebrow } from "../../components/design/SectionEyebrow.js";
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
    <div className="relative z-10 mx-auto max-w-[1100px] px-8 pt-6 pb-16 fade-up">
      <section className="mt-1 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow mb-1.5 flex items-center gap-1.5">
            <Settings2 className="h-3 w-3" strokeWidth={1.8} /> Config
          </div>
          <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
            {data?.view.project.name || "Project config"}
            {data?.view.project.type ? (
              <span className="text-fog-400"> · {data.view.project.type}</span>
            ) : null}
          </h1>
          <p className="text-fog-300 text-[13px] mt-1.5 max-w-[72ch]">
            A readable, grouped view of{" "}
            {data ? (
              <code className="mono text-violet-soft">{data.configPath}</code>
            ) : (
              "your project config"
            )}{" "}
            - what each part controls and where to change it. The raw YAML is{" "}
            <code className="text-violet-soft">vibe config show</code>.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          iconLeft={<RefreshCw size={13} />}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </section>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {data && !data.valid ? (
        <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-400/5 px-3 py-2.5 text-[12.5px] text-amber-200">
          <div className="font-medium">Config has validation issues.</div>
          {data.error ? (
            <pre className="mt-1.5 rounded bg-black/30 px-2 py-1 mono text-[11.5px] text-amber-100/90 overflow-x-auto whitespace-pre-wrap">
              {data.error}
            </pre>
          ) : null}
        </div>
      ) : null}

      {!data ? (
        <div className="mt-7 text-fog-400 text-[13px]">Loading config…</div>
      ) : (
        <div className="mt-7 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.view.sections.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}

function navTo(route: Route) {
  window.location.hash = serializeRoute(route);
}

function SectionCard({ section }: { section: ConfigSection }) {
  const e = section.editable;
  const editRoute = e.live && e.route ? e.route : null;
  return (
    <div className="slab p-4 flex flex-col gap-3">
      <SectionEyebrow
        right={
          <Chip tone={e.live ? "emerald" : "neutral"}>
            {e.live ? "live editor" : "via CLI"}
          </Chip>
        }
      >
        {section.title}
      </SectionEyebrow>
      <p className="text-fog-400 text-[12px] -mt-1 leading-snug">
        {section.summary}
      </p>

      <div className="rounded-lg border border-white/[0.06] surface-ink-100-55 divide-y divide-white/[0.05]">
        {section.rows.map((row, i) => (
          <Row key={i} row={row} />
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-0.5">
        {editRoute ? (
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<ArrowUpRight size={13} />}
            onClick={() => navTo(routeFor(editRoute))}
          >
            Edit in {e.surface ?? "editor"}
          </Button>
        ) : e.surface ? (
          <span className="text-[11.5px] text-fog-500">edit: {e.surface}</span>
        ) : null}
        {e.cli.map((cli) => (
          <code
            key={cli}
            className="mono inline-flex items-center gap-1.5 rounded-md bg-black/30 px-2 py-1 text-[11px] text-fog-300"
          >
            <Terminal size={11} className="text-fog-500" />
            {cli}
          </code>
        ))}
      </div>
    </div>
  );
}

const ROW_TONE: Record<NonNullable<ConfigRow["tone"]>, string> = {
  default: "text-fog-100",
  on: "text-emerald-300",
  off: "text-fog-500",
  warn: "text-amber-300",
};

function Row({ row }: { row: ConfigRow }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3 py-1.5">
      <span className="text-[11.5px] text-fog-400 shrink-0">{row.label}</span>
      <span className="text-right min-w-0">
        <span className={cn("mono text-[12px]", ROW_TONE[row.tone ?? "default"])}>
          {row.value}
        </span>
        {row.hint ? (
          <span className="block text-[10.5px] text-fog-600">{row.hint}</span>
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
