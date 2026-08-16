---
title: Provider
description: What actually runs a model - a coding-agent CLI on your machine, or an HTTP endpoint. Vibestrate supplies the prompt.
slug: concepts/provider
---

A provider is what actually runs a model. Vibestrate writes the prompt; the provider runs the model and hands back the response, and the file changes too when it can edit files. Everything model-specific - login, billing, context limits - stays on the provider's side of that line.

Most providers are coding-agent CLIs already installed on your machine, but not all of them are. There are four kinds, declared under `providers:` in `project.yml`: `claude-code` (Claude Code, the integration Vibestrate understands most deeply), `cli` (any other coding-agent CLI - a command, its args, and how the prompt is fed in), `http-api` (a cloud model API on your own key, https only), and `localhost-proxy` (a model server on this machine, loopback only, so no egress).

Eleven CLIs ship with Vibestrate. Five are configured for you the moment they are detected - `claude`, `codex`, `gemini`, `aider` and `ollama`. The other six - `opencode`, `qwen`, `crush`, `goose`, `cursor` and `amp` - are detected but need `vibe provider setup` once, because their flags are not stable enough across versions for Vibestrate to guess.

> **Use `claude-code`, not `cli`, for Claude.** A write-capable seat (`permissions: code_write`) on a `claude-code` provider gets `--permission-mode acceptEdits`, so the headless `claude -p` can actually apply its edits in the worktree. A seat's `code_write` only governs Vibestrate's own broker; the underlying CLI has its *own* permission gate, and a generic `cli` provider can't be granted through it. Read-only seats get no write grant. Set `settings.permissionMode` to override the default.

> **Provider vs [[profile]] vs [[role]]:** a Provider is the tool; a Profile names a Provider plus how strong to run it; a Role runs on a Profile. Roles never name a Provider directly.

## Why it matters

A provider is the line between Vibestrate and "the model." Vibestrate stays provider-agnostic: it builds the prompt, captures the output, and routes the result. Swapping one provider for another changes nothing about how a Flow, a Crew or a run behaves.

This is what keeps the tool *local-first*, where local-first means **sovereignty, not zero-egress**: there's no Vibestrate-operated backend or relay, so you run an independent tool you fully control. Most providers are local CLIs that own their own auth and egress. You *may* also point a provider at a model API with your own key (see **Non-CLI providers** below). That's your sovereign choice and doesn't change the local-first guarantee, because nothing ever flows through a service *we* run.

## Built-in providers

Every built-in provider lands in one of three states on your machine. The first two are detected installs; the third is just absent:

<div class="docs-outcomes"><div class="docs-outcome ok"><b>ready</b><span>preset-ready: installed, and Vibestrate already knows the flags, so it works out of the box</span></div><div class="docs-outcome warn"><b>detected, needs setup</b><span>installed but Vibestrate won't guess the flags; run vibe provider setup once to pick them</span></div><div class="docs-outcome stop"><b>missing</b><span>the CLI isn't installed, so there's nothing to drive until you install it</span></div></div>

These five are preset-ready - Vibestrate already knows their flags:

| Id | Status | Notes |
|---|---|---|
| `claude` | Preset-ready | Default args: `-p` with prompt on stdin. Vibestrate configures Claude Code automatically, and a `claude-code` provider streams by default (`--output-format stream-json --verbose --include-partial-messages`) so the live transcript shows the model working token by token. Set `settings.outputFormat` (or a raw `--output-format` in `args`) to take manual control. |
| `codex` | Preset-ready | Preset: `codex exec` with the prompt on stdin. Log in with `codex login` if prompted. |
| `gemini` | Preset-ready | Preset: prompt piped to `gemini` on stdin. Sign in by running `gemini` once, or set `GEMINI_API_KEY`. |
| `aider` | Preset-ready | Preset: `aider --no-auto-commits --yes --message` (one-shot, no auto-commits). Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. |
| `ollama` | Preset-ready | Preset: `ollama run qwen3.5` with the prompt on stdin. Pull the model first (`ollama pull qwen3.5`), or edit the args for another local model. |

One thing to know about what the model sees during a run: by default, your own Claude Code environment applies. Your global `CLAUDE.md`, hooks, and memory load exactly as they would in your terminal. That's deliberate - the model you tuned is the model that works your runs. If you want hermetic turns instead (only the prompt Vibestrate compiled, plus the skills and MCP servers it attaches explicitly), set `settings.safeMode: true` on the provider. It adds `--safe-mode`, which disables personal customizations while auth and permissions keep working.

Hooks are the customization most likely to surprise you. A personal `UserPromptSubmit` "supervisor" hook fires inside *every* run turn, injecting into prompts and skewing reviewer verdicts. So `vibe doctor` flags when your `~/.claude` or project `.claude` hooks will load inside runs and a claude provider isn't using `safeMode`. It reports only the hook event names and the settings file, never the hook commands. What you do about it is your call: keep the hooks (your environment is legitimate context) or set `safeMode` to isolate them.

The rest are detected but need a one-time setup - Vibestrate won't guess flags that aren't stable across versions:

| Id | Status | Notes |
|---|---|---|
| `opencode` | Detected, needs setup | Preset: `opencode run` with the prompt as an argument. Log in with `opencode auth login`. |
| `qwen` | Detected, needs setup | Preset: prompt piped to `qwen` on stdin. Authenticate by running `qwen` once. |
| `crush` | Detected, needs setup | Preset: `crush run` with the prompt as an argument. Set your model provider's API key. |
| `goose` | Detected, needs setup | Preset: `goose run -t` with the prompt as an argument. Log in with `goose configure`. |
| `cursor` | Detected, needs setup | Command is `cursor-agent`. Preset: `-p` with the prompt as an argument. Log in with `cursor-agent login`. |
| `amp` | Detected, needs setup | Preset: `-x` with the prompt as an argument. Log in with `amp login`. |

The canonical, generated list lives in the [providers reference](/docs/reference/providers).

## "Preset-ready" vs "needs setup"

Coding-agent CLIs disagree on flags - `--prompt` here, `-p` there, `exec` for some, stdin for others. When a vendor's flag set is stable enough that Vibestrate can drive it without surprises, that provider is marked **preset-ready**. Otherwise Vibestrate detects it but won't guess the flags; `vibe provider setup` walks you through the choices.

If a preset is wrong for your installed version (say, a flag the CLI removed), you can correct `command`/`args`/`input` directly - with `vibe provider setup`, by hand-editing `.vibestrate/project.yml`, or on the Crew page's **Providers** tab, which has an inline editor with a Save & test loop and a Remove action. The CLI and the dashboard can do exactly the same things.

On the Providers tab you can also drag the CLI rows by their handle to reorder them, and lock a row to pin it out of the shuffle. This is a personal view preference kept in your browser - purely how the list is arranged for you. It never changes project config or how a run picks a provider (a run binds providers through its [[profile]]s, not list position).

For anything the form doesn't surface, the editor has an **Advanced - raw YAML** mode (the toggle on the YAML block). It opens the provider's full `project.yml` block for direct editing - environment variables (`env`), claude-code `settings`, `extraArgs`, custom headers - seeded from the real saved config and validated on save. So fixing or setting up a provider is always fully doable in the dashboard; you never have to drop to `vibe provider setup`. (Authentication is the one exception by design: when a provider isn't logged in, the UI shows the login command for you to run in your own terminal - Vibestrate never logs you in.)

## Non-CLI providers (HTTP)

Beyond local CLIs, two HTTP-backed provider types let you run a model over the network:

```yaml
providers:
  # Cloud API - your own key, external destination.
  anthropic-api:
    type: http-api
    api: anthropic                 # or: openai
    baseUrl: https://api.anthropic.com
    model: claude-sonnet-4-5
    apiKey: env:ANTHROPIC_API_KEY   # env-ref ONLY - never a literal key

  # Local model server - no key, no egress.
  ollama-local:
    type: localhost-proxy
    api: ollama                     # or: openai (OpenAI-compatible servers)
    baseUrl: http://localhost:11434
    model: qwen3.5
```

The first block is a cloud API: `type: http-api`, an `api` family (`anthropic` or `openai`), a `baseUrl`, a `model`, and an `apiKey` given as an `env:` reference. The second is a local server: `type: localhost-proxy`, an `api` family (`ollama` or `openai`), a loopback `baseUrl`, and a `model` - no key needed.

Rules the schema enforces:

- **`http-api`** must be **https** and **not** a localhost host; its `apiKey` must be an `env:NAME` reference (a literal key in config is rejected). The key is resolved at call time, never written to YAML, never logged, and redacted from any error. The dashboard marks these providers **external**.
- **`localhost-proxy`** must point at a loopback host (`localhost` / `127.0.0.1` / `[::1]`) - so there is **no egress**. A key is optional.

Both report **real token usage** from the API response (not estimates). They run one request per turn - no session reuse.

## Providers back Profiles, Profiles back Roles

A Provider is a raw tool. A [[profile]] wraps it with model/power, and a [[role]] in your [[crew]] runs on a Profile:

```yaml
providers:
  claude: { type: claude-code, command: claude, args: ["-p"], input: stdin }
  codex:  { type: cli, command: codex, args: ["exec"], input: stdin }

profiles:
  claude-high: { provider: claude, model: sonnet, power: high }
  codex-low:   { provider: codex, power: low }

crews:
  default:
    roles:
      reviewer: { seats: [reviewer], profile: codex-low, prompt: .vibestrate/roles/reviewer.json, permissions: read_only }
```

Read it bottom-up: the `reviewer` Role runs on the `codex-low` Profile, which names the `codex` Provider at `low` effort; the `codex` Provider is the raw `codex exec` CLI. Roles never name a Provider directly - the Profile is the link.

Effort levels come from the provider, so `high` is a real `claude` level and `low` a real `codex` one. See [[profile]] for the full sets.

To run a whole run on a different Profile, or one Step on a stronger one:

```bash
vibe run "..." --profile claude-high                   # run-wide
vibe run "..." --step-profile implement=claude-high    # one step
```

(Provider commands - `vibe provider list/setup/test` - manage the raw tools only. Profiles and Crews are edited in `project.yml`, the dashboard, or the API.)

## Capability catalog + your overlay

Vibestrate ships a built-in **capability catalog**: per provider, the real models and effort levels and *how* each is applied (a CLI flag, a `-c key=value`, or an HTTP request-body field). The Profile editors only offer knobs that are in this catalog, so you never set an effort the runtime ignores.

For a provider Vibestrate doesn't ship a spec for - your own CLI, a custom model - declare its real knobs in `.vibestrate/providers-catalog.yml`. The overlay is merged over the built-in catalog (your entry wins, per field), and it feeds the spawn AND every editor (web / shell / CLI) from the same source:

```yaml
# .vibestrate/providers-catalog.yml
cli:
  mycli:                         # a CLI provider with its own flags
    models: [turbo, eco]
    model: { kind: flag, flag: --model }          # -> --model turbo
    effort:
      levels: [eco, turbo]
      apply: { kind: config, flag: --set, key: reasoning }  # -> --set reasoning=turbo
  gemini:
    effort: null                 # explicitly clear a built-in knob
http:
  openai:
    models: [my-finetune]        # add a model suggestion to the openai api family
```

In plain words: `mycli` gets two models (`turbo`, `eco`), its model is set with a `--model` flag, and its effort levels (`eco`, `turbo`) are applied as `--set reasoning=turbo`. The `gemini` entry sets `effort: null` to wipe a built-in knob, and the `http.openai` entry just adds a model suggestion to the existing `openai` API family.

Rules: a knob still only exists where it maps to a real flag/field (no advisory dials); omit a field to keep the built-in value, set it to `null` to clear it. See the merged result and where each entry came from with:

```bash
vibe provider catalog          # human view (built-in + overlay, with sources)
vibe provider catalog --json   # machine-readable
```

Same view in the UI (parity): the dashboard Crew page's **Providers** tab has a "Capability catalog" panel, and the shell **Profiles** page flags when an overlay is active plus each provider's source.

### Auto-filling from `--help`

You don't have to hand-author every entry. `vibe provider refresh` probes your configured CLI providers' `--help`, heuristically parses their model/effort knobs, and writes them into the overlay **for review**:

```bash
vibe provider refresh             # probe all configured CLI providers
vibe provider refresh mycli       # just one
vibe provider refresh --dry-run   # show what it would add, write nothing
vibe provider refresh --force     # also replace built-in / existing overlay entries
```

It's **local only** - it runs each provider's own `--help` (no network, no API keys) - and **gap-fills**: it never overrides a built-in spec or a hand-authored overlay entry unless `--force`. Parsing help text is heuristic, so it writes findings for you to confirm (the catalog view marks them `overlay`). Same action in the UI: the "Refresh from providers" button on the Providers tab, or `r` on the shell Profiles page. (Probing cloud `/models` endpoints is intentionally not included - that would mean egress with your key.)

## Common mistakes

<div class="docs-cards">

**Setting up the same provider twice.**
If Claude Code is your `claude` id, don't create a `claude-pro` and `claude-haiku` row unless the flags differ. Use one provider and switch models inside the provider's own settings.

**Assuming session reuse where there isn't any.**
Only `claude-code` reports its session id back; everything else is fresh-start per call.

**Putting a literal API key in `project.yml`.**
Don't - and for `http-api` providers the schema refuses it. CLI providers authenticate through their own login flow; `http-api` providers take an `env:NAME` reference and read the key from the environment at run time.

</div>

## Going deeper

- [Provider reference](/docs/reference/providers) - generated from `KNOWN_PROVIDERS`.
- [Extending: add a provider](/docs/extending/add-provider) - wire up your own CLI.
