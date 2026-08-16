# Security Policy

Vibestrate is a small, open‑source, local‑first project. There's no company behind
it, no support team, and no SLA - but security reports are taken seriously and
handled privately. Use of the software is at your own risk under the
[Apache-2.0 license](../LICENSE).

## Reporting a vulnerability

**Private channel - preferred:**
[Open a GitHub Security Advisory](https://github.com/guyshonshon/vibestrate/security/advisories/new)

This gives us a private tracker and a way to coordinate a fix before public
disclosure.

**Please do _not_** open a public issue, post in discussions, or share working
exploits on social media before a fix has landed.

There is no security email address - all coordination happens through GitHub
Security Advisories.

## What to include

- The version (`vibestrate --version`) and how it's installed.
- A clear description of the issue and its impact.
- Minimal reproduction steps. Redact anything sensitive - never include real
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

Automated supply-chain scanners (e.g. Amazon Inspector) sometimes flag the
published `dist/index.js` as a **Telegram exfiltration / C2** channel on the
strength of the string `api.telegram.org` appearing in the bundle. **This is a
false positive**, and since June 2026 it is a false positive for a simpler
reason than it used to be: there is no Telegram code left to misread.

- **The bundle makes no request to Telegram, or to any other notification
  service.** The external notification gateways (webhook, Discord, Slack,
  Telegram, WhatsApp) were removed in 2026-06 so that notifications involve no
  external communication. Only two gateways ship, both local: `cli` (your
  terminal) and `inapp` (the dashboard's notification centre). Run
  `vibe gateways list` to see the whole set.
- **The only occurrence of the string is a redaction rule.**
  `src/notifications/gateways/secret-resolver.ts` carries
  `text.replace(/(https?:\/\/api\.telegram\.org\/bot[^/]+\/[^\s"]+)/g,
  "[redacted-telegram]")`, which exists to strip a bot URL out of logs if one
  ever reaches them. A scanner matching on the domain sees the defence, not an
  exfiltration path.
- **`process.env` is never enumerated or serialized.** It is read only as
  `process.env[NAME]`, for the single variable you name via `env:NAME`
  (regex `^env:([A-Z][A-Z0-9_]*)$`).

To verify: `grep -a 'api\.telegram\.org' dist/index.js` on the published tarball
returns nothing (the string is escaped inside the regex), `grep -aci telegram`
returns 3, and none of the three is a request. You can also diff a clean local
build (`pnpm build`) against the published tarball (`npm pack vibestrate`).

## Response

This is a hobby project, so responses are best‑effort, not contractual. Expect
acknowledgement within a few days and a good‑faith effort to fix and disclose
responsibly.

---

Maintained by [Guy Shonshon](https://shonshon.com) - Shonshon, Evolving Technologies.
