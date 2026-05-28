# Hand-off prompt — claude.ai/design: Vibestrate "Flows Hub" UI

> Paste everything under the line into claude.ai/design. It's written to be
> self-contained. It targets a **dark, glassy, local-first developer tool**, and
> it matches Vibestrate's existing Mission Control design system (tokens below) so the
> result drops into the app with minimal rework.

---

## Design a "Flows Hub" surface for Vibestrate (Mission Control dashboard)

### What Vibestrate is

Vibestrate is a **local-first multi-agent orchestrator** for coding agents. It runs
entirely on the developer's machine — no cloud backend, no hosted relay. It
drives local coding-agent CLIs (Claude Code, Gemini, Codex, Ollama, Aider…) and
coordinates them through declarative **Flows**. Its dashboard is called
**Mission Control**: a dark, calm, high-density "command center," not a
consumer SaaS app.

### What a "Flow" is

A Flow is a **declarative YAML recipe** (slots + steps) that defines how a team
of agents collaborates on a task — e.g. *plan → implement → review → verify*,
with human approval gates. Flows are small, reviewable data (no embedded code).
Today users fork/customize them in a Flow Builder. They are the unit Vibestrate wants
to make shareable.

### What the Flows Hub is (what you're designing)

A **registry browser inside Mission Control** — "npm / Docker Hub, but for Vibestrate
Flows." It lets a developer **discover, inspect, install, and publish** Flows
that other people share. It is **opt-in and read-mostly**: browsing fetches a
public catalog over HTTP; installing writes a flow file locally; nothing
executes on install. Think Docker Hub's clarity, VS Code's extension gallery's
density, and Vercel/Linear's restraint — on a near-black canvas.

### Versioning model (must be visible in the UI)

Flows are versioned **semver, Docker-style**:
- references: `name`, `name:1.2.0` (exact), `name:1` (highest 1.x), `name:latest`
- `latest` = highest published **stable** version (auto)
- a published version is **immutable**
- installs are **pinned** (record name + version + hash); the UI surfaces
  "update available" and "outdated."

### Metrics
- **Stars** (community signal) and **Downloads** (popularity). Show them, but
  they are secondary to trust signals (author, version, safety status).

---

## Screens & states to design

Design these as **pages/panels within an existing dark dashboard shell** (assume
a left/utility nav already exists — don't redesign global chrome; design the Hub
content area). Each screen needs: empty, loading, populated, and error states.

1. **Browse / Search (the gallery)**
   - Prominent but compact search field + filters (tags, sort: stars / downloads
     / recent / relevance).
   - A responsive grid (or dense list) of **Flow cards**. Each card:
     flow name, one-line description, author handle, `latest` version chip,
     tags, ⭐ stars, ⬇ downloads, and a **safety status** indicator
     (e.g. "reviewed ✓" / "community" / "flagged").
   - A "featured / official" row is acceptable (Docker Official Images vibe).

2. **Flow detail**
   - Header: name, author, `latest` chip, stars/downloads, **Install** action.
   - The **install command** shown copyable: `vibestrate flows install <name>` (and
     the pinned `name:1.2.0` form).
   - A **version selector / history** (list of semver versions, dates, "latest").
   - Readable summary of the flow's **flow**: the ordered steps and which
     **agent role** runs each, and which steps are **human-approval gates**
     (this is the trust-building core — show the recipe at a glance, like a
     pipeline diagram or a vertical step list).
   - Tabs or sections: Overview · Steps/Flow · Versions · Safety.
   - A **safety/caution panel** (see disclaimers).

3. **Installed / My flows**
   - List of locally installed hub flows with their **pinned version**,
     "update available → X.Y.Z" affordance, and an **outdated** filter.
   - Actions: update, open in Flow Builder, remove.

4. **Publish flow**
   - A flowd form/preview to publish a local project flow: pick the flow,
     set semver + tags + license + description, run the **pre-publish checks**
     (schema valid · secret-scan clean · safety lint score), and "Open PR."
   - Make the **checklist/gate results** legible (pass/warn/fail rows).

5. **Safety / disclaimer** (recurring component)
   - A persistent, non-alarmist **caution banner** when browsing/installing a
     community flow: *"Using an external flow is your responsibility to
     validate. We review for safety, but be cautious — run untrusted flows
     `--read-only` first and watch the approval gates."* Design a reusable
     callout for this (info tone, not error tone).

---

## Design system — match these exactly

Vibestrate's Mission Control is **dark-only**, near-black, with violet/cyan accents,
glass surfaces, and a grotesque display typeface. Use these tokens verbatim.

**Color (CSS custom-prop values):**
- Canvas / ink (darkest → lighter panels):
  `#06070b` · `#0a0c12` · `#0e1118` · `#13171f` · `#191e29` · `#222837`
- Text / "fog" (brightest → dim): `#f4f5fa` · `#c9ccd9` · `#9aa0b3` · `#6a7186`
  · `#4a5063`
- Accents: violet-soft `#a78bfa`, violet-mid `#8b7cff`, violet-deep `#6951f0`,
  sky-glow `#7cc5ff`
- Status: success `#4ade80`, info `#7cc5ff`, warn `#fbbf24`, fail `#fb7185`
- Hairline borders: `rgba(255,255,255,0.06–0.14)`. Backdrop: subtle radial
  violet/cyan washes on near-black.

**Type:**
- **Display / big titles & headings → "Bricolage Grotesque"** (variable), weight
  ~500, tight tracking (`-0.02em`). Keep heros **compact** — Vibestrate recently
  minimized oversized hero titles; favor a small mono **eyebrow** + a modest
  (~21–24px) title + a 13px subtitle, not giant marketing type.
- **Body / UI → "Geist"** (sans). **Mono → "Geist Mono"** (code, version chips,
  the install command, counts).
- **Eyebrow** label style: Geist Mono, ~10.5px, UPPERCASE, letter-spacing
  `0.18em`, color `#6a7186`.

**Surfaces & components:**
- **Glass panels**: translucent dark fill (`rgba(14,17,24,0.55)`) + `blur(18px)
  saturate(140%)`, 14px radius, 1px hairline border, soft inset top highlight +
  large soft drop shadow.
- **Chips/badges**: small pill, hairline border, tinted by tone (violet for
  "recommended/official", neutral, sky for "detected/info", emerald for
  ok, amber for warn, rose for fail). Version chips are mono.
- **Buttons**: primary = violet fill; secondary = subtle filled; outline =
  hairline. Small sizes, calm, not chunky.
- Density: developer-tool dense. Generous but not airy. Tabular numbers for
  stars/downloads/versions.

**Feel:** calm, precise, trustworthy, "engineered." Closer to Linear / Vercel /
Raycast than to a colorful marketplace. The accent violet is a highlight, not a
fill — most of the screen is near-black + fog text + hairlines.

---

## Constraints & notes
- **Local-first framing matters.** This is not a social network. Emphasize
  trust signals (author, version, immutability, safety review) over vanity.
- **Nothing runs on install** — the UI should make "install = download a
  reviewable file" obvious; running is a separate, later, supervised action.
- Don't design global app chrome (top bar / left nav already exist). Focus on
  the Hub content area, but show how it sits inside a dark shell.
- Deliver: the **Browse gallery**, a **Flow detail** page, and the **Safety
  callout** as the three priority artifacts; Installed + Publish as secondary.
- Responsive: works at a wide desktop dashboard width and degrades to a single
  column. Dark mode only.
