# Security Policy

Amaco is a small, open‑source, local‑first project. There's no company behind
it, no support team, and no SLA — but security reports are taken seriously and
handled privately. Use of the software is at your own risk under the
[MIT license](./LICENSE).

## Reporting a vulnerability

**Private channel — preferred:**
[Open a GitHub Security Advisory](https://github.com/guyshonshon/amaco/security/advisories/new)

This gives us a private tracker and a way to coordinate a fix before public
disclosure.

**Please do _not_** open a public issue, post in discussions, or share working
exploits on social media before a fix has landed.

There is no security email address — all coordination happens through GitHub
Security Advisories.

## What to include

- The version (`amaco --version`) and how it's installed.
- A clear description of the issue and its impact.
- Minimal reproduction steps. Redact anything sensitive — never include real
  secrets, tokens, or private source.

## Scope worth flagging

Amaco's threat model centers on the fact that it runs untrusted‑ish model
output against your machine and git repo. Reports that fit that model are
especially valuable:

- A path‑guard bypass that lets a run write outside its worktree or the project
  root.
- A way to get secret‑shaped content (`.env`, keys, tokens) into a prompt,
  artifact, log, or the dashboard.
- Arbitrary command execution reachable from the local HTTP/WebSocket surface
  (Mission Control), or the browser spawning commands directly.
- Anything that causes an auto‑push or auto‑merge without explicit human action.

## Response

This is a hobby project, so responses are best‑effort, not contractual. Expect
acknowledgement within a few days and a good‑faith effort to fix and disclose
responsibly.

---

Maintained by [Guy Shonshon](https://shonshon.com) — Shonshon, Evolving Technologies.
