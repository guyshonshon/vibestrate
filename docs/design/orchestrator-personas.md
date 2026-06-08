# Orchestrator personas (supervisor posture presets)

Status: **Slice 1 SHIPPED (0.7.30).** The built-in `staff-engineer` persona, the
deterministic upgrade-only flow bias (the teeth - fires on the non-`--select`
path), `--supervisor` / composer selector / `GET /api/personas` /
`vibe supervisor list`, the `persona.selected` + `persona.upgraded` events, and
the honest `independence` label on run-assurance all landed. **A second persona
`security` + its `security-review` panel shipped (0.7.31)** - it earns its place
by routing risk-tagged tasks to authn/authz + secrets + injection lenses (a
different review than `staff-engineer`), reusing the upgrade (no dynamic flow
rewriting). Deferred (per the "Minimal first slice" + "Cut-list" below): persona
reviewLens *filtering* of a single panel, mid-run auto-escalation / state changes,
an authoring UI, and the design catalog entry (earns its place with evidence). This
extends `responsible-orchestrator.md` (the spine: the
orchestrator owns judgment, bounded by deterministic evidence). It does not
introduce a new execution engine; a "persona" resolves to mechanisms that
already exist (workflow selection, the `panel-review` lens fan-out, sandbox
postures, `VIBESTRATE.md`). Ship one default; earn the rest.

This design was pressure-tested by an independent adversarial review before
being written; its verdict is recorded under "Adversarial review" below and is
baked into the non-negotiables. The headline correction: **a persona must change
behavior (which checks run, which flow/lens/posture is selected) and leave that
change as evidence - never just change the orchestrator's voice.** A
skeptical-sounding skeptic is more trustworthy and not more correct; that delta
is the exact failure mode the spine names ("laundering model confidence as
supervision"), so the design is built to make it impossible.

## Thesis

The orchestrator *is* the supervisor. The skeptical-staff-engineer posture we run
as a per-user directive (audit your own work; analyze the real decision; on
high-blast-radius work get an independent adversarial check before acting; cite
deterministic evidence) should be the product's **default character**, shipped
out of the box, **model-agnostic**, and overridable per project.

Different work wants a different judgment lens. The default is staff-engineer /
CTO-minded (correctness, risk, blast-radius). Other postures - a design/architect
lens (information architecture, UX, accessibility), a security lens (authz,
secrets, injection) - are the same machinery aimed differently. That selectable
lens is a **persona**.

## What a persona IS / IS NOT

A persona is the orchestrator's **judgment posture** - a named preset that biases
how it supervises. It is layered *on top of* the existing nouns; it does not
replace any of them:

- It is **not a Crew** (a roster of Roles that fill Seats).
- It is **not a Flow** (the ordered Steps / DAG that executes).
- It is **not a Profile** (a Provider + model + effort).
- It is closest to a **named `VIBESTRATE.md` orchestration preset**: an advisory
  posture that biases selection, sitting at the `VIBESTRATE.md` tier of the
  precedence rule - **below** every code-enforced gate.

Concretely, a persona bundles three things that already have homes, so it is a
*value*, not a new primitive:

1. a **default instruction block** (the supervisor character: how to frame the
   decision, what to be skeptical of, when to escalate) - the `VIBESTRATE.md`
   "Orchestration Preferences / Risk Rules" shape;
2. a **review lens-set** - which distinct lenses the independent-reviewer step
   spawns (already a `panel-review` capability: N lensed reviewers + arbiter);
3. **flow / posture preferences** - which Flows and sandbox postures it favors or
   avoids, feeding the existing workflow-selection service.

What a persona is explicitly **NOT allowed to carry**: a tunable
"evidence-weighting" knob. Authority is bounded by *deterministic* evidence
(validation, diff gate, policy, file facts), and that weighting is identical
across personas - it is code, not character. A persona that could down-weight
evidence is a tunable rubber stamp; that field is forbidden by design.

## Schema sketch (minimal, additive)

Personas live in config alongside crews/profiles/flows, mirroring the
`defaultCrew` / `defaultFlow` pattern. Fields are deliberately few; each must
change behavior or it does not ship.

```yaml
personas:
  staff-engineer:
    label: Staff engineer
    description: Correctness, risk, and blast-radius first. The default.
    # The supervisor character. A path keeps it diffable + reviewable like code.
    instructions: .vibestrate/personas/staff-engineer.md
    # The distinct lenses the independent-reviewer step fans out (panel-review).
    reviewLenses: [correctness, tests, security-risk]
    # Selection bias for the workflow-selection service (advisory, not a gate).
    prefersFlows: [panel-review]        # favor when blast radius warrants it
    prefersPostures: [approval-required] # for irreversible/outward actions
    # The reviewer's profile. Provider-neutral: a profile id, not a model name.
    # The orchestrator prefers a DIFFERENT model than the executor when the
    # project configures more than one (see "Independent reviewer").
    reviewerProfile: null               # null = pick the strongest available
defaultPersona: staff-engineer
```

Note what is absent: no `evidenceWeighting`, no per-persona confidence, no
ability to disable the reviewer or pick a weaker one to dodge review. Those are
omitted on purpose (see Non-negotiables).

## Selection and surfaces (UI/CLI parity)

- **`defaultPersona`** in config, defaulting to the shipped `staff-engineer`.
- **Per-run override:** `vibe run --supervisor <id>` and a dashboard selector;
  `POST /api/runs` accepts `persona`.
- **Always shown, never hidden:** a `Supervisor: <name>` line at both launch
  sites (mirroring the `Flow: <name> · <source>` line), and the resolved persona
  is persisted in the run snapshot + a `persona.selected` event.
- **`VIBESTRATE.md` can prefer a persona** (an Orchestration Preferences line);
  precedence stays Policy > `VIBESTRATE.md` > per-turn guidance, so a project's
  preference can be overridden per run but never overrides a code gate.

## The independent reviewer (model-agnostic)

The persona embodies the directive's Tier-2 step - an independent adversarial
check before high-blast-radius work - as a built-in orchestrator behavior, made
honest and provider-neutral.

**When it runs (proportional to blast radius).** Not every task. It is gated by
the *existing* evidence/escalation triggers, tuned by the persona's threshold:

- a write touches risky paths (auth, money, concurrency, migrations, secrets,
  public API, prod config);
- validation is missing or failing, or a reviewer emits credible high-severity
  findings;
- an irreversible/outward action is imminent (merge to main, push) - here the
  human's authority is retained regardless;
- the selected Flow no longer matches the discovered task shape.

Cheap, low-risk tasks get no reviewer. Review is **evidence-gated, never
persona-mandated** - a persona tunes the threshold and the lenses, it cannot
force a per-task panel that violates the efficiency rules.

**Provider-neutral, honestly labeled.** The reviewer runs on a configured Profile
(any provider), not a hardcoded model. The directive's "always the strongest
model" rule cannot survive V1 provider-neutrality, so it is reframed:

- when the project configures a **different / stronger** model, the orchestrator
  escalates the review to it and labels the verdict `independence: cross-model`;
- when only one model is available, it still runs a **fresh-context,
  adversarially-briefed** pass over the concrete diff + validation output, but
  labels it `independence: single-profile` (a same-model self-check), not
  independent verification (same model = shared blind spots).

**Bounded by deterministic evidence (can / cannot).**

| The reviewer CAN | The reviewer CANNOT |
|---|---|
| Lower the orchestrator's confidence | Raise confidence above what deterministic evidence supports |
| Surface a residual risk in plain language | Greenlight past a code-enforced gate (policy/diff/validation/approval/budget) |
| Escalate: require approval, switch to a heavier Flow at a boundary, request sandbox, block-with-evidence | Suppress a surfaced risk, or auto-merge / auto-push |
| Cite a passing validation/gate to *justify* proceeding | Launder its own prose as if it were verified evidence |
| Be skipped on low-risk work | Be disabled on Tier-2 work by persona/config to dodge review |

**Reuse, not reinvent.** The fan-out is the shipped `panel-review` DAG frontier
(N read-only lensed reviewers + an arbiter join, one writer per worktree). The
single-reviewer / clarification case reuses the `consult` assist primitive. What
is genuinely new is a **verdict artifact + event + a read-only dashboard panel**.

**Verdict artifact (sketch).**

```jsonc
{
  "persona": "staff-engineer",
  "reviewerProfile": "claude-balanced",
  "independence": "cross-model",        // or "single-profile" (same-model self-check)
  "trigger": "write touched src/auth/* + validation missing",
  "flags": [ { "claim": "...", "severity": "high", "evidence": "file:line" } ],
  "deterministicEvidence": { "validation": "2 failed", "diffGate": "passed" },
  "verdict": "escalate",                // accept | escalate | block
  "escalation": "require-approval",
  "residualRisk": "auth change unverified by tests; human sign-off requested"
}
```

Surfaced as a `supervisor.verdict` event + a "Supervisor verdict" panel on run
detail (status-tinted), with CLI parity. Spend is summed live across the reviewer
fan-out, inheriting the existing fan-out cost warning.

## Non-negotiables (the anti-laundering guardrails)

1. **Advisory tier only.** Persona text is injected at the `VIBESTRATE.md` tier,
   never where it could soften a gate. A "Security persona" saying "auth diffs
   are fine, skip the gate" cannot talk past the Action Broker / diff gate /
   validation.
2. **Behavioral or cut.** A persona must change which checks run or which
   flow/lens/posture is selected, and log *why* (which deterministic signals
   triggered it). Two personas that differ only in wording are skins and do not
   ship. The acceptance test: holding the model and the diff fixed, switching
   persona changes the selection decision and the recorded evidence.
3. **No evidence-weighting knob.** Confidence moves only on deterministic
   evidence, identically across personas.
4. **No confidence inflation.** A persona's instructions can never *raise* the
   orchestrator's confidence or *suppress* a surfaced risk; only a passing
   deterministic gate can.
5. **Reviewer independence is a property, not a setting.** Authority scales with
   actual cross-model independence, labeled honestly; same-model review can only
   lower confidence / surface risk.
6. **Humans keep authority over irreversible/outward actions** (merge, push) -
   unchanged.
7. **Persona text is committed, reviewed like code.** Built-in personas are repo
   content; a project persona lives in committed config / `VIBESTRATE.md` and is
   diff-reviewed by the human. No remote/fetched persona text.

## Catalog (ship one; earn the rest)

- **`staff-engineer` (default, ships first).** Correctness, risk, blast-radius.
  Lenses: correctness, tests, security-risk. Favors `panel-review` when evidence
  warrants; requires approval before irreversible actions. This is the directive
  made into the product's default.
- **`design-architect` (earn-it).** Information architecture, visual hierarchy,
  UX, accessibility. Lenses: ux-ia, accessibility, visual-consistency. Would
  favor frontend-shaped flows. Ships only once it demonstrably changes the
  lens-set + selection on real UI tasks (catches something the default missed).
- **`security` (SHIPPED, 0.7.31).** Authn/authz, secrets, injection. Prefers the
  built-in `security-review` panel (three read-only lenses: authn/authz,
  secrets & exposure, injection & web-request safety + an arbiter). It earns its
  place by routing a risk-tagged task to a *different* review than `staff-engineer`
  (behavioral, not tone) - via the shipped `prefersFlows` + upgrade, no dynamic
  flow rewriting. Honest scope: three LLM reviewers over the diff, capped at
  `partially_verified`, never a SAST/secret/dependency scanner.

**Proliferation discipline (the DAG doc's rule, applied):** ship one default; a
second persona ships only when real tasks show it changes lenses + selection in a
way the default does not. No user-authored persona catalog and no authoring UI in
the first slices - that is the "framework nobody uses" trap with a costume.

## Minimal first slice

Prove value behaviorally, with the smallest surface:

1. Ship the single **default supervisor instruction block** (the architect
   directive shape, model-agnostic), wired into the run brief / selection prompt.
   No selection menu yet.
2. One behavioral hook, **logged as evidence:** on risk-tagged tasks the
   supervisor's workflow selection upgrades to the existing `panel-review` with a
   named lens-set and records *which deterministic signals* (touched paths,
   missing validation) triggered it. Turning the supervisor on visibly changes
   which flow/lenses run on the same task - or the slice failed, cheaply.
3. The **independence honesty label** on the review step (`cross-model` vs
   `same-model`), with same-model review unable to raise confidence.

Everything else (the `personas` map, `--supervisor`, the catalog, the dashboard
verdict panel) layers on once the default proves out.

## Cut-list (deferred or killed)

- A user-authored persona **authoring UI** - deferred hard.
- A multi-persona **catalog** beyond the default - earn each with evidence.
- An **evidence-weighting** knob - killed (contradicts the non-negotiable model).
- Any **"independent reviewer"** claim on a single-model setup - renamed
  "self-review (same model)", no confidence-raising power.
- **Persona-mandated** reviewer-per-task - review stays evidence-gated.

## Adversarial review (recorded)

An independent Opus review argued, correctly, that the high-value 20% (a default
skeptical-supervisor posture that deterministically upgrades to `panel-review`
with a named lens-set and logs why) is fully expressible via existing mechanisms,
while the other 80% (selectable types, an evidence-weighting knob, an "independent
reviewer" framing on single-model setups, an authoring surface) pairs the two
failure modes both reference docs name: the DAG doc's "framework nobody uses" and
the spine's "laundering model confidence as supervision." Its recommendation -
fold personas in as advisory presets over existing machinery, ship one default,
make the second earn its place, and bake in the same-model honesty rule - is
adopted above. The one place this doc keeps a thin named concept (a selectable
`persona` value + a `Supervisor:` surface) rather than zero is a deliberate,
scoped concession to the product goal of selectable supervisor lenses; it
resolves to existing mechanisms and ships exactly one entry.

## Open questions

- **Persona x Crew interaction.** A persona biases supervision; a crew supplies
  roles. Do they ever conflict (a security persona over a crew with no read-only
  reviewer)? Likely resolved by the persona's lens-set mapping onto read-only
  seats the crew already provides; needs validation.
- **Lens-set vocabulary.** `reviewLenses` should be a small closed vocabulary
  mapped to prompt fragments, not free text, so personas can't smuggle behavior.
- **Threshold tuning.** How a persona raises/lowers the review trigger without
  becoming a spend dial; must stay inside the efficiency rules.
