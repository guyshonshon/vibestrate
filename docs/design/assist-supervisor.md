# Assist-supervisor: the cheap model that decides where it's confident

Status: DESIGN SKETCH - not built. First slice of the cost-control vision
shipped separately as `persona.reviewerProfile` (review seats pinned to a
cheaper or different-vendor profile).

## The idea

The supervisor today is deterministic: risk-signal matching that can upgrade
the flow, plus the engagement ledger. The next step is a real (cheap) model
in the supervisor's seat - consulted at GATES, never in the work itself:

- **Sizing** (exists): `flowSizing: assisted` already runs a cheap
  classifier via the read-only `runAssist` primitive. This is the pattern to
  extend.
- **Review descent**: before skipping or downgrading a review, ask the
  assist model "given this diff summary and validation evidence, is heavy
  review warranted?" - it can only ESCALATE, never skip more (same
  upgrade-only posture as personas).
- **Arbitration triage**: when reviewer findings disagree, a cheap pass can
  rank which disagreements need the expensive arbiter vs which are resolved
  mechanically.
- **Approval triage**: draft a one-paragraph recommendation next to each
  pending approval (approve/reject with reason), human still decides.

## Grounding (the user's "RAG to avoid hallucination" note)

Every consult is grounded in run evidence, not the model's imagination: the
context packet for a consult is built from the run's own artifacts
(diff snapshots, validation results, findings ledger) through the existing
`flow-context-builder` renderers - the same honest summaries the reviewer
gets, with the same secret redaction. No external retrieval; the corpus is
the run directory. If a consult cites evidence, the citation is an artifact
path the UI can open.

## Invariants (non-negotiable, same as personas)

- Advisory or escalating only: an assist verdict can ADD scrutiny or
  annotate; it never removes a safeguard, never approves on a human's
  behalf, never touches the control parsers.
- Every consult is an event (`supervisor.consulted` with prompt-artifact +
  verdict) so the Supervisor panel's decision feed shows it - cost included.
- Fail open to the safe side: an assist failure means "no opinion", and the
  deterministic path proceeds unchanged.
- The assist profile is config (`supervisor.assistProfile`), so the cost is
  a visible, user-chosen number.

## Why not yet

Each gate needs its own context packet shape + tests + an honest UI story.
Ship one gate at a time, starting with review descent (highest cost-saving
per call: it can prevent an unnecessary 3-reviewer panel).
