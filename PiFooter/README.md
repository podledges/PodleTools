# PodleTools Pi footer

Supported, installable home of the captain's custom Pi footer. It preserves the
merged PodleDoubleO PR #25 behavior; it is not the stock Pi footer and has not
been redesigned. See [NOTICE.md](NOTICE.md) for migration provenance and license
status. PodleTools is the source owner going forward. The old PodleDoubleO tree
is a migration source, not another live package.

## Compatibility and dependencies

- Pi `0.85.1` is the tested runtime; use Node.js 22 or newer (CI uses Node 24).
- Pi core packages are declared as peer dependencies and are not vendored.
- No Home Manager, `/nix/store`, Firstmate task copy, sibling repository, or
  developer `node_modules` path is needed.
- `quota-axi` is an optional runtime integration, resolved from `PATH` (override
  its executable with `PI_QUOTA_AXI`). Without valid provider data the footer
  truthfully shows `?`; it never invents `0%`. Currency support is fully included.

The root `package.json` deliberately exposes exactly
`PiFooter/extensions/firstmate-footer-colors.ts`; no other PodleTools tool is
loaded. Pi installs the repository root because Pi has no supported git
subdirectory syntax.

## Appearance and state

Exactly two width-bounded rows are rendered (illustrative plain-text example):

```text
12k / 200k   Ꮚ •ﻌ•Ꮚ   [$2.192]   Ꮚ •ﻌ•Ꮚ   gpt:55%  grk:72%     gpt-6-astra • high
adhd ×   calm ✔   telegram ✔
```

The first row contains context, estimated SGD cost, provider quota, and the
right-aligned current Pi model/effective thinking level. The second always
contains `adhd`, `calm`, and `telegram`. Enabled labels are `#FF00FF` and enabled
`✔` glyphs are `#CCFF00`; disabled/disconnected labels and `×` are dim.

Model and effort come from Pi runtime state. A project opts into the ADHD footer
startup state with `config/adhd` under that session's initial working directory;
after trimming and case normalization, only exact `on` enables it. Missing,
unreadable, empty, or other content starts disabled, so unrelated projects do not
inherit the opt-in. The latest explicit `/i-have-adhd`, `/skill:i-have-adhd`,
`stop adhd mode`, or `normal mode` toggle in the session branch overrides that
default across reload/resume. This marker controls only the footer indicator;
the Firstmate home's own startup instructions control actual response style.
Calm reads `config/calm` using `FM_CONFIG_OVERRIDE`, then `FM_HOME`, then
`FM_ROOT_OVERRIDE`, then the Pi working directory. Telegram uses the live
`telegram` extension status. No package/config presence is treated as a
connection. There are no timers, reboot schedules, model choices, auth copies,
or host-setting changes.

## Required legacy preflight and migration

**Do not activate this package on the live machine until the captain approves the
exact migration.** Installing it cannot remove or repair the old auto-discovered
entry. The current primary's
`~/.pi/agent/extensions/firstmate-footer-colors.ts` is a dangling Home Manager
symlink and `footer-support` is absent. A good package or plain `-e` does not make
a failing ordinary-discovery entry safe. `--no-extensions -e ...` is only an
isolated render test: it disables Telegram/Firstmate supervision and is **not** a
production activation command.

Run this narrow, read-only preflight as the Pi user:

```sh
legacy="$HOME/.pi/agent/extensions/firstmate-footer-colors.ts"
legacy_support="$HOME/.pi/agent/extensions/footer-support"
ls -ld -- "$legacy" "$legacy_support" 2>&1 || true
readlink -- "$legacy" 2>/dev/null || true
readlink -e -- "$legacy" 2>/dev/null || printf '%s\n' 'legacy footer target is unreadable/dangling'
```

A visible `readlink` value is not proof of a readable target; only successful,
nonempty `readlink -e` is. Even a readable old footer must be removed from
discovery, because two footer owners compete and command names gain suffixes.
Preserve only these exact legacy entries before installing:

```sh
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$HOME/.pi/agent/legacy-footer-backup-$stamp"
mkdir -m 700 -- "$backup"
legacy="$HOME/.pi/agent/extensions/firstmate-footer-colors.ts"
legacy_support="$HOME/.pi/agent/extensions/footer-support"
if test -L "$legacy" || test -e "$legacy"; then mv -- "$legacy" "$backup/"; fi
if test -L "$legacy_support" || test -e "$legacy_support"; then mv -- "$legacy_support" "$backup/"; fi
printf 'legacy backup: %s\n' "$backup"
```

Do not move, delete, or disable any other extension, setting, credential, session,
or user data. Keep the terminal output containing the unique backup path.

PodleDoubleO Home Manager can recreate the conflict on its next activation. The
separately authorized follow-up is to remove only these declarations from
`home/podles/modules/pi.nix` in PodleDoubleO: the
`firstmate-footer-colors.ts` `home.file`, the `footer-support` `home.file`, and
the `pi-sgd-rate-refresh` `writeShellScriptBin`. Do not edit that repository as
part of this package migration.

## Install, update, reload, and remove

Private Git access must already work through the operator's SSH agent/key and
GitHub authorization. Do not put a token in a command or URL.

After the approved preflight/move:

```sh
pi install git:git@github.com:podledges/PodleTools.git
pi list
```

For a reviewed immutable commit, append `@COMMIT_SHA`. Such a pin does not move
under `pi update --extensions`; install the new reviewed ref explicitly. For the
moving repository source:

```sh
pi update git:git@github.com:podledges/PodleTools.git
```

Save drafts and wait for the intended Pi session to be idle, then run Pi's native:

```text
/reload
/sgd-rate
```

No service, bot, Firstmate worker, or machine restart is required. A fresh Pi
startup is also sufficient after the legacy conflict is removed. This task did
not perform either operation on the primary machine.

Remove with Pi's native package manager:

```sh
pi remove git:git@github.com:podledges/PodleTools.git
pi list
```

Then `/reload` once idle (or exit and restart Pi). Removal leaves cache, settings,
credentials, sessions, and the operator's legacy backup alone.

Supported source-checkout alternative (the path remains live; Pi does not copy it):

```sh
pi install /absolute/path/to/PodleTools
pi remove /absolute/path/to/PodleTools
```

## Rollback ownership

Rollback maintains one active footer owner:

1. Remove the PodleTools package and reload/exit Pi.
2. Confirm the two destination paths are absent; do not overwrite anything.
3. Restore only `firstmate-footer-colors.ts` and `footer-support` from the exact
   backup path printed during migration.
4. Start Pi normally. If the restored footer is a dangling link, leave Pi stopped
   and restore a valid reviewed Home Manager generation instead of using `-ne`.

Example restore after manually substituting the recorded backup path:

```sh
backup="$HOME/.pi/agent/legacy-footer-backup-REPLACE_WITH_RECORDED_STAMP"
test ! -e "$HOME/.pi/agent/extensions/firstmate-footer-colors.ts" && \
  test ! -L "$HOME/.pi/agent/extensions/firstmate-footer-colors.ts" && \
  mv -- "$backup/firstmate-footer-colors.ts" "$HOME/.pi/agent/extensions/"
if test -e "$backup/footer-support" || test -L "$backup/footer-support"; then
  test ! -e "$HOME/.pi/agent/extensions/footer-support" && \
    test ! -L "$HOME/.pi/agent/extensions/footer-support" && \
    mv -- "$backup/footer-support" "$HOME/.pi/agent/extensions/"
fi
```

## Currency, quota, cache, and commands

`$` denotes an **estimated SGD** value, not USD, subscription billing, a bank
conversion, or evidence of a charge. The extension sums each recorded
`usage.cost.total` (which already includes cache-token cost), multiplies the
cumulative USD total by SGD/USD once, and rounds once. Missing/invalid rate data
renders `[$—]`, including at zero usage; a valid rate and zero usage renders
`[$0.000]`.

The included helper fetches the fixed Frankfurter HTTPS USD→SGD endpoint with a
five-second bound, validates explicit base/quote/rate/source/date metadata, and
atomically stores mode-0600 JSON at
`$XDG_CACHE_HOME/pi/usd-sgd.json` or `~/.cache/pi/usd-sgd.json`. Override with
`PI_SGD_RATE_CACHE`. Failed refresh retains last-known-good data byte-for-byte.
A stale valid exchange rate remains usable offline.

Inside Pi:

- `/sgd-rate` reads current source/timestamps without fetching.
- `/sgd-rate-refresh` performs an explicit bounded refresh.

The package also includes `PiFooter/bin/pi-sgd-rate-refresh`. From a source
checkout run `./PiFooter/bin/pi-sgd-rate-refresh`; for the unpinned private-Git
install above, the exact installed path is:

```sh
"$HOME/.pi/agent/git/github.com/podledges/PodleTools/PiFooter/bin/pi-sgd-rate-refresh"
```

It returns 0 for refreshed, 1 for retained last-known-good, and 2 for unavailable.
The footer may asynchronously bootstrap/refresh currency at session start, never
during render.

Quota is separate and cache-first at
`$XDG_CACHE_HOME/pi-fleet-quota.json` (override `PI_FLEET_QUOTA_CACHE`). The
included detached helper calls optional `quota-axi`; errors show `err`, while
missing/auth-required/unavailable/invalid/stale data shows `?`. Genuine numeric
zero alone shows `0%`. No footer render performs network or blocking process I/O.

## Validation boundaries

Run:

```sh
npm install --ignore-scripts
npm test
npm pack --dry-run
```

Tests use fake/offline currency, provider, ADHD, Calm, and Telegram inputs. They
cover two rows, narrow widths, colors, live model/effort updates, feature
transitions, unknown/error/zero quota and currency, package manifest selection,
relocation, native disposable-home install/discovery/removal, coexistence, and
legacy conflicts. The render harness is an isolated proof, not evidence that the current
primary rendered or activated this footer. No test copies auth, infers a model,
or bypasses ordinary extension discovery when testing a broken readable legacy
entry.
