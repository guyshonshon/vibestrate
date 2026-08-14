// The half of an edit that no route can write.
//
// The crews map lives in project.yml, and the generic config setter refuses
// record containers on purpose, so creating a crew, adding, removing, or
// renaming a role, and the crew's own label and review-loop override all end
// here rather than behind a button that would have to invent an endpoint. The
// panel states that plainly and hands over the exact bytes: role files first,
// because a crew entry pointing at a file nobody wrote fails on its first run.
//
// YamlBlock is the flow drafter's titled-copyable-block, reused rather than
// forked so every "here is what to paste" surface reads identically. It and
// AssistCurrencyReport belong in components/design once someone can move them.

import { FileJson } from "lucide-react";
import { Section } from "../layout/PageShell.js";
import { StatTile } from "../design/StatTile.js";
import { YamlBlock } from "../flow-builder/DraftFlowPanel.js";
import type { ManualChange } from "./crew-editor-model.js";

export function CrewManualChanges({
  changes,
  creating,
}: {
  changes: ManualChange[];
  /** The crew does not exist yet, so every change is here and there is nothing
   *  to save through the API at all. */
  creating: boolean;
}) {
  if (changes.length === 0) return null;

  const fileCount = changes.reduce((n, c) => n + c.blocks.length, 0);

  return (
    <Section flush title="Saved by hand">
      <div className="rounded-[18px] border border-amber-soft/25 bg-amber-soft/[0.06] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-[78ch] text-[12.5px] leading-[1.55] text-chalk-200">
            {creating
              ? "Nothing here creates a crew. The dashboard edits roles inside a crew that already exists, so this one is saved by hand: write the role files, then put the block under crews: in your project config."
              : "These changes are structural. They live in project.yml, which no dashboard action writes, so they are yours to paste. Everything else on this page saves normally."}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <StatTile
              value={changes.length}
              label={changes.length === 1 ? "step" : "steps"}
              tone="amber"
            />
            {fileCount > 0 ? (
              <StatTile
                value={fileCount}
                label={fileCount === 1 ? "block" : "blocks"}
                icon={<FileJson className="h-3 w-3" strokeWidth={1.9} aria-hidden />}
              />
            ) : null}
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {changes.map((change, i) => (
            <div
              key={`${change.title}-${i}`}
              className="rounded-[14px] border border-[color:var(--line)] bg-coal-700 p-3.5"
            >
              <div className="text-[13px] font-bold text-chalk-100">{change.title}</div>
              <p className="mt-1 max-w-[80ch] text-[12px] leading-[1.5] text-chalk-300">
                {change.reason}
              </p>
              {change.blocks.map((block) => (
                <YamlBlock
                  key={`${block.title}-${block.path}`}
                  yaml={block.body}
                  title={block.title}
                  path={block.path}
                  className="mt-3"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
