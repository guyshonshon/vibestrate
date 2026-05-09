import { RunList } from "../../components/runs/RunList.js";

export function RunsPage({ onSelect }: { onSelect: (runId: string) => void }) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-amaco-border bg-amaco-panel px-6 py-4">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          runs
        </div>
        <h1 className="mt-1 text-[16px] font-medium">All runs</h1>
        <div className="mt-1 text-[12.5px] text-amaco-fg-dim">
          Click a run to inspect it. Polled every 4s.
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <RunList onSelect={onSelect} />
      </div>
    </div>
  );
}
