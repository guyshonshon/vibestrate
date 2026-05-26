# Design: Guides Hub

Status: **planning — core decisions settled** · Tracking issue: #3 · Owner: maintainer

Settled: flat unique names · separate `amaco-guides` repo · curated PR-based v1
(Docker "Official Images" model) · GitHub OAuth if a service is added later ·
free git-backed v1 with a hosted service deferred. See "Settled decisions".

A place to **discover, share, and install Guides** other people publish, with
**stars** and **download** metrics — npm / Docker Hub, but for Amaco Guides.

---

## Why Guides are the right thing to share

A Guide is the cleanest unit in Amaco to make portable:

- **It's declarative data, not code.** `guideDefinitionSchema`
  (`src/guides/schemas/guide-schema.ts`) validates a `guide.yml` of slots +
  steps. Installing one writes a file under `.amaco/guides/<id>/`; **nothing
  executes** until the user runs it. So a registry is low‑risk by construction.
- **We already fork/discover/shadow them.** `forkGuideToProject`,
  `deleteProjectGuide`, and project‑shadows‑builtin discovery
  (`src/guides/catalog/guide-discovery.ts`) already exist. "Install from hub"
  is a sibling of "fork a builtin."
- **They're small and reviewable.** A guide is a few KB of YAML. Easy to scan,
  diff, and moderate.

## Local‑first stance (the non‑negotiable)

Amaco's invariant: *no cloud backend / no relay for your runs.* The hub does
**not** violate it. It's an **opt‑in catalog** you explicitly publish to and
pull from — like `npm install`. Your code, prompts, and runs never touch it.
The core tool stays fully functional offline; the hub is a separate, optional
surface. This must remain true through every phase.

---

## Phasing

### Phase 1 — git‑backed index (zero infra) ← build this first

A public GitHub repo (`guyshonshon/amaco-guides`) is the registry. No service
to run, no database, no auth to build — GitHub provides hosting, identity (PRs),
and a coarse "stars" signal for free.

**Layout of the index repo**

```
amaco-guides/
  index.json                  # generated catalog (search source of truth)
  guides/
    <namespace>/<name>/
      guide.yml               # the published Guide (schema-valid)
      meta.json               # { description, author, tags, version, license }
```

**`index.json`** (built by CI in the index repo on merge):

```json
{
  "schemaVersion": 1,
  "guides": [
    { "id": "namespace/name", "version": 3, "label": "...", "description": "...",
      "tags": ["review","python"], "author": "guyshonshon",
      "path": "guides/namespace/name/guide.yml", "updatedAt": "..." }
  ]
}
```

**CLI surface** (new `amaco guides` subcommands; the command tree already exists):

- `amaco guides search <query>` — fetch `index.json`, fuzzy‑match locally, print
  matches with author + tags.
- `amaco guides install <namespace/name>` — fetch the `guide.yml`, **validate
  against `guideDefinitionSchema`**, run the secret‑shape scan, then write it
  into `.amaco/guides/<name>/` (reusing the fork write path). Refuse on invalid
  schema or a secret‑like hit.
- `amaco guides publish [<id>]` — package the project guide + a `meta.json` and
  open a **PR** to the index repo (via `gh`), or print the exact files to add.
  No write access to the index needed; review happens in the PR.

**Metrics in phase 1**

- **Stars** = ⭐ on the index repo to begin (coarse, but free and real). Later,
  per‑guide reactions or a `stars.json` updated by a GitHub Action.
- **Downloads** = not truly measurable from a static git read. Phase 1 ships
  *without* real download counts (don't fake them); phase 2 adds them.

**Emit / ingest rules** (enforced at install AND in index‑repo CI):

- Must pass `guideDefinitionSchema`.
- No secret‑shaped content (reuse the patch secret‑scan).
- Size + step caps (≤ 64 steps, ≤ N KB).
- `meta.json` declares `author`, `license`, `tags`.
- Namespaced ids (`author/name`) to avoid collisions.

**Acceptance:** `amaco guides search` / `install` pull a community guide into
`.amaco/guides/`, validated before it lands; `publish` produces an index PR.

### Phase 2 — `amaco-hub` service (Docker‑Hub‑style)

Graduate to a real registry when phase 1's limits bite (no real download
counts, PR‑gated publishing, no per‑guide stars).

**Stack — Cloudflare‑native** (we already deploy the marketing site there):

- **Worker** — the API (search, get, publish, star, metrics).
- **D1** (SQLite) — catalog rows, stars, download counters, ownership.
- **R2** — the `guide.yml` payloads (and future larger bundles).
- Optional **KV** — hot `index.json` cache.

**API sketch**

```
GET  /v1/guides?q=&tag=&sort=stars|downloads|recent
GET  /v1/guides/:namespace/:name           # metadata + versions
GET  /v1/guides/:namespace/:name/:version  # the guide.yml (increments download)
POST /v1/guides                            # publish (auth)
POST /v1/guides/:namespace/:name/star      # star (auth)
```

**Identity:** GitHub OAuth → the publisher's GitHub login is the namespace.
Publish tokens (npm‑style automation tokens) for CI. No passwords stored.

**Metrics:** real download counts (incremented on payload GET, deduped per
token/day) + stars (one per account).

**Moderation:** report flow + takedown; same schema/secret rules enforced
server‑side; ownership required to publish under a namespace.

**CLI/UI:** the same `amaco guides search/install/publish/star` point at the
service; a **Hub** tab in Mission Control browses + installs (read‑only HTTP to
the public API; install still writes locally through the existing path).

---

## Integration points (already in place)

| Need | Reuse |
|---|---|
| Validate an incoming guide | `guideDefinitionSchema` |
| Write a guide into the project | the `forkGuideToProject` write path |
| Discovery / shadowing | `discoverGuides` (project shadows builtin) |
| Secret refusal | the patch secret‑scan |
| CLI command tree | `src/cli/commands/guides/` |
| Dashboard surface | a new page like the Providers page (#4) |

## Settled decisions

- **Names are flat + globally unique** (first-come), not namespaced. Simpler
  ids; we accept the land-grab/collision tradeoff and can add a reserved-prefix
  list if it bites.
- **Separate `amaco-guides` repo** is the registry — its own repo with its own
  contributors who help review submissions (not in `amaco` or
  `amaco-marketing`).
- **v1 publishing is curated, PR-based** (Docker "Official Images" model, not
  open self-serve push): submit → automated checks + human review → listed.
- **Identity, if/when a service is added:** GitHub OAuth (login = identity).
- **Cost:** v1 is free forever (git-backed, no infra). A hosted service is a
  *later, optional* step; the maintainer is fine covering ~$5/mo if it ever
  grows — so the service is a "when demand justifies it" decision, not a
  blocker.

## Publishing & review (v1)

Modeled on Docker's **Official Images** curation, not its open push:

1. `amaco guides publish` packages the project guide + `meta.json` and opens a
   **PR** to `amaco-guides` (via `gh`; the contributor's fork is transparent).
2. **GitHub Actions on the PR run the automated gate** and post a checklist:
   - schema-valid (`guideDefinitionSchema`)
   - secret-shape scan (reuse the patch scanner)
   - **guide-safety lint** (see below)
   - structural sanity: keeps a `validation` step, keeps a review/approval
     gate, bounded `repeat`, known agent ids, size/step caps
   - `meta.json` complete (`author`, `license`, `tags`, `description`)
3. **A human reviewer** (maintainer + trusted contributors) does the final pass.
   Green-CI + low-risk guides can auto-merge after one maintainer ✅.
4. Merge → CI regenerates `index.json` → it's discoverable.

## Safety & quality assurance

Guides are declarative (no embedded code), but they are **not inert** — they can
still be hostile by:

- **Weakening supervision:** dropping the `validation`/review/approval steps so
  an executor runs unsupervised; unbounded `repeat` loops.
- **Social-engineering the human:** crafted approval-gate text
  (`reason` / `requestedAction` / `userMessage`) that pressures a rubber-stamp
  ("approve to continue…").
- **Steering agents toward risky work** via step labels/inputs that nudge the
  agent to fetch-and-run, exfiltrate, or disable guards.

Mitigations:

- **An internal QA / safety tool** (a "guide-safety linter") run in PR CI *and*
  available to reviewers: flags missing validation/review gates, suspicious
  free-text (`curl … | sh`, `rm -rf`, "ignore previous", base64 blobs, URLs in
  approval text), unbounded repeats, and unknown agent ids. Produces a score +
  reasons.
- **Human review** by the `amaco-guides` contributor team before listing.
- **Install-time validation** still runs locally (schema + secret scan) — a
  compromised index can't bypass the client checks.

## Disclaimers (must ship with the feature)

State clearly, in **all three** places, that **using an external guide is the
user's responsibility to validate before use** — "we do our best to review every
guide for safety, but you must be cautious; run untrusted guides `--read-only`
first and watch the approval gates":

1. **The app** — Mission Control shows a caution banner when browsing/installing
   a hub guide; the CLI `install` prints it.
2. **The website docs** — a dedicated docs page (e.g. `/docs/guides-hub` +
   a safety note).
3. **The repo** — the `amaco-guides` README + a `SECURITY.md`.

## Still open (later, with the service)

- Real **download** metrics + per-account **stars** (needs the service; v1 uses
  GitHub stars on the index repo and ships no fake download counts).
- Self-serve instant publish (vs the curated PR flow).
- Whether the marketing site hosts a public `/hub` browse gallery for SEO.

## Non‑goals (for now)

- Hosting runs, prompts, or any private data — ever. The hub is guides only.
- Open self-serve publish in v1 (curated PR flow instead).
- Arbitrary code execution — guides stay declarative; install never runs them.
