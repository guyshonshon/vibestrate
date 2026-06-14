# Manual smoke tests (0.7.74 - 0.7.85)

Quick, follow-along checks for the things shipped this batch that couldn't be
verified in a headless harness (real provider runs, live terminal animation,
dashboard surfaces). Each test is self-contained: **Goal -> Steps -> Expect ->
Reset**. Run them from the project root of a real Vibestrate project.

Tips:
- `vibe status` lists your runs and their **run ids** (you'll paste these into
  `vibe assurance`).
- A few tests flip a setting in `.vibestrate/project.yml`. Each has a **Reset**
  step - run it when done so nothing lingers.
- `vibe config get <key>` shows a setting; `vibe config set <key> <value>` changes it.

---

## 1. Provider-native sandbox (codex) - the big one

**Goal:** confirm that with isolation on, a codex run still works AND is reported
as sandboxed.

**Pre-check (do you have codex?):**
```
vibe provider list
```
You need a **codex** provider in the list. If not, this test is N/A (claude has
no OS sandbox - see test 2 for that side).

**Steps:**
1. Turn isolation on:
   ```
   vibe config set execution.isolation sandboxed
   ```
2. Run a tiny task on codex (use a codex profile if codex isn't your default):
   ```
   vibe run "create a file hello-sandbox.txt with the word OK" --profile <your-codex-profile>
   ```
3. When it finishes, grab the run id:
   ```
   vibe status
   ```
4. Read the assurance for that run:
   ```
   vibe assurance <runId>
   ```

**Expect:**
- The run completes normally (the sandbox does **not** break it).
- `vibe assurance` prints an **`isolation: sandboxed`** line (with a turn count).
- The file landed in the run's worktree (the change is reviewable as usual).

**Optional - see the OS actually block a write (10 sec, no LLM):**
```
cd /tmp && codex sandbox -- /bin/sh -c 'echo X > /tmp/should-fail.txt; echo rc=$?'
ls -la /tmp/should-fail.txt   # should NOT exist
```
Expect: `Operation not permitted` and the file is **not** created.

**Reset:**
```
vibe config set execution.isolation off
```

---

## 2. Harden read-only seats (claude `--permission-mode plan`)

**Goal:** with hardening on, read-only claude seats (planner/reviewer/etc.) run
under plan mode and the run still behaves.

**Steps:**
1. Turn it on:
   ```
   vibe config set policies.hardenReadOnlySeats true
   ```
2. Run a normal task on a **claude** provider:
   ```
   vibe run "add a one-line code comment explaining the main entry point"
   ```
3. Watch the run (or check `vibe status` then the run detail).

**Expect:**
- The run completes; review/plan steps still produce normal output (not "awaiting
  approval" boilerplate).
- The diff is only what the writer seat produced - read-only seats wrote nothing.

**(If your run uses codex, not claude):** you'll instead see a one-time line like
*"Isolation/hardening: provider codex ..."* - hardening is a claude-only lever, so
this is expected. No failure.

**Reset:**
```
vibe config set policies.hardenReadOnlySeats false
```

---

## 3. Consult spinner (the "looks frozen" fix)

**Goal:** `vibe consult` shows live feedback instead of freezing.

**Steps:**
```
vibe consult "what's the riskiest open item in this project?"
```

**Expect:**
- Immediately you see a spinner line like `Consulting 3s` that ticks up the
  seconds, **then** the answer prints. No silent freeze.
- (Piped, it degrades to a single `Consulting...` line - try
  `vibe consult "..." | cat` to see that.)

**Reset:** none.

---

## 4. Dashboard surfaces (isolation badge, "Flow & why", merge caution)

**Goal:** the new read-only UI bits render.

**Steps:**
1. Start the dashboard:
   ```
   vibe ui
   ```
   Open the URL it prints (default http://localhost:4317).
2. Open a recent **run detail** page.
3. If that run had isolation on (test 1), look at the **assurance badge** row -
   it should include an `isolation: sandboxed/partial` chip.
4. In the **Supervisor** panel near the top, if the run's flow was selected/sized,
   click the small **why** toggle - it expands the full reasoning (all reasons,
   risks, posture).
5. Open the **Merge** page. If you have a merge-ready run whose isolation was
   `partial`, it shows an `isolation_incomplete` **caution** (yellow, not a
   blocker).

**Expect:** each element renders without errors; nothing crashes the page.

**Reset:** stop `vibe ui` (Ctrl+C).

---

## 5. Snapshot retention (opt-in prune) + consult housekeeping tip

**Goal:** retention prunes old snapshots only when you opt in; consult nudges you
about growth.

**Steps:**
1. Confirm the default is OFF (the tool never prunes on its own):
   ```
   vibe config get git.snapshotRetentionRuns      # expect 0
   ```
2. Turn on a small retention window:
   ```
   vibe config set git.snapshotRetentionRuns 2
   ```
3. Do **3+** quick runs (any tiny task), so there are more than 2 runs' snapshots.
4. After the next run starts, check that old snapshot refs got pruned:
   ```
   git for-each-ref refs/vibestrate/snapshots | wc -l    # only the ~2 most recent runs remain
   ```

**Housekeeping tip (only fires with retention OFF + many snapshots):**
- Set it back off (`vibe config set git.snapshotRetentionRuns 0`), and if your
  repo has snapshots from >25 runs, run any `vibe consult "..."` - the output
  should include a **Housekeeping** section suggesting you set
  `git.snapshotRetentionRuns`. (If you have <25 runs of history, it won't show -
  that's correct, not a bug.)

**Reset:**
```
vibe config set git.snapshotRetentionRuns 0
```

---

## 6. `vibe guide` (renamed from `vibe vibestrate`) + apply a proposal

**Goal:** the renamed command works end to end, including applying a consult
proposal to VIBESTRATE.md.

**Steps:**
1. Confirm the command:
   ```
   vibe guide --help          # shows show/init/proposals/apply/reject
   vibe guide show            # prints VIBESTRATE.md (or "create one" hint)
   ```
2. Get consult to propose a manual update, then apply it:
   ```
   vibe consult "suggest one concrete improvement to this project's VIBESTRATE.md"
   ```
   If it proposes one, it prints an id and `vibe guide apply <id>`.
3. List + apply:
   ```
   vibe guide proposals
   vibe guide apply <id>
   git diff VIBESTRATE.md      # the proposed text was appended
   ```

**Expect:** `vibe vibestrate ...` is gone (unknown command); `vibe guide ...`
works; apply appends to VIBESTRATE.md (review the diff before committing).

**Reset:** `git checkout VIBESTRATE.md` if you don't want to keep the applied text.

---

## 7. (Optional) Stale assurance re-derives, doesn't crash

**Goal:** confirm an old/partial `assurance.json` is regenerated, not crashed on.

**Steps:**
- Pick any completed run id from `vibe status`, then:
  ```
  vibe assurance <runId>
  ```

**Expect:** a verdict prints (it re-derives from evidence if the cached artifact
is stale or missing). No crash, no "undefined" errors.

**Reset:** none.

---

### One-shot path that covers 1, 2, 5 together
Turn isolation + hardening on, do 3 small runs, then read one back:
```
vibe config set execution.isolation sandboxed
vibe config set policies.hardenReadOnlySeats true
vibe config set git.snapshotRetentionRuns 2
vibe run "create note-a.txt with the text A"
vibe run "create note-b.txt with the text B"
vibe run "create note-c.txt with the text C"
vibe status                      # grab the latest run id
vibe assurance <runId>           # check the isolation line
git for-each-ref refs/vibestrate/snapshots | wc -l   # ~2 runs' worth

# reset everything:
vibe config set execution.isolation off
vibe config set policies.hardenReadOnlySeats false
vibe config set git.snapshotRetentionRuns 0
```
