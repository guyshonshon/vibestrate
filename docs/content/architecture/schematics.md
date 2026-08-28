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

<svg viewBox="0 0 560 196" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A flow holds a seats map and an ordered steps array. Each step names one seat, and the seats are what a crew answers. Nothing in a flow, a step or a seat can name a model, a provider or a price.">
  <g fill="currentColor" fill-opacity="0.04">
    <rect x="0" y="0" width="560" height="150" rx="10"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="20.5" y="30.5" width="150" height="46" rx="8"/>
    <rect x="20.5" y="90.5" width="150" height="46" rx="8"/>
    <rect x="230.5" y="30.5" width="140" height="46" rx="8"/>
    <rect x="230.5" y="90.5" width="140" height="46" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="420.5" y="60.5" width="130" height="46" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M174 53 L224 53"/>
    <path d="M174 113 L224 113"/>
    <path d="M300 90 L300 80"/>
    <path d="M374 53 L392 53 L392 83 L416 83"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="218,49.5 224,53 218,56.5"/>
    <polygon points="218,109.5 224,113 218,116.5"/>
    <polygon points="296.5,86 300,80 303.5,86"/>
    <polygon points="410,79.5 416,83 410,86.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="95" y="52">seats</text>
    <text x="95" y="112">steps</text>
    <text x="300" y="52">Seat</text>
    <text x="300" y="112">Step</text>
    <text x="485" y="82">Crew</text>
  </g>
  <g fill="currentColor" fill-opacity="0.62" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="10" y="17" text-anchor="start">flow</text>
    <text x="95" y="67">label, description</text>
    <text x="95" y="127">ordered, 1 or more</text>
    <text x="300" y="67">a slot to fill</text>
    <text x="300" y="127">kind, stage, io</text>
    <text x="485" y="97">your roster</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10.5" font-family="ui-monospace,monospace">
    <text x="310" y="88" text-anchor="start">seat:</text>
    <text x="392" y="74" text-anchor="middle">answered by</text>
    <text x="0" y="176" text-anchor="start">no field here can name a model, a provider or a price</text>
  </g>
</svg>

A flow is closed: its two references point at its own types. Explained on
[Flow](/docs/concepts/flow).

## What a profile is made of

<svg viewBox="0 0 560 226" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A crew holds roles; a role names the profile it runs on; a profile names the provider and carries model, power, maxTokens, timeoutMs and disallowedTools; the provider is the command that actually gets spawned.">
  <g fill="currentColor" fill-opacity="0.04">
    <rect x="272" y="90" width="288" height="124" rx="10"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="22.5" width="112" height="42" rx="8"/>
    <rect x="150.5" y="22.5" width="112" height="42" rx="8"/>
    <rect x="454.5" y="22.5" width="106" height="42" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="300.5" y="22.5" width="116" height="42" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M116 43 L146 43"/>
    <path d="M266 43 L296 43"/>
    <path d="M420 43 L450 43"/>
    <path d="M358 66 L358 84"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="140,39.5 146,43 140,46.5"/>
    <polygon points="290,39.5 296,43 290,46.5"/>
    <polygon points="444,39.5 450,43 444,46.5"/>
    <polygon points="354.5,78 358,84 361.5,78"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="56" y="42">Crew</text>
    <text x="206" y="42">Role</text>
    <text x="358" y="42">Profile</text>
    <text x="507" y="42">Provider</text>
  </g>
  <g fill="currentColor" fill-opacity="0.62" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="56" y="57">roles</text>
    <text x="206" y="57">seats, prompt</text>
    <text x="358" y="57">the join</text>
    <text x="507" y="57">command</text>
    <text x="288" y="110" text-anchor="start" fill-opacity="0.92">provider</text>
    <text x="288" y="128" text-anchor="start" fill-opacity="0.92">model</text>
    <text x="288" y="146" text-anchor="start" fill-opacity="0.92">power</text>
    <text x="288" y="164" text-anchor="start" fill-opacity="0.92">maxTokens</text>
    <text x="288" y="182" text-anchor="start" fill-opacity="0.92">timeoutMs</text>
    <text x="288" y="200" text-anchor="start" fill-opacity="0.92">disallowedTools</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10.5" font-family="ui-monospace,monospace">
    <text x="131" y="16" text-anchor="middle">has</text>
    <text x="281" y="16" text-anchor="middle">runs on</text>
    <text x="435" y="16" text-anchor="middle">names</text>
    <text x="544" y="110" text-anchor="end">-&gt; Provider</text>
    <text x="544" y="128" text-anchor="end">string | null</text>
    <text x="544" y="146" text-anchor="end">string | null</text>
    <text x="544" y="164" text-anchor="end">number | null</text>
    <text x="544" y="182" text-anchor="end">number | null</text>
    <text x="544" y="200" text-anchor="end">string[] | null</text>
    <text x="0" y="110" text-anchor="start">five of the six default to</text>
    <text x="0" y="126" text-anchor="start">null, meaning whatever the</text>
    <text x="0" y="142" text-anchor="start">provider does by default.</text>
    <text x="0" y="166" text-anchor="start">timeoutMs left unset is</text>
    <text x="0" y="182" text-anchor="start">what an unattended run</text>
    <text x="0" y="198" text-anchor="start">has to bound some other way.</text>
  </g>
</svg>

The profile is the join, and the only place a model, an effort level, a token cap
and a timeout are named together. Explained on
[Profile](/docs/concepts/profile).

## What a run is made of

<svg viewBox="0 0 560 178" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A run carries its own identity, branch, worktree and verdict, plus a snapshot of the flow it resolved. Four of those fields are what make a run resumable after the process that started it is gone.">
  <g fill="currentColor" fill-opacity="0.04">
    <rect x="0" y="0" width="270" height="160" rx="10"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="330.5" y="96.5" width="210" height="40" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="330.5" y="20.5" width="210" height="40" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M274 62 L300 62 L300 40 L326 40"/>
    <path d="M274 96 L300 96 L300 116 L326 116"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="320,36.5 326,40 320,43.5"/>
    <polygon points="320,112.5 326,116 320,119.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="435" y="39">resumable</text>
    <text x="435" y="115">auditable</text>
  </g>
  <g fill="currentColor" fill-opacity="0.62" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="10" y="17" text-anchor="start">state.json</text>
    <text x="16" y="40" text-anchor="start" fill-opacity="0.92">runId</text>
    <text x="16" y="58" text-anchor="start" fill-opacity="0.92">status</text>
    <text x="16" y="76" text-anchor="start" fill-opacity="0.92">branchName</text>
    <text x="16" y="94" text-anchor="start" fill-opacity="0.92">worktreePath</text>
    <text x="16" y="112" text-anchor="start" fill-opacity="0.92">flow</text>
    <text x="16" y="130" text-anchor="start" fill-opacity="0.92">crewId</text>
    <text x="16" y="148" text-anchor="start" fill-opacity="0.92">reviewLoopCount</text>
    <text x="435" y="54">status + loops + flow</text>
    <text x="435" y="130">events + actions + verdict</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10.5" font-family="ui-monospace,monospace">
    <text x="254" y="40" text-anchor="end">its identity</text>
    <text x="254" y="58" text-anchor="end">one of sixteen</text>
    <text x="254" y="76" text-anchor="end">its own branch</text>
    <text x="254" y="94" text-anchor="end">outside the repo</text>
    <text x="254" y="112" text-anchor="end">the snapshot</text>
    <text x="254" y="130" text-anchor="end">-&gt; Crew</text>
    <text x="254" y="148" text-anchor="end">number</text>
    <text x="330" y="76" text-anchor="start">picked back up after the</text>
    <text x="330" y="92" text-anchor="start">owning process is gone</text>
  </g>
</svg>

Enough state to be resumed, and enough evidence to be audited. Explained on
[Run](/docs/concepts/run).

## The default flow

<svg viewBox="0 0 560 180" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The default flow runs plan, architecture, implement and validate in order, then review. Review approved goes straight to verify; changes requested goes to fix, then re-validate, and back to review at most three times.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="6.5" width="131" height="34" rx="8"/>
    <rect x="143.5" y="6.5" width="131" height="34" rx="8"/>
    <rect x="286.5" y="6.5" width="131" height="34" rx="8"/>
    <rect x="429.5" y="6.5" width="131" height="34" rx="8"/>
    <rect x="143.5" y="138.5" width="131" height="34" rx="8"/>
    <rect x="286.5" y="138.5" width="131" height="34" rx="8"/>
    <rect x="429.5" y="70.5" width="131" height="34" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="0.5" y="70.5" width="131" height="34" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M135 23 L139 23"/>
    <path d="M278 23 L282 23"/>
    <path d="M421 23 L425 23"/>
    <path d="M494 40 L494 54 L66 54 L66 70"/>
    <path d="M66 104 L66 122 L209 122 L209 138"/>
    <path d="M274 155 L282 155"/>
    <path d="M417 155 L446 155 L446 122 L131 122 L131 104"/>
    <path d="M131 87 L425 87"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="133,19.5 139,23 133,26.5"/>
    <polygon points="276,19.5 282,23 276,26.5"/>
    <polygon points="419,19.5 425,23 419,26.5"/>
    <polygon points="62.5,64 66,70 69.5,64"/>
    <polygon points="205.5,132 209,138 212.5,132"/>
    <polygon points="276,151.5 282,155 276,158.5"/>
    <polygon points="127.5,110 131,104 134.5,110"/>
    <polygon points="419,83.5 425,87 419,90.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="65.5" y="27">Plan</text>
    <text x="208.5" y="27">Architecture</text>
    <text x="351.5" y="27">Implement</text>
    <text x="494.5" y="27">Validate</text>
    <text x="65.5" y="91">Review</text>
    <text x="208.5" y="159">Fix</text>
    <text x="351.5" y="159">Re-validate</text>
    <text x="494.5" y="91">Verify</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10.5" font-family="ui-monospace,monospace">
    <text x="137" y="118" text-anchor="start">changes requested</text>
    <text x="452" y="151" text-anchor="start">at most 3</text>
    <text x="278" y="80" text-anchor="middle">review approved</text>
  </g>
</svg>

Eight steps and one bounded cycle. Explained on
[Steps](/docs/concepts/workflow).

## How a run is driven

<svg viewBox="0 0 560 274" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The vibe CLI, Mission Control and the vibe shell all reach the same run launcher, which drives the orchestrator. Everything the orchestrator drives - the worktree, the provider CLI and validation commands - crosses the Action Broker first.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="0.5" width="160" height="32" rx="8"/>
    <rect x="190.5" y="0.5" width="160" height="32" rx="8"/>
    <rect x="400.5" y="0.5" width="160" height="32" rx="8"/>
    <rect x="160.5" y="60.5" width="220" height="32" rx="8"/>
    <rect x="120.5" y="110.5" width="300" height="46" rx="8"/>
    <rect x="20.5" y="234.5" width="170" height="30" rx="8"/>
    <rect x="200.5" y="234.5" width="140" height="30" rx="8"/>
    <rect x="350.5" y="234.5" width="190" height="30" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="60.5" y="174.5" width="420" height="42" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M80 32 L80 44 L270 44"/>
    <path d="M480 32 L480 44 L270 44"/>
    <path d="M270 32 L270 60"/>
    <path d="M270 92 L270 110"/>
    <path d="M270 156 L270 174"/>
    <path d="M110 216 L110 234"/>
    <path d="M270 216 L270 234"/>
    <path d="M430 216 L430 234"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="264,40.5 270,44 264,47.5"/>
    <polygon points="264,40.5 270,44 264,47.5"/>
    <polygon points="266.5,54 270,60 273.5,54"/>
    <polygon points="266.5,104 270,110 273.5,104"/>
    <polygon points="266.5,168 270,174 273.5,168"/>
    <polygon points="106.5,228 110,234 113.5,228"/>
    <polygon points="266.5,228 270,234 273.5,228"/>
    <polygon points="426.5,228 430,234 433.5,228"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="80" y="20">vibe CLI</text>
    <text x="270" y="20">Mission Control</text>
    <text x="480" y="20">vibe shell</text>
    <text x="270" y="80">run-launcher</text>
    <text x="270" y="132">Orchestrator</text>
    <text x="270" y="194">Action Broker</text>
    <text x="105" y="253">git worktree</text>
    <text x="270" y="253">provider CLI</text>
    <text x="445" y="253">validation</text>
  </g>
  <g fill="currentColor" fill-opacity="0.62" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="270" y="147">state, steps, budget, gates</text>
    <text x="270" y="209">allow / require approval / deny</text>
  </g>
</svg>

Three front doors, one core, one boundary. Explained on
[Architecture overview](/docs/architecture/overview).

## What one turn does

<svg viewBox="0 0 560 238" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A role turn assembles its prompt, resolves permissions, asks the broker to allow a provider spawn, then spawns a detached child process. Vibestrate cannot see inside that process: only the stream comes back, and is normalized into artifacts.">
  <g fill="currentColor" fill-opacity="0.04">
    <rect x="270" y="8" width="290" height="150" rx="10"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="0.5" width="220" height="32" rx="8"/>
    <rect x="0.5" y="40.5" width="220" height="32" rx="8"/>
    <rect x="0.5" y="80.5" width="220" height="32" rx="8"/>
    <rect x="0.5" y="120.5" width="220" height="32" rx="8"/>
    <rect x="292.5" y="40.5" width="110" height="34" rx="8"/>
    <rect x="422.5" y="40.5" width="116" height="34" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="0.5" y="178.5" width="220" height="32" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M110 32 L110 40"/>
    <path d="M110 72 L110 80"/>
    <path d="M110 112 L110 120"/>
    <path d="M110 160 L110 178"/>
    <path d="M224 96 L266 96"/>
    <path d="M266 140 L224 140"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="106.5,34 110,40 113.5,34"/>
    <polygon points="106.5,74 110,80 113.5,74"/>
    <polygon points="106.5,114 110,120 113.5,114"/>
    <polygon points="106.5,172 110,178 113.5,172"/>
    <polygon points="260,92.5 266,96 260,99.5"/>
    <polygon points="230,136.5 224,140 230,143.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="110" y="20">prompt assembled</text>
    <text x="110" y="60">permissions resolved</text>
    <text x="110" y="100">broker: provider.spawn</text>
    <text x="110" y="140">resilience loop</text>
    <text x="110" y="198">normalize and assess</text>
    <text x="347" y="61">vendor CLI</text>
    <text x="480" y="61">sub-agents</text>
  </g>
  <g fill="currentColor" fill-opacity="0.62" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="280" y="25" text-anchor="start">child process group</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10.5" font-family="ui-monospace,monospace">
    <text x="245" y="88" text-anchor="middle">spawn</text>
    <text x="245" y="132" text-anchor="middle">stream</text>
    <text x="292" y="105" text-anchor="start">no per-tool and no per-request</text>
    <text x="292" y="121" text-anchor="start">interception is possible here</text>
    <text x="292" y="141" text-anchor="start">this is why ask means approve</text>
    <text x="292" y="157" text-anchor="start">each change, not each command</text>
    <text x="0" y="232" text-anchor="start">exit 0 AND non-empty output, or the turn failed</text>
  </g>
</svg>

The box on the right is the part Vibestrate cannot see into, which is why the
permission model gates changes rather than commands. Explained on
[Architecture overview](/docs/architecture/overview).

## How a failed turn is resolved

<svg viewBox="0 0 560 210" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A failed turn is checked first for a typed stall code, then classified from its stderr text. Stall, rate-limit and transient retry with backoff; usage-limit waits for its reset window; both then try a fallback profile. Hard skips all of it.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="30.5" width="150" height="34" rx="8"/>
    <rect x="0.5" y="130.5" width="150" height="34" rx="8"/>
    <rect x="200.5" y="8.5" width="120" height="26" rx="8"/>
    <rect x="200.5" y="42.5" width="120" height="26" rx="8"/>
    <rect x="200.5" y="76.5" width="120" height="26" rx="8"/>
    <rect x="200.5" y="110.5" width="120" height="26" rx="8"/>
    <rect x="200.5" y="152.5" width="120" height="26" rx="8"/>
    <rect x="400.5" y="30.5" width="160" height="34" rx="8"/>
    <rect x="400.5" y="76.5" width="160" height="34" rx="8"/>
    <rect x="400.5" y="130.5" width="160" height="34" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="0.5" y="80.5" width="150" height="34" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M75 64 L75 80"/>
    <path d="M75 114 L75 130"/>
    <path d="M154 97 L176 97 L176 21 L196 21"/>
    <path d="M154 147 L180 147 L180 55 L196 55"/>
    <path d="M180 89 L196 89"/>
    <path d="M180 123 L196 123"/>
    <path d="M180 165 L196 165"/>
    <path d="M324 21 L362 21 L362 47 L396 47"/>
    <path d="M324 89 L362 89 L362 47"/>
    <path d="M324 123 L380 123 L380 93 L396 93"/>
    <path d="M480 64 L480 72"/>
    <path d="M480 110 L480 126"/>
    <path d="M324 165 L380 165 L380 147 L396 147"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="71.5,74 75,80 78.5,74"/>
    <polygon points="71.5,124 75,130 78.5,124"/>
    <polygon points="190,17.5 196,21 190,24.5"/>
    <polygon points="190,51.5 196,55 190,58.5"/>
    <polygon points="190,85.5 196,89 190,92.5"/>
    <polygon points="190,119.5 196,123 190,126.5"/>
    <polygon points="190,161.5 196,165 190,168.5"/>
    <polygon points="390,43.5 396,47 390,50.5"/>
    <polygon points="356,43.5 362,47 356,50.5"/>
    <polygon points="390,89.5 396,93 390,96.5"/>
    <polygon points="476.5,66 480,72 483.5,66"/>
    <polygon points="476.5,120 480,126 483.5,120"/>
    <polygon points="390,143.5 396,147 390,150.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="75" y="51">turn failed</text>
    <text x="75" y="101">typed stall code?</text>
    <text x="75" y="151">match stderr text</text>
    <text x="260" y="25">stall</text>
    <text x="260" y="59">rate-limit</text>
    <text x="260" y="93">transient</text>
    <text x="260" y="127">usage-limit</text>
    <text x="260" y="169">hard</text>
    <text x="480" y="51">retry with backoff</text>
    <text x="480" y="97">wait for the window</text>
    <text x="480" y="151">fallback, then fail</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10.5" font-family="ui-monospace,monospace">
    <text x="0" y="186" text-anchor="start">the stall code is read structurally, not matched as text: as text it would</text>
    <text x="0" y="202" text-anchor="start">classify hard and skip the retries, the fallback and onExhausted together</text>
  </g>
</svg>

The class decides which rung the turn enters at, and only `hard` skips the ladder
entirely. Explained on [Safety](/docs/concepts/safety).

## Related

- [Architecture overview](/docs/architecture/overview) - how the pieces fit together.
- [Repository map](/docs/architecture/directory-map) - where each module lives.
- [`project.yml` reference](/docs/reference/config) - the generated, field-by-field schema.
