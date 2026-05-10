import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Folder,
  Lock,
} from "lucide-react";
import type { FileTreeEntry, FileTreeResult } from "../../lib/types.js";

type Props = {
  data: FileTreeResult;
  selectedPath: string | null;
  onSelectFile: (relPath: string) => void;
  filter: string;
};

export function FileTreeView({ data, selectedPath, onSelectFile, filter }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set([""]));
  const filtered = useMemo(
    () => (filter ? filterTree(data.tree, filter.toLowerCase()) : data.tree),
    [data.tree, filter],
  );
  if (!filtered) {
    return (
      <div className="px-3 py-4 text-[11.5px] text-amaco-fg-muted">
        No matches for “{filter}”.
      </div>
    );
  }
  return (
    <ul className="text-[12px]">
      {(filtered.children ?? []).map((c) => (
        <Node
          key={c.path}
          entry={c}
          depth={0}
          open={open}
          setOpen={setOpen}
          onSelectFile={onSelectFile}
          selectedPath={selectedPath}
        />
      ))}
      {filtered.truncated ? (
        <li className="px-2 py-1 text-[10.5px] text-amaco-fg-muted">
          tree truncated — increase ?depth or maxEntries
        </li>
      ) : null}
    </ul>
  );
}

function Node({
  entry,
  depth,
  open,
  setOpen,
  onSelectFile,
  selectedPath,
}: {
  entry: FileTreeEntry;
  depth: number;
  open: Set<string>;
  setOpen: (s: Set<string>) => void;
  onSelectFile: (relPath: string) => void;
  selectedPath: string | null;
}) {
  const isDir = entry.kind === "directory";
  const expanded = open.has(entry.path);
  const padding = { paddingLeft: 6 + depth * 12 };
  const Icon = entry.isSecretLike ? Lock : isDir ? Folder : FileIcon;
  const label = entry.name;
  const selected = selectedPath === entry.path;

  return (
    <li>
      <button
        type="button"
        style={padding}
        onClick={() => {
          if (isDir) {
            const next = new Set(open);
            if (expanded) next.delete(entry.path);
            else next.add(entry.path);
            setOpen(next);
          } else if (!entry.isSecretLike) {
            onSelectFile(entry.path);
          } else {
            // still allow clicks for redaction notice
            onSelectFile(entry.path);
          }
        }}
        className={`flex w-full items-center gap-1.5 truncate py-0.5 pr-2 text-left hover:bg-amaco-panel-2 ${
          selected ? "bg-amaco-panel-2 text-amaco-fg" : "text-amaco-fg-dim"
        }`}
        title={entry.path}
      >
        {isDir ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={1.5} />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={1.5} />
          )
        ) : (
          <span className="inline-block w-3" />
        )}
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${
            entry.isSecretLike ? "text-amaco-warn" : "text-amaco-fg-muted"
          }`}
          strokeWidth={1.5}
        />
        <span className="truncate">{label}</span>
        {entry.isSecretLike ? (
          <span className="ml-auto amaco-mono text-[9px] uppercase tracking-[0.1em] text-amaco-warn">
            redacted
          </span>
        ) : null}
      </button>
      {isDir && expanded && entry.children
        ? entry.children.map((c) => (
            <Node
              key={c.path}
              entry={c}
              depth={depth + 1}
              open={open}
              setOpen={setOpen}
              onSelectFile={onSelectFile}
              selectedPath={selectedPath}
            />
          ))
        : null}
      {isDir && expanded && entry.truncated ? (
        <li
          style={{ paddingLeft: 6 + (depth + 1) * 12 }}
          className="py-0.5 text-[10.5px] text-amaco-fg-muted"
        >
          (more entries omitted)
        </li>
      ) : null}
    </li>
  );
}

function filterTree(node: FileTreeEntry, q: string): FileTreeEntry | null {
  if (node.kind === "file") {
    return node.name.toLowerCase().includes(q) ||
      node.path.toLowerCase().includes(q)
      ? node
      : null;
  }
  const kept = (node.children ?? [])
    .map((c) => filterTree(c, q))
    .filter((c): c is FileTreeEntry => c !== null);
  if (kept.length === 0 && !node.path) return null;
  if (kept.length === 0 && !node.name.toLowerCase().includes(q)) return null;
  return { ...node, children: kept };
}
