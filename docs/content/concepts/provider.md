---
title: Provider
description: A local coding-agent CLI Vibestrate can drive. Vibestrate supplies the prompt; the provider supplies the model.
section: concepts
slug: concepts/provider
---

A provider is the AI model you're using, wrapped so Vibestrate can talk to it. Claude Code, Codex, Ollama - Vibestrate doesn't care which, as long as it's installed on your machine.

Think of Vibestrate as the manager and the provider as the worker it hands tasks to. Vibestrate writes the prompt; the provider runs the model and hands back the response (and, for providers that edit files, the file changes too).

<div class="docs-callout">

**A provider just takes a prompt and returns a change.** That's the whole contract. Vibestrate compiles the prompt and routes the result; the provider runs the model and (for file-editing providers) hands back the edits. Everything model-specific stays on the provider's side of that line.

</div>

The built-in providers Vibestrate already knows how to drive:

<div class="docs-chips"><span>claude</span><span>codex</span><span>ollama</span><span>opencode</span><span>aider</span></div>

Providers are declared under `providers:` in `project.yml`. You declare each one either as a `cli` invocation (a command, its args, and how the prompt is fed in) or as a `claude-code` integration, which Vibestrate understands more deeply. Each provider advertises what it can do - reuse a session, report token usage, or hand back a session id - and Vibestrate drives them all through one uniform interface.

> **Use `claude-code`, not `cli`, for Claude.** The deeper integration is what makes Vibestrate *permission-aware*: when a write-capable seat (`permissions: code_write`) runs on a `claude-code` provider, Vibestrate injects `--permission-mode acceptEdits` so the headless `claude -p` can actually apply its edits in the worktree. A seat's `code_write` only governs Vibestrate's own broker; the underlying CLI has its *own* permission gate, and a generic `cli` provider can't be granted through it (the flag is claude-specific). Read-only seats - and any read-only / strict-apply-only run - get no grant. Set your own `settings.permissionMode` to override the default.

> **Provider vs [[profile]] vs [[role]]:** a *Provider* is the installed **CLI**; a *Profile* names a Provider plus how strong/expensive to run it; a *Role* runs on a Profile. Roles never point at a Provider directly - they go through a Profile. One Provider backs many Profiles; one Profile backs many Roles.

## Why it matters

A provider is the line between Vibestrate and "the model." Vibestrate stays provider-agnostic: it builds the prompt, captures the output, and routes the result. Anything model-specific - login, billing, context limits - is the provider's job.

This is what keeps the tool *local-first*, where local-first means **sovereignty, not zero-egress**: there's no Vibestrate-operated backend or relay, so you run an independent tool you fully control. Most providers are local CLIs that own their own auth and egress. You *may* also point a provider at a model API with your own key (see **Non-CLI providers** below). That's your sovereign choice and doesn't change the local-first guarantee, because nothing ever flows through a service *we* run.

## Built-in providers

Every built-in provider lands in one of three states on your machine. The first two are detected installs; the third is just absent:

<div class="docs-outcomes"><div class="docs-outcome ok"><b>ready</b><span>preset-ready: installed and Vibestrate already knows the flags, so it works out of the box (this is claude)</span></div><div class="docs-outcome warn"><b>detected, needs setup</b><span>installed but Vibestrate won't guess the flags; run vibe provider setup once to pick them</span></div><div class="docs-outcome stop"><b>missing</b><span>the CLI isn't installed, so there's nothing to drive until you install it</span></div></div>

The common case is `claude`, which works out of the box:

| Id | Status | Notes |
|---|---|---|
| `claude` | Preset-ready | Default args: `-p` with prompt on stdin. Vibestrate configures Claude Code automatically, and a `claude-code` provider streams by default (`--output-format stream-json --verbose --include-partial-messages`) so the live transcript shows the model working token by token. Set `settings.outputFormat` (or a raw `--output-format` in `args`) to take manual control. |

One thing to know about what the model sees during a run: by default, your own Claude Code environment applies. Your global `CLAUDE.md`, hooks, and memory load exactly as they would in your terminal. That's deliberate - the model you tuned is the model that works your runs. If you want hermetic turns instead (only the prompt Vibestrate compiled, plus the skills and MCP servers it attaches explicitly), set `settings.safeMode: true` on the provider. It adds `--safe-mode`, which disables personal customizations while auth and permissions keep working.

Hooks are the customization most likely to surprise you. A personal `UserPromptSubmit` "supervisor" hook fires inside *every* run turn, injecting into prompts and skewing reviewer verdicts. So `vibe doctor` flags when your `~/.claude` or project `.claude` hooks will load inside runs and a claude provider isn't using `safeMode`. It reports only the hook event names and the settings file, never the hook commands. What you do about it is your call: keep the hooks (your environment is legitimate context) or set `safeMode` to isolate them.

The other providers are detected but need a one-time setup:

| Id | Status | Notes |
|---|---|---|
| `codex` | Detected, needs setup | Starter preset uses `codex exec` (prompt on stdin). Run `vibe provider setup`. |
| `ollama` | Detected, needs setup | Starter preset runs `ollama run qwen3.5`. You probably want to edit the model. |
| `opencode` | Detected, needs setup | No verified preset shipped. |
| `aider` | Detected, needs setup | No verified preset shipped. |

The canonical, generated list lives in the [providers reference](/docs/reference/providers).

## "Preset-ready" vs "needs setup"

Coding-agent CLIs disagree on flags - `--prompt` here, `-p` there, `exec` for some, stdin for others. When a vendor's flag set is stable enough that Vibestrate can drive it without surprises, that provider is marked **preset-ready**. Otherwise Vibestrate detects it but won't guess the flags; `vibe provider setup` walks you through the choices.

If a preset is wrong for your installed version (say, a flag the CLI removed), you can correct `command`/`args`/`input` directly - with `vibe provider setup`, by hand-editing `.vibestrate/project.yml`, or in the dashboard's **Providers** page, which has an inline editor with a Save & test loop and a Remove action. The CLI and the dashboard can do exactly the same things.

On the Providers page you can also drag the CLI rows by their handle to reorder them, and lock a row to pin it out of the shuffle. This is a personal view preference kept in your browser - purely how the list is arranged for you. It never changes project config or how a run picks a provider (a run binds providers through its [Profiles](./profile.md), not list position).

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
  claude: { type: cli, command: claude, args: ["-p"], input: stdin }
  codex:  { type: cli, command: codex, args: ["exec"], input: stdin }

profiles:
  claude-sonnet-deep: { provider: claude, model: sonnet, power: deep }
  codex-balanced:      { provider: codex, power: balanced }

crews:
  default:
    roles:
      reviewer: { seats: [reviewer], profile: codex-balanced, prompt: .vibestrate/roles/reviewer.md, permissions: read_only }
```

Read it bottom-up: the `reviewer` Role runs on the `codex-balanced` Profile, which names the `codex` Provider at `balanced` power; the `codex` Provider is the raw `codex exec` CLI. Roles never name a Provider directly - the Profile is the link.

To run a whole run on a different Profile, or one Step on a stronger one:

```bash
vibe run "..." --profile claude-sonnet-deep            # run-wide
vibe run "..." --flow default --step-profile implement=opus-deep   # one step
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

In plain words: `mycli` gets two models (`turbo`, `eco`), its model is set with a `--model` flag, and its effort levels (`eco`, `turbo`) are applied as `--set reasoning=<level>`. The `gemini` entry sets `effort: null` to wipe a built-in knob, and the `http.openai` entry just adds a model suggestion to the existing `openai` API family.

Rules: a knob still only exists where it maps to a real flag/field (no advisory dials); omit a field to keep the built-in value, set it to `null` to clear it. See the merged result and where each entry came from with:

```bash
vibe provider catalog          # human view (built-in + overlay, with sources)
vibe provider catalog --json   # machine-readable
```

Same view in the UI (parity): the dashboard **Providers** page has a "Capability catalog" panel, and the shell **Profiles** page flags when an overlay is active plus each provider's source.

### Auto-filling from `--help`

You don't have to hand-author every entry. `vibe provider refresh` probes your configured CLI providers' `--help`, heuristically parses their model/effort knobs, and writes them into the overlay **for review**:

```bash
vibe provider refresh             # probe all configured CLI providers
vibe provider refresh mycli       # just one
vibe provider refresh --dry-run   # show what it would add, write nothing
vibe provider refresh --force     # also replace built-in / existing overlay entries
```

It's **local only** - it runs each provider's own `--help` (no network, no API keys) - and **gap-fills**: it never overrides a built-in spec or a hand-authored overlay entry unless `--force`. Parsing help text is heuristic, so it writes findings for you to confirm (the catalog view marks them `overlay`). Same action in the UI: the "Refresh from providers" button on the Providers page, or `r` on the shell Profiles page. (Probing cloud `/models` endpoints is intentionally not included - that would mean egress with your key.)

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
