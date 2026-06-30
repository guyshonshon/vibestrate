// The living branding canvas. Built from the real layout primitives + design
// components + tokens, so it can never drift from the app (unlike a static
// mockup). It is the in-app reference every page-redesign reads alongside
// docs/design/primitives-contract.md. Reachable from the sidebar ("More ->
// Branding canvas"). Verify it in BOTH themes - the tokens flip under :root.light.

import type { ReactNode } from "react";
import { LayoutList, LayoutDashboard, Layers, Play, Pause, Trash2 } from "lucide-react";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
import { Button } from "../../components/design/Button.js";
import { StatTile } from "../../components/design/StatTile.js";
import { Chip, ToneDot } from "../../components/design/Chip.js";

export function CanvasPage() {
  return (
    <PageShell>
      <PageHeader title="Branding canvas">
        <p className="mt-1 max-w-[640px] text-[13px] text-chalk-300">
          The Mission Control design language in one place - real tokens, real
          primitives, both themes. The law every page derives from.
        </p>
      </PageHeader>

      <Section title="Surfaces - elevation ramp">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Swatch surface="bg-coal-800" name="canvas" sub="coal-800" />
          <Swatch surface="bg-coal-600" name="card" sub="coal-600" />
          <Swatch surface="bg-coal-500" name="row / chip" sub="coal-500" />
          <Swatch surface="bg-coal-400" name="hover" sub="coal-400" />
        </div>
      </Section>

      <Section title="Text, accent, status">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <Token cls="text-chalk-100" name="chalk-100" sub="primary" />
          <Token cls="text-chalk-300" name="chalk-300" sub="dim" />
          <Token cls="text-chalk-400" name="chalk-400" sub="meta only" />
          <Token cls="text-violet-soft" name="violet-soft" sub="accent" />
          <Token cls="text-violet-vivid" name="violet-vivid" sub="headings" />
          <Token cls="text-emerald-400" name="emerald" sub="good" />
          <Token cls="text-amber-soft" name="amber-soft" sub="attention" />
          <Token cls="text-sky-glow" name="sky-glow" sub="info" />
          <Token cls="text-rose-300" name="rose" sub="fail" />
        </div>
      </Section>

      <Section title="Type scale - dense, font-jakarta">
        <div className="flex flex-col gap-2 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5">
          <div className="text-[24px] font-extrabold tracking-[-0.02em] text-chalk-100">
            Page title 24 / extrabold
          </div>
          <div className="text-[18px] font-bold text-violet-vivid">
            Section heading 18 / bold / violet-vivid
          </div>
          <div className="text-[14px] font-semibold text-chalk-100">Body strong 14 / semibold</div>
          <div className="text-[13px] text-chalk-300">
            Body 13 / chalk-300 - secondary copy carries color, never chalk-400
          </div>
          <div className="text-[11.5px] text-chalk-400">Meta 11.5 / chalk-400 - tertiary only</div>
        </div>
      </Section>

      <Section title="Canvas rhythm - extracted from Mission Control">
        <div className="overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-coal-600">
          <div className="p-5">
            <div className="mb-2 text-[11px] font-semibold text-violet-soft">
              page body&nbsp;&nbsp;px-10 py-7&nbsp;&nbsp;font-jakarta
            </div>
            <div className="text-[16px] font-extrabold tracking-[-0.02em] text-chalk-100">
              Header block
            </div>
            <div className="mt-0.5 text-[11px] text-chalk-400">mb-6 below the header</div>
            <div className="my-3.5 h-px bg-[color:var(--line)]" />
            <div className="text-[13px] font-bold text-violet-vivid">Section</div>
            <div className="mt-0.5 text-[11px] text-chalk-400">
              mb-4 between sections&nbsp;&middot;&nbsp;grid gap-4 / card gap-3 / tight gap-2.5
            </div>
          </div>
        </div>
      </Section>

      <Section title="Buttons - compose from components/design, never bare elements">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost" iconLeft={<Play className="h-3.5 w-3.5" strokeWidth={1.9} />}>
            Ghost
          </Button>
          <Button variant="outline">Outline</Button>
          <Button variant="danger" iconLeft={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />}>
            Destroy
          </Button>
          <button
            type="button"
            className="text-[12.5px] font-semibold text-violet-soft hover:text-violet-soft/80"
          >
            Inline link
          </button>
        </div>
      </Section>

      <Section title="Card, row, stat tiles, chip, status-as-text">
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-violet-soft/15 text-violet-soft">
              <Layers className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
            </span>
            <span className="flex-1 text-[13.5px] font-bold text-chalk-100">
              Card shell - rounded-18 / coal-600
            </span>
            <span className="text-[11px] text-chalk-400">@author</span>
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-[14px] bg-coal-500/60 px-4 py-3">
            <span className="flex-1 text-[12.5px] text-chalk-300">
              Inner row - rounded-14 / coal-500
            </span>
            <span className="text-[12px] font-semibold text-emerald-400">merge ready 3</span>
            <span className="text-[12px] font-semibold text-amber-soft">failed 1</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <StatTile value="8" label="steps" />
            <StatTile value="6" label="seats" />
            <StatTile value="v1" label="version" />
            <StatTile value="pass" label="verdict" tone="emerald" />
            <Chip tone="sky" className="self-center pl-1">
              <ToneDot tone="sky" /> chip - flat tinted, never a pill
            </Chip>
          </div>
        </div>
      </Section>

      <Section title="Page archetypes - both inherit this canvas">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Archetype
            icon={<LayoutList className="h-4 w-4 text-violet-soft" strokeWidth={1.9} aria-hidden />}
            title="Scroll dashboard"
            note="MC, config"
          >
            <div className="h-2 w-3/5 rounded-full bg-coal-500" />
            <div className="flex gap-1.5">
              <div className="h-8 flex-1 rounded-[8px] bg-coal-500" />
              <div className="h-8 flex-1 rounded-[8px] bg-coal-500" />
            </div>
            <div className="h-8 rounded-[8px] bg-coal-500" />
          </Archetype>
          <Archetype
            icon={
              <LayoutDashboard className="h-4 w-4 text-violet-soft" strokeWidth={1.9} aria-hidden />
            }
            title="Fill app view"
            note="Board kanban"
          >
            <div className="h-2 w-2/5 rounded-full bg-coal-500" />
            <div className="flex gap-1.5">
              <div className="h-14 flex-1 rounded-[8px] border-t-2 border-violet-soft bg-coal-500" />
              <div className="h-14 flex-1 rounded-[8px] border-t-2 border-emerald-400 bg-coal-500" />
              <div className="h-14 flex-1 rounded-[8px] border-t-2 border-amber-soft bg-coal-500" />
            </div>
          </Archetype>
        </div>
      </Section>

      <Section title="Banned - hard noes">
        <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-[18px] border border-[color:var(--line)] bg-coal-700 px-5 py-4 text-[12px] text-chalk-300">
          {[
            "pill-rounded labels",
            "uppercase eyebrow kickers",
            "pulse / breathing animation",
            "chalk-400 for labels",
            "naked dot + sentence",
            "grey dot-separated meta line",
            "two shells",
            "old fog-* / .slab tokens",
          ].map((b) => (
            <span key={b} className="flex items-center gap-1.5">
              <span className="font-bold text-rose-300">x</span>
              {b}
            </span>
          ))}
        </div>
      </Section>
    </PageShell>
  );
}

function Swatch({ surface, name, sub }: { surface: string; name: string; sub: string }) {
  return (
    <div className={`rounded-[12px] border border-[color:var(--line)] ${surface} p-3`}>
      <div className="text-[12px] font-semibold text-chalk-100">{name}</div>
      <div className="font-mono text-[10px] text-chalk-400">{sub}</div>
    </div>
  );
}

function Token({ cls, name, sub }: { cls: string; name: string; sub: string }) {
  return (
    <div className="rounded-[10px] border border-[color:var(--line)] bg-coal-600 px-2.5 py-2">
      <div className={`text-[12px] font-semibold ${cls}`}>{name}</div>
      <div className="font-mono text-[10px] text-chalk-400">{sub}</div>
    </div>
  );
}

function Archetype({
  icon,
  title,
  note,
  children,
}: {
  icon: ReactNode;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-[color:var(--line)] bg-coal-600 p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-bold text-chalk-100">
        {icon}
        {title}
        <span className="font-medium text-chalk-400">- {note}</span>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}
