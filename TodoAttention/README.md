# TodoAttention

A compatibility-gated renderer patch for
[`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo).
It reuses that extension's tool, reducer, per-session store, persistence,
numbering, dependencies, overlay, and command. It does **not** register another
`todo` tool or maintain another task store.

The patch targets the exact published `@juicesharp/rpiv-todo@2.9.0` source. The
upstream code is MIT licensed; see [LICENSE.upstream](LICENSE.upstream).

## Indicators and truthful subtitles

The existing layout, title, status prefixes, spacing, subject styling, and
always-visible ids remain unchanged, apart from these indicator/subtitle changes:

| Structured state | Indicator |
| --- | --- |
| `metadata.attention="captain-input"` plus required `metadata.attentionReason` | Static orange `#FF9800` `●`; specific decision on an indented `└─ needs you: …` line |
| `status="in_progress"`, `metadata.attention="agent-working"`, no `blockedBy` | Green `#00E676` spinner, `⠋ ⠙ ⠹ ⠸ ⠼ ⠴` (`working`) |
| Waiting, pending, blocked, stale, missing, or unknown attention | Static neutral gray `#B0B0B0` `●` (`waiting`) |
| Completed | Static `✓`, theme `success`, no outstanding attention dot |
| Deleted | Existing deletion presentation; hidden from overlay, never completion |

Captain input takes precedence over animation, including blocked tasks. A
compact, visible `working · waiting · needs you` legend uses the same colored
dots in the overlay, `/todos`, and list tool results, so meaning is not
color-only. It is only a key: every orange task has an immediately following
indented `└─ needs you: <specific decision>` line in the overlay, `/todos`, and
list/get renderers. Mutation-only responses remain compact. Animation runs only in the
**live widget**, not historical tool results or `/todos` notifications (these
retain static green dots). One widget-local timer
advances all displayed active indicators every **150 ms (6⅔ frames/sec)**.
It requests normal, coalesced/differential TUI renders, never forced full
redraws, model calls, token usage, session writes, or task mutations.
It stops on completion/removal/no displayed active work, collapse, widget
removal, too-narrow rendering, and session shutdown/replacement/reload. Hidden
budget-overflow rows do not keep a timer running. Non-TUI modes start no TUI
resources; deferred overlay prewarming is also session-scoped and cleaned up.

### Caller responsibility (not worker auto-binding)

Green requires an explicit `agent-working` assertion as well as `in_progress`.
There is **no automatic worker-liveness binding**, fleet controller, endpoint
probe, or elapsed-time activity inference. A persisted explicit assertion is
trusted on replay, so it can be wrong if a caller fails to clear it after an
interruption. A stale `in_progress` status *without* that assertion stays gray;
explicit `attention="stale"` also stays gray.

- Before pausing, blocking, or handing back, set `attention` to `waiting` and
  supply `metadata.attentionReason`, for example `waiting for worker test
  results`, `awaiting CI`, or `tests failed; fix assertion`. Move status to
  `pending` when appropriate. Waiting itself never implies failure.
- Set `captain-input` only for a real decision or required fact, and provide
  `metadata.attentionReason` in the same mutation with the exact concise request
  (for example, `choose merge or hold PR 24`). It must be a non-empty string of
  at most 160 Unicode characters and is terminal-sanitized before persistence.
- On a captain answer, clear both `captain-input` and `attentionReason`; assert
  `agent-working` only in the update that starts actual work.
- Active work retains its `activeForm` subtitle. Waiting prefers sanitized
  `attentionReason`; absent that, it exposes actual dependency ids or preserves
  an actionable legacy waiting/failure `activeForm`. Bare `supervising` is not
  a reason. Historical captain-input data with missing/invalid context remains
  orange and uses bounded safe task text plus an explicit context warning.

The existing legacy title workaround (`● ` prefixes) is still normalized on
create, subject update, and replay; semantic text and marker-only subjects are
preserved. Dependencies, arbitrary metadata, owner, state transitions, and
persistence envelopes are unchanged.

### Exact colour sources

The outstanding-task palette uses fixed truecolour values selected for high
contrast on the supported neon-afterglow dark background (`#06040F`):

- verified agent work: green **`#00E676`** (RGB `0;230;118`)
- waiting/blocked/stale/unknown: neutral gray **`#B0B0B0`** (RGB `176;176;176`)
- captain input: orange **`#FF9800`** (RGB `255;152;0`)

There is no fallback to the former blue/yellow/theme-accent mapping. The heading
still uses its existing theme accent. Completed checks still use the theme
`success` token (`#CCFF00` in neon-afterglow), not an attention color. Neither
the theme nor Telegram bridge is modified or a runtime dependency. Exact ANSI
assertions require neon-afterglow/truecolour.

### Static / reduced-motion fallback

No reduced-motion mechanism is exposed by the inspected Pi host or upstream
rpiv-todo configuration. Use the existing optional rpiv-todo config file:

```json
{ "reducedMotion": true }
```

Location: `$XDG_CONFIG_HOME/rpiv-todo/config.json` (absolute XDG path), otherwise
`~/.config/rpiv-todo/config.json`, with upstream's legacy fallback rules. Merge
this field into existing configuration rather than replacing other settings.
Only boolean `true` enables the fallback: the active indicator becomes a static
green `●` and allocates no animation timer. Changes are read on repaint/tick;
re-enabling animation takes effect on the next ordinary repaint, without a file
watcher. All indicators/frames are one terminal cell according to Pi's Unicode
width utility. Terminals still need fonts that support those Unicode glyphs.

## Maintained source map

The baseline is the installed package at
`/home/podles/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo`, version `2.9.0`:

- `index.ts`: lifecycle replay, foreground ownership, shutdown.
- `todo-overlay.ts`: existing live widget, animation clock, width/budget handling.
- `view/format.ts`: shared state classification, indicators, subtitles, renderers.
- `config.ts`: package-local static fallback.
- `todo.ts`: existing tool/command and caller guidance.
- `state/{replay,selectors,state-reducer}.ts`, `tool/{sanitize,types}.ts`:
  attention validation, bounded sanitization, id visibility, and legacy-title
  normalization.

`prepare.py` checks package identity and SHA-256 of **every changed upstream
file**, including maintained upstream documentation, before `git apply`. Drift
fails closed. The main patch builds attention-v4; immutable v1, v2, and v3
patches verify older managed installations for safe chained upgrade and rollback. No
second store or cross-PodleTools dependency.

## Verify

From the repository:

```sh
TodoAttention/tests/test.sh
TodoAttention/tests/smoke-test.sh
```

`test.sh` checks compatibility refusal and byte-exact patch regeneration,
then loads a complete scratch package through Pi's public
`DefaultResourceLoader`. It does not construct a custom Jiti resolver or alter
package exports/global module paths. Renderer and fake-clock tests cover exact
ANSI tokens, required/sanitized/bounded decision context, exact indented
multiline layout and narrow-width wrapping, precedence, frames, bounded cadence,
no duplicate timers, visible-width bounds, static fallback, disposal and every
shutdown reason, child-session isolation, normalization and state preservation.
No model/session is created by SDK contracts. Fake-clock measurement is exactly
**40 non-forced redraw requests / 6000 ms**, with zero task-store writes.

Installer tests exercise fresh installation, Pi package discovery, chained
v1→v2→v3→v4 upgrade, idempotence, compatibility drift, injected manifest-write
failure, rollback through v3, v2, and v1 to npm, preservation of unrelated
settings/package filters,
and untouched session bytes. The real isolated TUI replays **synthetic** task
history through the actual owner (no helper-owned widget) and captures ANSI and
real timer cadence. `smoke-test.sh` separately checks animated and static modes.
Each run prints measured tick intervals; static mode requires zero animation
timers. Neither test changes global settings/installations or reloads a live
session. Overrides: `RPIV_TODO_SOURCE`, `PI_CORE_PACKAGE`, `NEON_AFTERGLOW_THEME`.

## Preparation and later-approved activation

`prepare.py` remains the source-maintainer path and refuses to mutate
`node_modules`; give it a clean compatible upstream source tree:

```sh
TodoAttention/prepare.py /path/to/rpiv-mono/packages/rpiv-todo
TodoAttention/prepare.py /path/to/rpiv-mono/packages/rpiv-todo --apply
```

For an installed npm package, the supported installer checks identity, changed
file hashes, required runtime dependencies, patch applicability, and exactly
one configured rpiv-todo source. It stages a self-contained patched package,
backs up settings, then replaces that source in place while preserving package
filters and unrelated settings. No runtime dependency on a disposable checkout.

**After merge and separate activation approval**, use a stable checkout:

```sh
/path/to/PodleTools/TodoAttention/install.py check \
  --source /home/podles/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo
/path/to/PodleTools/TodoAttention/install.py install \
  --source /home/podles/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo --dry-run
/path/to/PodleTools/TodoAttention/install.py install \
  --source /home/podles/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo
```

The managed release is
`$PI_CODING_AGENT_DIR/todoattention/releases/rpiv-todo-2.9.0-attention-v4`.
Upgrading an established v1, v2, or v3 deployment verifies its manifest and
immutable release patch, retains its package bytes, stages v4, and replaces only the
configured source.
A failed settings/manifest publication restores the old configuration. Do not
remove/reinstall packages manually or register both versions simultaneously.

**Nothing automatically reloads or restarts Pi.** Only after approval, the
captain can issue `/reload` in the intended session during a coordinated window.
Then confirm live spinner/input/reason/completion appearance. Code ready,
configured package source, and visible live activation are separate states.
This repository change performs **no live activation**.

### Rollback

```sh
TodoAttention/install.py rollback --dry-run
TodoAttention/install.py rollback
```

For an older-release upgrade, each rollback restores the immediately preceding
retained source and manifest, removes the newer release, and preserves unrelated
settings changed since upgrade. Thus v1→v2→v3→v4 rolls back
v4→v3→v2→v1→npm in four deliberate calls. A fresh v4 install needs one
rollback. Direct rollback of verified v1, v2, and v3 remains supported. All versions' compatibility checks remain
enabled; malformed manifests,
competing configured sources, or changed patches fail closed. Session/task
files are never migrated or rewritten. Settings backups live under
`$PI_CODING_AGENT_DIR/todoattention/backups/`. Rollback does not reload Pi;
coordinate subsequent activation separately.

### Versions and updates

Pinned to `@juicesharp/rpiv-todo@2.9.0`; `pi update --extensions` does not update
absolute local package sources. A newer upstream release needs a rebased patch,
updated compatibility hashes/release checks, and full tests first. Runtime
`rpiv-config@2.9.0` and `typebox@1.x` dependencies are copied into each managed
release. Upstream package identity, author, repository, and MIT licence remain
intact.
