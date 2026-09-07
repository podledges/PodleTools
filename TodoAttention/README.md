# TodoAttention

A compatibility-gated renderer patch for
[`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo).
It reuses that extension's tool, reducer, per-session store, persistence,
numbering, dependencies, overlay, and command. It does **not** register another
`todo` tool or maintain another task store.

The patch targets the exact published `@juicesharp/rpiv-todo@2.9.0` source. The
upstream code is MIT licensed; see [LICENSE.upstream](LICENSE.upstream).

## What changes

Every outstanding task displays one renderer-owned text glyph `●` immediately
beside its always-visible number id:

| Structured state | Indicator |
| --- | --- |
| `metadata.attention="captain-input"` | Theme `accent`; `#ff00cc` in neon-afterglow |
| `status="in_progress"`, `metadata.attention="agent-working"`, no `blockedBy` | Neon blue `#0066FF` |
| Waiting, pending, blocked, stale, missing, or unknown attention | Yellow `#FFFF00` |

Completed and deleted tasks have no attention indicator and retain upstream's
neutral/completion styling. There is no lime state and no emoji or heart.

Blue requires an explicit `agent-working` assertion as well as `in_progress`;
a stale status alone remains yellow. Captain input takes precedence. Before
pausing, blocking, or handing control back, update `attention` to `waiting` and
move the status to `pending` when appropriate. After a captain answer, first
clear `captain-input` to `waiting`; set `agent-working` only in the update that
starts real work.

The old title workaround (`● ` prefixes) is normalized on create, subject
update, and session replay. Only leading marker-plus-whitespace decoration is
removed; semantic text and a marker-only subject are preserved.

## Installed source map

The inspected installation is
`/home/podles/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo` at version
`2.9.0`:

- `index.ts` registers lifecycle replay and the persistent overlay.
- `todo.ts` registers the existing `todo` tool and `/todos` command.
- `state/state-reducer.ts` mutates task snapshots; `state/store.ts` owns the
  per-session live slots; `state/replay.ts` restores the latest tool-result
  snapshot.
- `state/selectors.ts` derives visibility, counts, ids, and overlay layout.
- `view/format.ts` renders tool calls/results and overlay/command rows.
- `todo-overlay.ts` supplies the live Pi widget and width truncation.
- `tool/response-envelope.ts` preserves the LLM-facing result and persisted
  `details` shape; `tool/types.ts` defines task metadata.

The patch changes only `README.md`, `docs/{overlay,tool-schema}.md`,
`todo.ts`, `tool/sanitize.ts`, `state/{replay,selectors,state-reducer}.ts`, and
`view/format.ts`. `prepare.py` checks package identity and SHA-256 for every
changed upstream file before `git apply`; source drift fails closed.

## Verify

From the PodleTools repository:

```sh
TodoAttention/tests/test.sh
TodoAttention/tests/smoke-test.sh
```

`test.sh` copies the installed package into worktree-local scratch directories,
checks and applies the maintained patch, then tests real patched TypeScript
through Pi's Jiti loader. Assertions cover exact ANSI bindings, all attention
classes and transitions, pending/blocked/stale versus explicitly active work,
completed/deleted rows, update/list/get renderers, narrow ANSI-aware truncation,
always-visible ids, persistence replay, and legacy title normalization. It also
proves compatibility drift is rejected and regenerates the patch byte-for-byte.

The same suite performs check, install, actual Pi discovery, and rollback under
an isolated `PI_CODING_AGENT_DIR`. It verifies that the installed package is the
only configured rpiv-todo source, captures the real TUI ANSI stream for yellow,
blue, and hot pink overlay rows, and proves rollback keeps unrelated settings.
`smoke-test.sh` separately exercises the complete patched extension explicitly.
Neither test reloads a live session nor changes global settings/installations.

Environment overrides are available for another installation:
`RPIV_TODO_SOURCE`, `PI_CORE_PACKAGE`, `NEON_AFTERGLOW_THEME`, and `JITI_PATH`.

## Supported preparation and installation

`prepare.py` remains the source-maintainer path. It deliberately refuses to
mutate `node_modules`; give it a clean `@juicesharp/rpiv-todo@2.9.0` source tree:

```sh
TodoAttention/prepare.py /path/to/rpiv-mono/packages/rpiv-todo
TodoAttention/prepare.py /path/to/rpiv-mono/packages/rpiv-todo --apply
```

For an installed npm package, use `install.py`. It reads but never edits the npm
package. It checks the package identity, every patched-file hash, required
installed dependencies, patch applicability, and that settings contain exactly
one rpiv-todo source. It then builds a self-contained patched package under
`$PI_CODING_AGENT_DIR/todoattention/releases/`, backs up `settings.json`, and
atomically replaces the npm package entry with that stable absolute local path.
The local package survives deletion of a checkout or disposable task worktree.

Run the complete preflight without persistent changes:

```sh
TodoAttention/install.py check \
  --source /home/podles/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo
TodoAttention/install.py install \
  --source /home/podles/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo \
  --dry-run
```

After this change is merged and activation is separately approved, the ready
install command from a stable PodleTools checkout is:

```sh
/path/to/PodleTools/TodoAttention/install.py install \
  --source /home/podles/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo
```

The command does **not** restart or reload Pi. Exit or restart Pi only in a
separately coordinated window; merged code, configured package source, and
colors visible in a newly started TUI are three distinct states. Do not run
`pi remove` followed by `pi install`: a failure between those commands leaves a
partial configuration, while the supported installer stages and verifies the
replacement first and never registers two todo packages.

### Rollback

Preflight and perform rollback with:

```sh
TodoAttention/install.py rollback --dry-run
TodoAttention/install.py rollback
```

Rollback requires exactly one managed TodoAttention entry and no competing npm
entry. It restores the original package entry in place, preserves unrelated
settings (including changes made after installation), removes the managed
release, and does not restart Pi. The exact pre-install `settings.json` is also
kept under `$PI_CODING_AGENT_DIR/todoattention/backups/` for inspection or
manual disaster recovery.

### Versions and updates

The release is intentionally pinned to `@juicesharp/rpiv-todo@2.9.0` and the
hashes in `prepare.py`. `pi update --extensions` does not update an absolute
local package source. To adopt a newer upstream version, first update and test
the maintained patch, compatibility hashes, release name, and installer checks;
then roll back the old managed release, update the npm package, and run the new
installer. The installer copies the compatible installed `rpiv-config` and
`typebox` runtime dependencies into the managed release, so it does not depend
on the disposable npm tree after activation. Upstream package metadata, author,
repository, and MIT license remain intact.

This repository change does not install into the production agent directory,
restart a live session, or claim that merged code is already visible.
