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
| Waiting, pending, blocked, stale, missing, or unknown attention | Existing neutral `dim` theme token |

Completed and deleted tasks have no attention indicator and retain upstream's
neutral/completion styling. There is no lime state and no emoji or heart.

Blue requires an explicit `agent-working` assertion as well as `in_progress`;
a stale status alone remains neutral. Captain input takes precedence. Before
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

`test.sh` copies the installed package into a worktree-local scratch directory,
checks and applies the maintained patch, then tests real patched TypeScript
through Pi's Jiti loader. Assertions cover ANSI/theme bindings, all attention
classes and transitions, pending/blocked/stale versus explicitly active work,
completed/deleted rows, update/list/get renderers, narrow ANSI-aware truncation,
always-visible ids, persistence replay, and legacy title normalization. It also
proves compatibility drift is rejected and regenerates the patch byte-for-byte.

`smoke-test.sh` starts an actual Pi TUI under a worktree-local
`PI_CODING_AGENT_DIR`, with extension discovery, sessions, tools, context,
skills, prompts, network access, and global theme discovery disabled. It loads
the complete patched upstream extension and neon-afterglow explicitly, captures
Pi's raw ANSI stream, and verifies the overlay's blue, pink, neutral, blocked,
and completed rows. It neither reloads a live session nor changes global
settings/installations.

Environment overrides are available for another installation:
`RPIV_TODO_SOURCE`, `PI_CORE_PACKAGE`, `NEON_AFTERGLOW_THEME`, and `JITI_PATH`.

## Apply to upstream source

Do not run the patcher against `node_modules`; it deliberately refuses. Start
from a clean `@juicesharp/rpiv-todo@2.9.0` source tree (for example the package
directory in an rpiv-mono checkout at the matching release), then run:

```sh
/path/to/PodleTools/TodoAttention/prepare.py /path/to/rpiv-mono/packages/rpiv-todo
/path/to/PodleTools/TodoAttention/prepare.py /path/to/rpiv-mono/packages/rpiv-todo --apply
cd /path/to/rpiv-mono/packages/rpiv-todo
npm test
```

The first command checks compatibility and `git apply --check`; the second
changes that clean upstream checkout. Review its diff before activation.

## Isolated activation before deployment

Use the patched upstream source directly and suppress discovered extensions so
the globally installed rpiv-todo cannot compete:

```sh
scratch=$(mktemp -d)
printf '{"defaultProjectTrust":"always"}\n' > "$scratch/settings.json"
PI_CODING_AGENT_DIR="$scratch" PI_OFFLINE=1 \
  pi --no-session --no-extensions \
  -e /path/to/rpiv-mono/packages/rpiv-todo/index.ts \
  --no-themes --theme /path/to/neon-afterglow.json \
  --use-theme neon-afterglow --offline
```

Install the patched upstream checkout permanently only after review/merge and
explicit deployment approval:

```sh
pi remove npm:@juicesharp/rpiv-todo
pi install /absolute/path/to/rpiv-mono/packages/rpiv-todo
# Restart Pi; do not reload an in-flight shared session.
```

Removing the npm entry before adding the local patched upstream source avoids
duplicate lifecycle handlers and duplicate `todo` registrations. This PR makes
the patch **code-ready only**: it does not apply it to the global installation,
edit global settings, reload a session, merge a PR, or authorize live
deployment.
