---
title: Provider
description: What actually runs a model - a coding-agent CLI on your machine, or an HTTP endpoint.
slug: concepts/provider
---

## In simple words

A **Provider** is what actually runs a model. Vibestrate writes the prompt; the provider returns the answer, plus the file changes when it can edit files.

Most providers are coding-agent CLIs you already installed and logged into. Vibestrate does not hold your API keys and never logs you in: it spawns the tool you use anyway.

The **Providers** tab on the dashboard's **Crew** page is where they live. Two tiles count what is **detected** and what is **configured**; the cards group into **Popular**, **Optional**, and **Cloud APIs & local model servers**. Each carries **Set up** or **Edit**, **Set default** and **Test**, plus **Install** when a popular CLI is missing.

<div class="docs-callout tip">

**Tip.** When a provider is not authenticated, **Test** shows you the login command to run in your own terminal. It never sees the credential. That is why "your keys never touch Vibestrate" is a property of the design rather than a promise.

</div>

![Two provider cards. Claude Code, claude v2.1.227, marked recommended and configured, showing 1 profile uses and used by claude-write, with Edit, Set default and Test buttons. Codex CLI, codex v0.144.3, also recommended and configured, showing 3 profiles use and used by cheap-reviewer, claude-balanced and codex-fast.](/media/docs/scoped/provider-pair.png)

Counted by how many [[profile]]s point at them.

<div class="docs-callout">

**Did you know?** Swapping one provider for another changes nothing about how a flow, a crew or a run behaves. The provider is the line between Vibestrate and "the model", and that line is what makes a flow portable across vendors.

</div>

## The four kinds

Declared under `providers:` in `project.yml`:

<div class="docs-cards">

**`claude-code`**
Claude Code, the integration Vibestrate understands most deeply.

**`cli`**
Any other coding-agent CLI: a command, its args, and how the prompt is fed in.

**`http-api`**
A cloud model API on your own key, https only.

**`localhost-proxy`**
A model server on this machine, loopback only, so nothing leaves it.

</div>

Only one of the four reaches the network:

<svg viewBox="0 0 560 86" width="100%" style="max-width:560px;height:auto" role="img" aria-label="Three provider kinds run on your machine - claude-code, cli and localhost-proxy - and only http-api leaves it.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="16.5" width="380" height="64" rx="10"/>
    <rect x="12.5" y="42.5" width="111" height="30" rx="7"/>
    <rect x="134.5" y="42.5" width="111" height="30" rx="7"/>
    <rect x="256.5" y="42.5" width="111" height="30" rx="7"/>
    <rect x="448.5" y="42.5" width="111" height="30" rx="7"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M388 58 H437"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="437,54.5 442.5,58 437,61.5"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="13" y="34">runs on this machine</text>
    <text x="448" y="34">leaves it</text>
  </g>
  <g fill="currentColor" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="68" y="62">claude-code</text>
    <text x="190" y="62">cli</text>
    <text x="312" y="62">localhost-proxy</text>
    <text x="504" y="62">http-api</text>
  </g>
</svg>

This is what keeps the tool *local-first*, where local-first means **sovereignty, not zero-egress**: there is no Vibestrate-operated backend or relay, so you run an independent tool you fully control. Pointing a provider at a model API with your own key is your choice, and does not change that guarantee, because nothing ever flows through a service we run.

<div class="docs-callout warn">

**Use `claude-code`, not `cli`, for Claude.** A write-capable seat (`permissions: code_write`) on that provider gets `--permission-mode acceptEdits`, so the headless `claude -p` can actually apply its edits in the worktree. The seat's permission only governs Vibestrate's own broker; the underlying CLI has its *own* permission gate, and a generic `cli` provider cannot be granted through it. Set `settings.permissionMode` to override the default.

</div>

## Popular, optional, missing

Eleven CLIs ship with Vibestrate. The five under **Popular** are configured the moment they are detected, because their flags are stable enough to drive without surprises:

<div class="docs-chips"><span>claude</span><span>codex</span><span>gemini</span><span>aider</span><span>ollama</span></div>

The six under **Optional** are detected but never auto-bound. **Set up** on the card wires one into this project:

<div class="docs-chips"><span>opencode</span><span>qwen</span><span>crush</span><span>goose</span><span>cursor</span><span>amp</span></div>

<div class="docs-outcomes"><div class="docs-outcome ok"><b>ready</b><span>installed, and Vibestrate already knows the flags</span></div><div class="docs-outcome warn"><b>detected, needs setup</b><span>installed, but the flags are not guessed for you: set it up once to pick them</span></div><div class="docs-outcome stop"><b>missing</b><span>the CLI isn't installed, so there's nothing to drive</span></div></div>

Each one's command, preset args and login step are in the [providers reference](/docs/reference/providers), generated from the same table the detector reads.

**Set up** and **Edit** open the same editor: the command, its args, how the prompt is fed in, a live preview of the YAML that will be written, and **Save & test** so the fix-and-check loop stays on one screen. **Edit as YAML** switches it to **Advanced - raw provider YAML** for anything the form does not surface - environment variables, `claude-code` settings, extra args, custom headers - seeded from the saved config and validated on save. **Remove** deletes the provider from `project.yml`.

A CLI Vibestrate ships no preset for goes in through **Custom CLI**, in the third section's header. Fixing or setting up a provider is fully doable in the dashboard, without dropping to `vibe provider setup`. Authentication is the one exception by design.

One mistake worth naming: setting up the same provider twice. If Claude Code is your `claude` id, do not add a `claude-pro` and a `claude-haiku` unless the flags actually differ. One provider, several [[profile]]s.

## Your own environment comes along

By default your own Claude Code environment applies inside a run: your global `CLAUDE.md`, hooks and memory load exactly as they would in your terminal. That is deliberate - the model you tuned is the model that works your runs.

Hooks are the customization most likely to surprise you. A personal `UserPromptSubmit` "supervisor" hook fires inside *every* run turn, injecting into prompts and skewing reviewer verdicts. So `vibe doctor` flags when your `~/.claude` or project `.claude` hooks will load inside runs and a claude provider is not using safe mode. It reports only the hook event names and the settings file, never the hook commands.

For hermetic turns instead - only the prompt Vibestrate compiled, plus the skills and MCP servers it attaches explicitly - set `settings.safeMode: true` on the provider. It adds `--safe-mode`, which disables personal customizations while auth and permissions keep working.

A `claude-code` provider also streams by default (`--output-format stream-json --verbose --include-partial-messages`) so the live transcript shows the model working token by token. Set `settings.outputFormat` to take manual control.

## Cloud APIs and local model servers

**Add cloud API** and **Add local server** on the Providers tab create the two HTTP-backed kinds. Both blocks are the same shape - a `type`, an `api` family, a `baseUrl` and a `model` - and only the cloud one takes a key:

```yaml
providers:
  # Cloud API - your own key, external destination.
  anthropic-api:
    type: http-api
    api: anthropic       # or: openai
    baseUrl: https://api.anthropic.com
    model: claude-sonnet-4-5
    # env-ref ONLY - never a literal key
    apiKey: env:ANTHROPIC_API_KEY

  # Local model server - no key, no egress.
  ollama-local:
    type: localhost-proxy
    # or: openai, for OpenAI-compatible servers
    api: ollama
    baseUrl: http://localhost:11434
    model: qwen3.5
```

Rules the schema enforces:

- **`http-api`** must be **https** and **not** a localhost host; its `apiKey` must be an `env:NAME` reference, and a literal key in config is rejected. The key is resolved at call time, never written to YAML, never logged, and redacted from any error. The dashboard marks these providers **external**.
- **`localhost-proxy`** must point at a loopback host (`localhost` / `127.0.0.1` / `[::1]`), so there is **no egress**. A key is optional.

Both report **real token usage** from the API response, not estimates. They run one request per turn with no session reuse: only `claude-code` reports a session id back, and every other provider is a fresh start per call.

## The capability catalog and your overlay

Vibestrate ships a built-in **capability catalog**: per provider, the real models and effort levels and *how* each is applied (a CLI flag, a `-c key=value`, or an HTTP request-body field). The profile editors only offer knobs that are in this catalog, so you never set an effort the runtime ignores.

The **Capability catalog** panel at the bottom of the Providers tab shows the merged result and where each entry came from. **Refresh from providers** on that panel probes your configured CLI providers for their real models and efforts and writes the findings into an overlay for review. It is local only - each provider's own `--help` or equivalent, no network and no API keys - and it gap-fills rather than overwriting a built-in spec or a hand-authored entry. Probing cloud `/models` endpoints is deliberately left out; that would mean egress with your key.

For a provider Vibestrate ships no spec for, declare its real knobs yourself in `.vibestrate/providers-catalog.yml`. The overlay merges over the built-in catalog, your entry winning per field, and feeds the spawn and every editor from the same source:

```yaml
# .vibestrate/providers-catalog.yml
cli:
  mycli:
    models: [turbo, eco]
    # -> --model turbo
    model: { kind: flag, flag: --model }
    effort:
      levels: [eco, turbo]
      # -> --set reasoning=turbo
      apply:
        kind: config
        flag: --set
        key: reasoning
  gemini:
    # explicitly clear a built-in knob
    effort: null
http:
  openai:
    # add a model suggestion to this api family
    models: [my-finetune]
```

Omit a field to keep the built-in value; set it to `null` to clear it.

## From the terminal

`vibe shell` has no providers page of its own, but its `[4] Profiles` page flags when an overlay is active and names each provider's source, and `r` there runs the same catalog probe as the button.

The command line is the automation path:

```bash
vibe provider detect            # which coding CLIs are on this machine
vibe provider list              # what this project is configured to drive
vibe provider setup             # apply a preset, wire the flags
vibe provider set claude        # make it the default
vibe provider test claude       # safe smoke test; names the login command if needed
vibe provider remove mycli

vibe provider catalog           # built-in + overlay, with sources
vibe provider catalog --json
vibe provider refresh --dry-run # show what a probe would add, write nothing
vibe provider refresh --force   # also replace built-in / existing overlay entries
```

Provider commands manage the raw tools only. A [[profile]] wraps a provider with a model and an effort level, and a [[role]] in your [[crew]] runs on a profile - roles never name a provider directly. [The annotated crew config](/docs/reference/crew-config) shows all three blocks side by side.

CLI providers authenticate through their own login flow, so a literal API key never belongs in `project.yml`.

## Going further

- [Provider reference](/docs/reference/providers) - generated from the detector's own table.
- [Extending: add a provider](/docs/extending/add-provider) - wire up your own CLI.

Next: [[run]] is all of this working together on one task.
