# Security Policy

Vibestrate is a small, open‑source, local‑first project. There's no company behind
it, no support team, and no SLA — but security reports are taken seriously and
handled privately. Use of the software is at your own risk under the
[Apache-2.0 license](./LICENSE).

## Reporting a vulnerability

**Private channel — preferred:**
[Open a GitHub Security Advisory](https://github.com/guyshonshon/vibestrate/security/advisories/new)

This gives us a private tracker and a way to coordinate a fix before public
disclosure.

**Please do _not_** open a public issue, post in discussions, or share working
exploits on social media before a fix has landed.

There is no security email address — all coordination happens through GitHub
Security Advisories.

## What to include

- The version (`vibestrate --version`) and how it's installed.
- A clear description of the issue and its impact.
- Minimal reproduction steps. Redact anything sensitive — never include real
  secrets, tokens, or private source.

## Scope worth flagging

Vibestrate's threat model centers on the fact that it runs untrusted‑ish model
output against your machine and git repo. Reports that fit that model are
especially valuable:

- A path‑guard bypass that lets a run write outside its worktree or the project
  root.
- A way to get secret‑shaped content (`.env`, keys, tokens) into a prompt,
  artifact, log, or the dashboard.
- Arbitrary command execution reachable from the local HTTP/WebSocket surface
  (Mission Control), or the browser spawning commands directly.
- Anything that causes an auto‑push or auto‑merge without explicit human action.

## Known false positives

Automated supply‑chain scanners (e.g. Amazon Inspector) sometimes flag the
published `dist/index.js` as a **Telegram exfiltration / C2** channel because
the bundle contains `fetch` → POST → `api.telegram.org` alongside `process.env`
access. **This is a false positive.** That code is the opt‑in **Telegram
notification gateway** (`src/notifications/gateways/telegram-gateway.ts`) — one
of several gateways (CLI, in‑app, webhook, Discord, Slack, Telegram) you wire up
with `vibestrate gateways add`. Specifically:

- There is **no hardcoded bot token** — the URL is `api.telegram.org/bot${token}/…`
  where `${token}` comes from *your* gateway config (a literal or `env:NAME`).
- `process.env` is read **only** as `process.env[NAME]` for the single var *you*
  named via `env:NAME` (regex `^env:([A-Z][A-Z0-9_]*)$`). The bundle never
  enumerates or serializes `process.env`.
- The POST body is *your* notification text sent to *your* chat — never host
  data or environment variables. Tokens are actively `redact()`‑ed from logs.

If you want to verify, diff a clean local build (`pnpm build`) against the
published tarball (`npm pack vibestrate`), or read the gateway source above.

## Response

This is a hobby project, so responses are best‑effort, not contractual. Expect
acknowledgement within a few days and a good‑faith effort to fix and disclose
responsibly.

---

Maintained by [Guy Shonshon](https://shonshon.com) — Shonshon, Evolving Technologies.
