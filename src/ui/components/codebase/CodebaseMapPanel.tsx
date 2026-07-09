import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ApiError, api } from "../../lib/api.js";
import type { CodebaseMapResult } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { StatTile } from "../design/StatTile.js";
import { Section } from "../layout/PageShell.js";

/**
 * The "Map" mode of the Codebase page: the deterministic, auto-derived
 * snapshot `vibe learn` writes to `.vibestrate/codebase-map.json`. Read-only
 * except for the explicit Refresh action, which regenerates the same files
 * the CLI writes (`writeCodebaseMap` - no other side effects).
 */
export function CodebaseMapPanel() {
  const [result, setResult] = useState<CodebaseMapResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getCodebaseMap();
      if (mountedRef.current) setResult(r);
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof ApiError || e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const r = await api.refreshCodebaseMap();
      if (mountedRef.current) setResult(r);
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof ApiError || e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, []);

  if (loading) return <MapSkeleton />;

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-[12px] text-rose-300">
          {error}
        </div>
        <Button className="mt-3" variant="secondary" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!result?.present || !result.map) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[13px] font-semibold text-chalk-100">No codebase map yet</p>
        <p className="max-w-xs text-[12px] leading-snug text-chalk-300">
          Generate a deterministic snapshot of the stack, layout, entry points, best-effort
          routes, and tooling - the same map <span className="mono">vibe learn</span> writes.
        </p>
        <Button
          variant="primary"
          size="sm"
          disabled={refreshing}
          iconLeft={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.9} />}
          onClick={() => void refresh()}
        >
          {refreshing ? "Refreshing" : "Generate map"}
        </Button>
      </div>
    );
  }

  const map = result.map;
  const routesCount = map.httpRoutes.detected.length + map.httpRoutes.conventionFiles.length;
  const scriptEntries = Object.entries(map.project.scripts);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-stretch gap-1.5">
          <StatTile value={map.project.type} label="type" />
          <StatTile value={map.project.packageManager ?? "unknown"} label="package manager" />
          <StatTile value={map.totalTrackedFiles} label="tracked files" />
          <StatTile value={routesCount} label="routes" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {result.stale ? (
            <span className="rounded-[10px] border border-amber-soft/40 bg-amber-soft/10 px-2.5 py-1 text-[11px] font-semibold text-amber-soft">
              Generated at an older commit
            </span>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            disabled={refreshing}
            iconLeft={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.9} />}
            onClick={() => void refresh()}
          >
            {refreshing ? "Refreshing" : "Refresh map"}
          </Button>
        </div>
      </div>

      <p className="mb-4 text-[11px] text-chalk-300">
        Generated {new Date(map.generatedAt).toLocaleString()}
        {map.rev ? ` at ${map.rev.slice(0, 12)}` : ""}.
      </p>

      {scriptEntries.length > 0 ? (
        <Section title="Commands">
          <dl className="space-y-1">
            {scriptEntries.map(([name, cmd]) => (
              <div key={name} className="flex gap-2 text-[12px]">
                <dt className="mono shrink-0 font-semibold text-chalk-100">{name}</dt>
                <dd className="min-w-0 truncate text-chalk-300">{cmd}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {map.layout.length > 0 ? (
        <Section title="Layout">
          <ul className="space-y-1">
            {map.layout.map((l) => (
              <li key={l.dir} className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="mono truncate text-chalk-100">{l.dir}</span>
                <span className="num-tabular shrink-0 text-chalk-300">
                  {l.files} file{l.files === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {map.entryPoints.length > 0 ? (
        <Section title="Entry points">
          <ul className="space-y-1">
            {map.entryPoints.map((e) => (
              <li key={e} className="mono truncate text-[12px] text-chalk-100">
                {e}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {routesCount > 0 ? (
        <Section title="HTTP routes (best effort)">
          <ul className="space-y-1">
            {map.httpRoutes.detected.map((r, i) => (
              <li key={`${r.method}-${r.route}-${i}`} className="truncate text-[12px]">
                <span className="mono font-semibold text-violet-soft">{r.method}</span>{" "}
                <span className="mono text-chalk-100">{r.route}</span>{" "}
                <span className="text-chalk-300">({r.file})</span>
              </li>
            ))}
            {map.httpRoutes.conventionFiles.map((f) => (
              <li key={f} className="mono truncate text-[12px] text-chalk-300">
                {f}
              </li>
            ))}
          </ul>
          {map.httpRoutes.truncated ? (
            <p className="mt-1.5 text-[11px] text-chalk-300">
              More routes may exist - detection was capped.
            </p>
          ) : null}
        </Section>
      ) : null}

      {map.tooling.length > 0 ? (
        <Section title="Tooling">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-chalk-100">
            {map.tooling.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </Section>
      ) : null}

      {map.notes.length > 0 ? (
        <Section title="Notes">
          <ul className="space-y-1">
            {map.notes.map((n, i) => (
              <li key={i} className="text-[12px] text-chalk-300">
                {n}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

/** Static (no pulse) placeholder that echoes the ready-state geometry: a stat
 *  tile row + refresh button, then a few section-shaped blocks. */
function MapSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[52px] w-[92px] rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/40"
            />
          ))}
        </div>
        <div className="h-7 w-28 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/40" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-24 rounded-[6px] bg-coal-500/40" />
          <div className="h-3 w-full rounded-[6px] bg-coal-500/25" />
          <div className="h-3 w-5/6 rounded-[6px] bg-coal-500/25" />
          <div className="h-3 w-2/3 rounded-[6px] bg-coal-500/25" />
        </div>
      ))}
    </div>
  );
}
