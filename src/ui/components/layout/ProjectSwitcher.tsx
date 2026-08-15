import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, ExternalLink, FolderTree, GitBranch } from "lucide-react";
import { api } from "../../lib/api.js";
import { cn } from "../design/cn.js";
import { Skeleton, SkeletonBlock } from "../design/Skeleton.js";

type Entry = {
  root: string;
  label: string;
  lastPort: number | null;
  lastOpenedAt: string;
  current: boolean;
  live: boolean;
};

/**
 * Which project you are looking at, and how to get to another one.
 *
 * This lives in the sidebar rather than in a restored top bar: the sidebar is
 * the one app shell, and the horizontal TopBar was retired deliberately. A
 * persistent project row under the brand gives the same standing context
 * without bringing back a second chrome.
 *
 * Switching is a real navigation, not a client-side tab change. Each project is
 * an isolated server tenant with its own port, so choosing one asks the backend
 * to ensure that project's server and then opens it - which is why the entries
 * carry a port and say plainly whether they are already running.
 */
export function ProjectSwitcher({
  onShowWorkspace,
  onShowSource,
}: {
  onShowWorkspace: () => void;
  onShowSource: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const meta = await api.getProjectMetadata();
        if (!cancelled) setProjectName(meta.projectName);
      } catch {
        /* the header still renders without it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.listWorkspace();
      setEntries(r.projects);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (open && entries == null) void load();
  }, [open, entries, load]);

  // Close on an outside click or Escape, so the popover can never strand the page.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = entries?.find((e) => e.current);
  const label = projectName ?? current?.label ?? "This project";
  const others = (entries ?? []).filter((e) => !e.current);

  async function openProject(entry: Entry) {
    setBusy(entry.root);
    setError(null);
    try {
      const r = await api.openWorkspaceProject(entry.root);
      window.open(r.url, "_blank", "noopener");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={rootRef} className="relative mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex w-full items-center gap-2 rounded-[11px] border border-[color:var(--line)] px-2.5 py-2 text-left transition",
          open ? "bg-coal-500" : "bg-coal-700 hover:bg-coal-500",
        )}
      >
        <FolderTree className="h-4 w-4 shrink-0 text-violet-soft" strokeWidth={1.9} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-chalk-100">
          {label}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-chalk-300" strokeWidth={1.9} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-[14px] border border-[color:var(--line)] bg-coal-700 shadow-2xl shadow-black/40"
        >
          <div className="flex items-center gap-2 border-b border-[color:var(--line-soft)] px-3 py-2.5">
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald" strokeWidth={2.2} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-chalk-100">
              {label}
            </span>
            <span className="shrink-0 text-[12px] font-semibold text-chalk-300">open</span>
          </div>

          {entries == null ? (
            <Skeleton label="Loading projects" className="flex flex-col py-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <SkeletonBlock tone="text" h={12} w={`${[62, 46, 74][i]}%`} />
                    <SkeletonBlock tone="text" h={11} w={`${[38, 52, 30][i]}%`} />
                  </div>
                  <SkeletonBlock w={14} h={14} radius={4} />
                </div>
              ))}
            </Skeleton>
          ) : others.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-chalk-300">
              No other projects.
            </p>
          ) : (
            <div className="max-h-[280px] overflow-y-auto py-1">
              {others.map((e) => (
                <button
                  key={e.root}
                  type="button"
                  role="menuitem"
                  disabled={busy === e.root}
                  onClick={() => void openProject(e)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-coal-500 disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-chalk-100">
                      {e.label}
                    </span>
                    <span className="block truncate text-[12px] text-chalk-300">
                      {busy === e.root
                        ? "Starting…"
                        : e.live
                          ? `Running on port ${e.lastPort ?? "?"}`
                          : "Not running"}
                    </span>
                  </span>
                  <ExternalLink
                    className="h-3.5 w-3.5 shrink-0 text-chalk-300"
                    strokeWidth={1.9}
                  />
                </button>
              ))}
            </div>
          )}

          {error ? (
            <p className="border-t border-[color:var(--line-soft)] px-3 py-2 text-[13px] text-rose-300">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-0.5 border-t border-[color:var(--line-soft)] p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onShowSource();
              }}
              className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] font-semibold text-chalk-300 transition hover:bg-coal-500 hover:text-chalk-100"
            >
              <GitBranch className="h-3.5 w-3.5" strokeWidth={1.9} />
              Worktrees
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onShowWorkspace();
              }}
              className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] font-semibold text-chalk-300 transition hover:bg-coal-500 hover:text-chalk-100"
            >
              <FolderTree className="h-3.5 w-3.5" strokeWidth={1.9} />
              All projects
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
