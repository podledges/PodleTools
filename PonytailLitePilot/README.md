# Isolated Ponytail lite pilot

This pilot stages and runs the inspected `@dietrichgebert/ponytail@4.9.0` release entirely below [`PonytailLitePilot/.pilot/`](.gitignore). It does not install globally, touch the normal Pi directory, copy Ponytail's `AGENTS.md`, enable `ultra`, invoke whole-repo audit skills, or add review gates.

## Security finding and scope

Pi extensions run with the user's full permissions. This release's Pi extension has no network or subprocess calls, but it can read `$XDG_CONFIG_HOME/ponytail/config.json`, append mode entries to a persisted Pi session, and `/ponytail default MODE` writes that config file. Its default is `full`, not `lite`. The wrapper therefore isolates `HOME`, `XDG_CONFIG_HOME`, `PI_CODING_AGENT_DIR`, and session storage; forces `PONYTAIL_DEFAULT_MODE=lite`; enables `PI_OFFLINE=1`; and starts in an empty synthetic work directory with context-file loading disabled.

Do not use `/ponytail default ...` in the pilot. A write would remain isolated, but it is unnecessary. The bundled `ponytail-audit` skill requests a whole-repo scan and the gain skill repeats upstream benchmark claims; both are discoverable because Pi loads the package's skills, but neither is used here.

## Inspected release

[`pins.json`](pins.json) records the exact npm version, npm integrity, archive SHA-256, publisher `gitHead`, matching `v4.9.0` tag commit, archive size/count, Pi version tested, and hashes of the manifest and Pi runtime inputs. The npm archive's 49 shipped files matched Git tag `0a4dd63ad4541f4f655c4108a295916f3c1d8fda` byte-for-byte.

The release manifest has:

- Pi resources: `./pi-extension/index.js` and `./skills`
- no `dependencies`, `optionalDependencies`, `peerDependencies`, `bin`, or install lifecycle script
- one test script only

The Pi extension registers six commands, writes session-only `ponytail-mode` custom entries on mode changes, updates a status item unless hidden, dispatches aliases to bundled skills, and appends the selected ruleset in `before_agent_start`. `off`, `normal mode`, and `stop ponytail` suppress injection.

The other shipped executables are for Claude/Codex/Copilot/Qoder/OpenCode, not Pi manifest entries. Their hooks can create or remove mode/config files and the Claude activation hook creates a statusline-nudge marker. `scripts/uninstall.js` can edit Claude's `settings.json`. The OpenCode plugin writes an OpenCode mode file. None is invoked by this pilot. The shell/PowerShell status scripts only read a Claude mode flag. No inspected executable makes a network request.

The package's `AGENTS.md` was inspected but is neither installed as project context by the Pi manifest nor copied anywhere. Existing PodleTools rules remain authoritative.

## Reproducible validation

```sh
./PonytailLitePilot/pilot.sh check
```

`check` downloads the exact npm version into an ignored temporary directory, verifies the archive before extraction, checks the manifest and key runtime hashes, installs the verified local package using native `pi install`, and runs upstream's 23 Pi-extension tests. It then uses an offline deterministic provider fixture to prove that:

- Pi discovers the real package extension and bundled skills;
- RPC reaches a complete model turn;
- `before_agent_start` and `context` callbacks fire;
- the provider receives the final lite-injected system prompt after `/ponytail lite`;
- the provider receives no Ponytail marker after `/ponytail off`;
- native `pi remove` removes both local entries while preserving an unrelated setting.

The fixture response is deliberately constant. It validates Pi integration, not Ponytail usability or model quality, and it makes no network request. The first attempted RPC probe never reached `before_agent_start`: the isolated Pi reported `No API key found for the selected model`. That was a fixture prerequisite failure, not a Ponytail failure; the offline provider supplies the missing test seam without using a credential.

## Optional isolated trial

Prepare and open an isolated interactive Pi:

```sh
./PonytailLitePilot/pilot.sh prepare
./PonytailLitePilot/pilot.sh launch
```

Inside Pi, verify the selected level and off switch:

```text
/ponytail status
/ponytail lite
/ponytail off
/ponytail lite
```

The pilot lane had no provider credential inside its isolated Pi directory, so no real-model usability result is claimed. A captain may optionally run `/login` in this isolated session; credentials are then written only below `.pilot/` and must never be committed or pasted into commands.

For a bounded same-model implementation comparison, after isolated login run these from the repository shell. Only `lite` and `off` are accepted:

```sh
PONYTAIL_PILOT_MODE=lite ./PonytailLitePilot/pilot.sh launch -p \
  'In lite/cache.py implement a dependency-free decorator that caches one pure function for at most 8 keys and 60 seconds; include one assert-based fake-clock check.'
PONYTAIL_PILOT_MODE=off ./PonytailLitePilot/pilot.sh launch -p \
  'In off/cache.py implement a dependency-free decorator that caches one pure function for at most 8 keys and 60 seconds; include one assert-based fake-clock check.'
diff -ru PonytailLitePilot/.pilot/work/off PonytailLitePilot/.pilot/work/lite
```

Judge whether the lite result remains correct and whether its one-line simpler alternative is useful. Do not extrapolate line, token, cost, or time savings from this two-arm synthetic case.

Turn the pilot off at any time with `/ponytail off`, then exit Pi and remove all isolated state:

```sh
./PonytailLitePilot/pilot.sh remove
test ! -e PonytailLitePilot/.pilot
```

## Possible PodleDoubleO ownership later

A later, separately approved PodleDoubleO Home Manager change could own the exact package pin/hash, an isolated-or-normal Pi package declaration, and a wrapper that sets the approved default mode. It should not own or replace project `AGENTS.md`, credentials, sessions, mutable Ponytail config, or mode state. Removal should delete only resources it owns and preserve unrelated Pi settings. This pilot does not modify PodleDoubleO.

## Sources reviewed

- npm release and provenance: `@dietrichgebert/ponytail@4.9.0`
- <https://pi.dev/packages/@dietrichgebert/ponytail>
- <https://github.com/DietrichGebert/ponytail/tree/v4.9.0>
- installed Pi docs: `packages.md`, `extensions.md`, `environment-variables.md`, plus linked `quickstart.md`, `session-format.md`, `rpc.md`, `tui.md`, and `custom-provider.md`
- installed Pi examples: prompt modification and system-prompt status examples
