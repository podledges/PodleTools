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
| `metadata.attention="captain-input"` | Static `●`, same `accent` token as the Todos title |
| `status="in_progress"`, `metadata.attention="agent-working"`, no `blockedBy` | Blue `#0066FF` spinner, `⠋ ⠙ ⠹ ⠸ ⠼ ⠴` |
| Waiting, pending, blocked, stale, missing, or unknown attention | Static yellow `#FFFF00` `●` |
| Completed | Static `✓`, theme `success`, no outstanding attention dot |
| Deleted | Existing deletion presentation; hidden from overlay, never completion |

Captain input takes precedence over animation, including blocked tasks.
Animation runs only in the **live widget**, not historical tool results or
`/todos` notifications (these retain static blue dots). One widget-local timer
advances all displayed active indicators every **150 ms (6⅔ frames/sec)**.
It requests normal, coalesced/differential TUI renders, never forced full
redraws, model calls, token usage, session writes, or task mutations.
It stops on completion/removal/no displayed active work, collapse, widget
removal, too-narrow rendering, and session shutdown/replacement/reload. Hidden
budget-overflow rows do not keep a timer running. Non-TUI modes start no TUI
resources; deferred overlay prewarming is also session-scoped and cleaned up.

### Caller responsibility (not worker auto-binding)

Blue requires an explicit `agent-working` assertion as well as `in_progress`.
There is **no automatic worker-liveness binding**, fleet controller, endpoint
probe, or elapsed-time activity inference. A persisted explicit assertion is
trusted on replay, so it can be wrong if a caller fails to clear it after an
interruption. A stale `in_progress` status *without* that assertion stays yellow;
explicit `attention="stale"` also stays yellow.

- Before pausing, blocking, or handing back, set `attention` to `waiting` and
  supply `metadata.attentionReason`, for example `waiting for worker test
  results`, `awaiting CI`, or `tests failed; fix assertion`. Move status to
  `pending` when appropriate. Waiting itself never implies failure.
- On a captain answer, clear `captain-input` to `waiting`; assert
  `agent-working` only in the update that starts actual work. Clear obsolete
  reasons with `attentionReason: null`.
- Active work retains its `activeForm` subtitle. Waiting/input prefers sanitized
  `attentionReason`; absent that, it exposes actual dependency ids or preserves
  an actionable legacy waiting/failure `activeForm`. Bare `supervising` is not
  a reason. Missing information honestly renders `pending; reason unknown`,
  `waiting; activity unconfirmed`, or `awaiting captain input`.

The existing legacy title workaround (`● ` prefixes) is still normalized on
create, subject update, and replay; semantic text and marker-only subjects are
preserved. Dependencies, arbitrary metadata, owner, state transitions, and
persistence envelopes are unchanged.

### Exact colour sources

Read-only inspection of the installed theme
`/home/podles/.pi/agent/themes/neon-afterglow.json` established:

- `colors.accent` → `vars.hotPink` → **`#FF00CC`** (RGB `255;0;204`). The existing
  `todo-overlay.ts` heading uses `accent`; input dots use that very same token.
- `colors.success` → `vars.acidLime` → **`#CCFF00`** (RGB `204;255;0`). The installed
  `@llblab/pi-telegram/lib/status.ts`, `buildTelegramStatusBarText`, renders
  `connected` through `theme.fg("success", "connected")`. Completed checks use
  the same token, not a green emoji or a guessed hex.

Neither the theme nor Telegram bridge is modified or a runtime dependency.
Token-bound colours follow later theme changes. Blue and yellow intentionally
use exact RGB; exact theme ANSI assertions require neon-afterglow/truecolour.

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
blue `●` and allocates no animation timer. Changes are read on repaint/tick;
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
- `state/{replay,selectors,state-reducer}.ts`, `tool/sanitize.ts`: existing
  attention patch's id visibility and legacy-title normalization.

`prepare.py` checks package identity and SHA-256 of **every changed upstream
file**, including maintained upstream documentation, before `git apply`. Drift
fails closed. The main patch builds attention-v2; the immutable
`patches/rpiv-todo-2.9.0-attention-v1.patch` verifies existing v1 installations
for safe upgrade and rollback. No second store or cross-PodleTools dependency.

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
ANSI tokens, reasons/failure distinction, precedence, frames, bounded cadence,
no duplicate timers, visible-width bounds, static fallback, disposal and every
shutdown reason, child-session isolation, normalization and state preservation.
No model/session is created by SDK contracts. Fake-clock measurement is exactly
**40 non-forced redraw requests / 6000 ms**, with zero task-store writes.

Installer tests exercise fresh installation, Pi package discovery, existing-v1
upgrade, idempotence, compatibility drift, injected manifest-write failure,
rollback to v1 and then npm, preservation of unrelated settings/package filters,
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
`$PI_CODING_AGENT_DIR/todoattention/releases/rpiv-todo-2.9.0-attention-v2`.
Upgrading the established v1 deployment verifies its manifest and legacy patch,
retains its package bytes, stages v2, and replaces only the configured source.
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

For a v1→v2 upgrade, rollback restores the retained v1 source and its original
manifest, removes v2, and preserves unrelated settings changed since upgrade.
A second deliberate rollback restores npm. For a fresh v2 install, one rollback
restores npm. The new installer also supports direct rollback of verified v1.
Both versions' compatibility checks remain enabled; malformed manifests,
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
