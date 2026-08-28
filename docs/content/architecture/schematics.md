---
title: Schematics
description: Every diagram in the docs on one page, in the order the pieces depend on each other.
slug: architecture/schematics
---

## In simple words

The drawing set. Every diagram that appears on a concept page is collected here
in dependency order, so the whole system can be read in one pass rather than
found a page at a time.

<div class="docs-callout tip">

**Tip.** Each diagram links back to the page that explains it. If a picture
raises a question, that page answers it.

</div>

Nothing here is new: these are the same figures, on one sheet.

## The types, and what each one holds

Nine types, in the order they depend on each other.

| Type | What it holds | What it points at |
|---|---|---|
| [Task](/docs/concepts/task) | The intent, its checklist, its history | the runs it started |
| [Run](/docs/concepts/run) | One attempt: status, branch, worktree, verdict | a Crew, a Task, a snapshot of a Flow |
| [Flow](/docs/concepts/flow) | The ordered recipe, its seats and its loop | its own Steps and Seats, nothing else |
| [Step](/docs/concepts/workflow) | One phase: kind, stage, inputs, outputs | a Seat, when its kind takes one |
| [Seat](/docs/concepts/seat) | A label and a description. That is all | nothing. It is a slot |
| [Crew](/docs/concepts/crew) | Your roster, plus two overrides | its Roles |
| [Role](/docs/concepts/role) | Prompt, permissions, skills, the seats it fills | a Profile |
| [Profile](/docs/concepts/profile) | Model, effort, token cap, timeout | a Provider |
| [Provider](/docs/concepts/provider) | Command, args, env, settings | the binary or endpoint on your machine |

The seam falls between Seat and Role. Everything above it is what a flow ships
and can travel; everything below it is yours.

## What a flow is made of

<svg viewBox="0 0 500 236" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="A flow holds a seats map and an ordered steps array. Each step names one seat, and the seats are what a crew answers. Nothing in a flow, a step or a seat can name a model, a provider or a price.">
  <rect x="0" y="30" width="320" height="176" rx="14" fill="var(--bg-300)"/>
  <polygon points="24.87,30 36.87,13 83.13,13 95.13,30 83.13,47 36.87,47" fill="var(--violet-deep)"/>
  <text x="60" y="35" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">Flow</text>
  <rect x="24" y="66" width="130" height="52" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="89" y="90" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">seats</text>
  <text x="89" y="108" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="middle">the slots</text>
  <rect x="24" y="138" width="130" height="52" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="89" y="162" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">steps</text>
  <text x="89" y="180" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="middle">the order</text>
  <rect x="180" y="66" width="118" height="52" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="239" y="97" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Seat</text>
  <rect x="180" y="138" width="118" height="52" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="239" y="169" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Step</text>
  <path d="M158 92 L172 92" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="164,87.5 172,92 164,96.5" fill="var(--fg-200)"/>
  <path d="M158 164 L172 164" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="164,159.5 172,164 164,168.5" fill="var(--fg-200)"/>
  <path d="M239 138 L239 122" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="234.5,130 239,122 243.5,130" fill="var(--fg-200)"/>
  <text x="248" y="133" font-size="10.5" fill="var(--fg-300)" font-family="var(--font-mono)" text-anchor="start">seat</text>
  <polygon points="394.87,106 406.87,89 453.13,89 465.13,106 453.13,123 406.87,123" fill="var(--violet-deep)"/>
  <text x="430" y="111" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">Crew</text>
  <path d="M302 92 L340 92 L340 106 L382 106" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="374,101.5 382,106 374,110.5" fill="var(--fg-200)"/>
  <text x="344" y="84" font-size="10.5" fill="var(--fg-300)" font-family="var(--font-mono)" text-anchor="start">answered by</text>
  <text x="0" y="230" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="start">no field here can name a model, a provider or a price</text>
</svg>

A flow is closed: its two references point at its own types. Explained on
[Flow](/docs/concepts/flow).

## What a profile is made of

<svg viewBox="0 0 500 316" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="A crew holds roles; a role names the profile it runs on; a profile carries the model, power, maxTokens, timeoutMs and disallowedTools and names the provider; the provider is the command that actually gets spawned.">
  <polygon points="14.87,24 26.87,7 73.13,7 85.13,24 73.13,41 26.87,41" fill="var(--violet-deep)"/>
  <text x="50" y="29" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">Crew</text>
  <polygon points="136.87,24 148.87,7 195.13,7 207.13,24 195.13,41 148.87,41" fill="var(--violet-deep)"/>
  <text x="172" y="29" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">Role</text>
  <polygon points="265.022,24 277.022,7 342.977,7 354.977,24 342.977,41 277.022,41" fill="var(--violet-deep)"/>
  <text x="310" y="29" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">Profile</text>
  <polygon points="397.74,24 409.74,7 482.26,7 494.26,24 482.26,41 409.74,41" fill="var(--violet-deep)"/>
  <text x="446" y="29" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">Provider</text>
  <path d="M88 24 L132 24" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="124,19.5 132,24 124,28.5" fill="var(--fg-200)"/>
  <path d="M212 24 L262 24" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="254,19.5 262,24 254,28.5" fill="var(--fg-200)"/>
  <path d="M358 24 L400 24" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="392,19.5 400,24 392,28.5" fill="var(--fg-200)"/>
  <path d="M310 44 L310 60" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="305.5,52 310,60 314.5,52" fill="var(--fg-200)"/>
  <rect x="150" y="66" width="350" height="180" rx="14" fill="var(--bg-300)"/>
  <text x="172" y="100" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">provider</text>
  <text x="478" y="100" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">-&gt; Provider</text>
  <text x="172" y="125" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">model</text>
  <text x="478" y="125" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">string | null</text>
  <text x="172" y="150" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">power</text>
  <text x="478" y="150" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">string | null</text>
  <text x="172" y="175" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">maxTokens</text>
  <text x="478" y="175" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">number | null</text>
  <text x="172" y="200" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">timeoutMs</text>
  <text x="478" y="200" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">number | null</text>
  <text x="172" y="225" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">disallowedTools</text>
  <text x="478" y="225" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">string[] | null</text>
  <text x="0" y="104" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">The profile is the</text>
  <text x="0" y="128" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">join: the only place</text>
  <text x="0" y="152" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">a model, an effort</text>
  <text x="0" y="176" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">level, a token cap</text>
  <text x="0" y="200" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">and a timeout are</text>
  <text x="0" y="224" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">named together.</text>
  <text x="0" y="282" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">Five of the six default to null: whatever the provider does by default.</text>
  <text x="0" y="306" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="start">timeoutMs unset is what an unattended run has to bound another way.</text>
</svg>

The profile is the join, and the only place a model, an effort level, a token cap
and a timeout are named together. Explained on
[Profile](/docs/concepts/profile).

## What a run is made of

<svg viewBox="0 0 500 266" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="A run carries its own identity, branch, worktree and verdict, plus a snapshot of the flow it resolved. Four of those fields are what make a run resumable after the process that started it is gone.">
  <rect x="0" y="22" width="286" height="208" rx="14" fill="var(--bg-300)"/>
  <polygon points="30.1525,22 42.1525,5 81.8475,5 93.8475,22 81.8475,39 42.1525,39" fill="var(--violet-deep)"/>
  <text x="62" y="27" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">Run</text>
  <text x="20" y="76" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">runId</text>
  <text x="266" y="76" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">its identity</text>
  <text x="20" y="101" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">status</text>
  <text x="266" y="101" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">one of sixteen</text>
  <text x="20" y="126" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">branchName</text>
  <text x="266" y="126" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">its own branch</text>
  <text x="20" y="151" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">worktreePath</text>
  <text x="266" y="151" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">outside the repo</text>
  <text x="20" y="176" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">flow</text>
  <text x="266" y="176" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">the snapshot</text>
  <text x="20" y="201" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">crewId</text>
  <text x="266" y="201" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">-&gt; Crew</text>
  <rect x="330" y="44" width="170" height="56" rx="10" fill="var(--bg-200)" stroke="var(--violet-soft)" stroke-width="1.75"/>
  <text x="415" y="70" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">resumable</text>
  <text x="415" y="88" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="middle">status + loops + flow</text>
  <rect x="330" y="150" width="170" height="56" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="415" y="176" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">auditable</text>
  <text x="415" y="194" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="middle">events + actions</text>
  <path d="M286 100 L308 100 L308 72 L326 72" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="318,67.5 326,72 318,76.5" fill="var(--fg-200)"/>
  <path d="M286 150 L308 150 L308 178 L326 178" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="318,173.5 326,178 318,182.5" fill="var(--fg-200)"/>
  <text x="0" y="258" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">enough state to be picked back up after the owning process is gone</text>
</svg>

Enough state to be resumed, and enough evidence to be audited. Explained on
[Run](/docs/concepts/run).

## The default flow

<svg viewBox="0 0 500 246" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="The default flow runs plan, architecture, implement and validate in order, then review. Review approved goes straight to verify; changes requested goes to fix, then re-validate, and back to review at most three times.">
  <rect x="0" y="8" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="58" y="35" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Plan</text>
  <rect x="128" y="8" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="186" y="35" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Architecture</text>
  <rect x="256" y="8" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="314" y="35" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Implement</text>
  <rect x="384" y="8" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="442" y="35" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Validate</text>
  <path d="M116 30 L128 30" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="120,25.5 128,30 120,34.5" fill="var(--fg-200)"/>
  <path d="M244 30 L256 30" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="248,25.5 256,30 248,34.5" fill="var(--fg-200)"/>
  <path d="M372 30 L384 30" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="376,25.5 384,30 376,34.5" fill="var(--fg-200)"/>
  <path d="M442 52 L442 68 L58 68 L58 80" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="53.5,72 58,80 62.5,72" fill="var(--fg-200)"/>
  <rect x="0" y="84" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--violet-soft)" stroke-width="1.75"/>
  <text x="58" y="111" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Review</text>
  <path d="M116 106 L380 106" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="372,101.5 380,106 372,110.5" fill="var(--fg-200)"/>
  <text x="248" y="98" font-size="10.5" fill="var(--fg-300)" font-family="var(--font-mono)" text-anchor="middle">approved</text>
  <rect x="384" y="84" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="442" y="111" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Verify</text>
  <path d="M58 128 L58 152 L124 152" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="116,147.5 124,152 116,156.5" fill="var(--fg-200)"/>
  <text x="134" y="146" font-size="10.5" fill="var(--fg-300)" font-family="var(--font-mono)" text-anchor="start">changes requested</text>
  <rect x="128" y="158" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="186" y="185" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Fix</text>
  <path d="M244 180 L252 180" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="244,175.5 252,180 244,184.5" fill="var(--fg-200)"/>
  <rect x="256" y="158" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="314" y="185" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Re-validate</text>
  <path d="M372 180 L466 180 L466 216 L34 216 L34 132" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="29.5,140 34,132 38.5,140" fill="var(--fg-200)"/>
  <text x="250" y="232" font-size="10.5" fill="var(--fg-300)" font-family="var(--font-mono)" text-anchor="middle">at most 3 passes</text>
</svg>

Eight steps and one bounded cycle. Explained on
[Steps](/docs/concepts/workflow).

## How a run is driven

<svg viewBox="0 0 500 320" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="The vibe CLI, Mission Control and the vibe shell all reach the same run launcher, which drives the orchestrator. Everything the orchestrator drives - the worktree, the provider CLI and validation commands - crosses the Action Broker first.">
  <polygon points="17.74,22 29.74,5 102.26,5 114.26,22 102.26,39 29.74,39" fill="var(--violet-deep)"/>
  <text x="66" y="27" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">vibe CLI</text>
  <polygon points="178.762,22 190.762,5 309.238,5 321.238,22 309.238,39 190.762,39" fill="var(--violet-deep)"/>
  <text x="250" y="27" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">Mission Control</text>
  <polygon points="379.175,22 391.175,5 476.825,5 488.825,22 476.825,39 391.175,39" fill="var(--violet-deep)"/>
  <text x="434" y="27" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">vibe shell</text>
  <path d="M66 42 L66 62 L250 62" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="242,57.5 250,62 242,66.5" fill="var(--fg-200)"/>
  <path d="M434 42 L434 62 L250 62" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="242,57.5 250,62 242,66.5" fill="var(--fg-200)"/>
  <path d="M250 42 L250 74" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="245.5,66 250,74 254.5,66" fill="var(--fg-200)"/>
  <rect x="140" y="78" width="220" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="250" y="105" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">run-launcher</text>
  <path d="M250 122 L250 136" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="245.5,128 250,136 254.5,128" fill="var(--fg-200)"/>
  <rect x="100" y="140" width="300" height="56" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="250" y="166" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Orchestrator</text>
  <text x="250" y="184" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="middle">state, steps, budget, gates</text>
  <path d="M250 196 L250 210" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="245.5,202 250,210 254.5,202" fill="var(--fg-200)"/>
  <rect x="40" y="214" width="420" height="46" rx="14" fill="var(--violet-deep)"/>
  <text x="250" y="243" font-size="15" font-weight="600" fill="#ffffff" text-anchor="middle">Action Broker</text>
  <path d="M110 260 L110 274" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="105.5,266 110,274 114.5,266" fill="var(--fg-200)"/>
  <path d="M250 260 L250 274" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="245.5,266 250,274 254.5,266" fill="var(--fg-200)"/>
  <path d="M390 260 L390 274" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="385.5,266 390,274 394.5,266" fill="var(--fg-200)"/>
  <rect x="20" y="278" width="160" height="40" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="100" y="303" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">git worktree</text>
  <rect x="190" y="278" width="120" height="40" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="250" y="303" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">provider CLI</text>
  <rect x="320" y="278" width="160" height="40" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="400" y="303" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">validation</text>
</svg>

Three front doors, one core, one boundary. Explained on
[Architecture overview](/docs/architecture/overview).

## What one turn does

<svg viewBox="0 0 500 300" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="A role turn assembles its prompt, resolves permissions, asks the broker to allow a provider spawn, then spawns a detached child process. Vibestrate cannot see inside that process: only the stream comes back, and is normalized into artifacts.">
  <rect x="0" y="0" width="216" height="42" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="108" y="26" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">prompt assembled</text>
  <path d="M108 42 L108 48" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="103.5,40 108,48 112.5,40" fill="var(--fg-200)"/>
  <rect x="0" y="52" width="216" height="42" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="108" y="78" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">permissions resolved</text>
  <path d="M108 94 L108 100" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="103.5,92 108,100 112.5,92" fill="var(--fg-200)"/>
  <rect x="0" y="104" width="216" height="42" rx="10" fill="var(--bg-200)" stroke="var(--violet-soft)" stroke-width="1.75"/>
  <text x="108" y="130" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">broker: provider.spawn</text>
  <path d="M108 146 L108 152" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="103.5,144 108,152 112.5,144" fill="var(--fg-200)"/>
  <rect x="0" y="156" width="216" height="42" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="108" y="182" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">resilience loop</text>
  <path d="M108 198 L108 214" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="103.5,206 108,214 112.5,206" fill="var(--fg-200)"/>
  <rect x="0" y="218" width="216" height="42" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="108" y="244" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">normalize and assess</text>
  <rect x="262" y="8" width="238" height="182" rx="14" fill="var(--bg-300)" stroke="var(--violet-deep)" stroke-width="1.5"/>
  <text x="278" y="34" font-size="15" font-weight="600" fill="var(--fg-100)">child process group</text>
  <polygon points="267.175,68 279.175,51 364.825,51 376.825,68 364.825,85 279.175,85" fill="var(--violet-deep)"/>
  <text x="322" y="73" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">vendor CLI</text>
  <polygon points="379.175,68 391.175,51 476.825,51 488.825,68 476.825,85 391.175,85" fill="var(--violet-deep)"/>
  <text x="434" y="73" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">sub-agents</text>
  <text x="280" y="116" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">nothing in here can be</text>
  <text x="280" y="140" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">intercepted per tool</text>
  <text x="280" y="164" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">or per request</text>
  <path d="M220 92 L258 92" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="250,87.5 258,92 250,96.5" fill="var(--fg-200)"/>
  <path d="M258 134 L224 134" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="232,129.5 224,134 232,138.5" fill="var(--fg-200)"/>
  <text x="0" y="288" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="start">ask gates each change, never each command</text>
</svg>

The box on the right is the part Vibestrate cannot see into, which is why the
permission model gates changes rather than commands. Explained on
[Architecture overview](/docs/architecture/overview).

## How a failed turn is resolved

<svg viewBox="0 0 500 272" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="A failed turn is checked first for a typed stall code, then classified from its stderr text. Stall, rate-limit and transient retry with backoff; usage-limit waits for its reset window; both then try a fallback profile. Hard skips all of it.">
  <rect x="0" y="24" width="140" height="40" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="70" y="49" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">turn failed</text>
  <path d="M70 64 L70 74" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="65.5,66 70,74 74.5,66" fill="var(--fg-200)"/>
  <rect x="0" y="78" width="140" height="40" rx="10" fill="var(--bg-200)" stroke="var(--violet-soft)" stroke-width="1.75"/>
  <text x="70" y="103" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">typed stall?</text>
  <path d="M70 118 L70 128" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="65.5,120 70,128 74.5,120" fill="var(--fg-200)"/>
  <rect x="0" y="132" width="140" height="40" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="70" y="157" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">match stderr</text>
  <rect x="186" y="8" width="122" height="36" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="247" y="31" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">stall</text>
  <rect x="186" y="54" width="122" height="36" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="247" y="77" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">rate-limit</text>
  <rect x="186" y="100" width="122" height="36" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="247" y="123" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">transient</text>
  <rect x="186" y="152" width="122" height="36" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="247" y="175" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">usage-limit</text>
  <rect x="186" y="210" width="122" height="36" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="247" y="233" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">hard</text>
  <path d="M140 98 L164 98 L164 26 L180 26" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="172,21.5 180,26 172,30.5" fill="var(--fg-200)"/>
  <path d="M140 152 L168 152 L168 72 L180 72" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="172,67.5 180,72 172,76.5" fill="var(--fg-200)"/>
  <path d="M168 118 L180 118" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="172,113.5 180,118 172,122.5" fill="var(--fg-200)"/>
  <path d="M168 170 L180 170" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="172,165.5 180,170 172,174.5" fill="var(--fg-200)"/>
  <path d="M168 228 L180 228" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="172,223.5 180,228 172,232.5" fill="var(--fg-200)"/>
  <rect x="340" y="24" width="160" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="420" y="51" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">retry with backoff</text>
  <rect x="340" y="88" width="160" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="420" y="115" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">wait for the window</text>
  <rect x="340" y="168" width="160" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="420" y="195" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">fallback, then fail</text>
  <path d="M308 26 L322 26 L322 46 L334 46" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="326,41.5 334,46 326,50.5" fill="var(--fg-200)"/>
  <path d="M308 118 L322 118 L322 46" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="314,41.5 322,46 314,50.5" fill="var(--fg-200)"/>
  <path d="M308 170 L328 170 L328 110 L334 110" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="326,105.5 334,110 326,114.5" fill="var(--fg-200)"/>
  <path d="M420 68 L420 80" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="415.5,72 420,80 424.5,72" fill="var(--fg-200)"/>
  <path d="M420 132 L420 160" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="415.5,152 420,160 424.5,152" fill="var(--fg-200)"/>
  <path d="M308 228 L328 228 L328 190 L334 190" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="326,185.5 334,190 326,194.5" fill="var(--fg-200)"/>
  <text x="0" y="264" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="start">the stall code is read structurally, never matched as text</text>
</svg>

The class decides which rung the turn enters at, and only `hard` skips the ladder
entirely. Explained on [Safety](/docs/concepts/safety).

## Related

- [Architecture overview](/docs/architecture/overview) - how the pieces fit together.
- [Repository map](/docs/architecture/directory-map) - where each module lives.
- [`project.yml` reference](/docs/reference/config) - the generated, field-by-field schema.
