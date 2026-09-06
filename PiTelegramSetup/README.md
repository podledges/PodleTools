# Pi Telegram prepare-only setup

This tool stages and inspects the pinned upstream `@llblab/pi-telegram` package. It does **not** install the package, edit Pi settings, collect a token, connect polling, or contact Telegram.

## Pin and prerequisites

- npm package: `@llblab/pi-telegram@0.44.0`
- npm package source revision recorded by the publisher: `c94505b31caa436ec0dc8645d488b5d41e42da08`
- Node.js: `>=22.19.0`
- Pi: `>=0.84.4` (the package manifest's peer requirement)

The repository records the npm tarball SHA-256, npm integrity value, and hashes for `package.json`, `index.ts`, and `scripts/check-downgrade.mjs` in [`pins.json`](pins.json). This is stricter than relying on the mutable npm `latest` tag.

## Prepare

```sh
python3 PiTelegramSetup/prepare.py
```

The script checks local Node/Pi versions, downloads the exact npm version into ignored `PiTelegramSetup/.prepared/`, verifies the archive and inspected files, validates the extension manifest, and only then writes a future-install plan. It never invokes `pi install`, Pi commands, or Telegram.

To inspect before any later installation:

```sh
tar -tzf PiTelegramSetup/.prepared/downloads/*.tgz
# Extract into another temporary directory if a full source review is wanted.
```

## Configuration and credentials

[`templates/telegram.nonsecret.json.example`](templates/telegram.nonsecret.json.example) contains only optional non-secret settings. It deliberately has no bot token, user id, polling cursor, thread binding, or runtime state. Do not overwrite an existing `~/.pi/agent/telegram.json`; a future operator should merge selected non-secret settings while preserving existing profiles and behavior.

For future activation, use Pi's interactive `/telegram-setup` prompt to enter the bot token rather than putting it in this repository or shell history. Pi persists Telegram config privately (`0600`). Preconfigure `profiles.default.allowedUserId` only if the operator already knows the numeric owner id; otherwise the first user to message the private bot becomes the owner. Keep the bot private and restrict it in BotFather where available.

## Future activation (separate and explicit)

Preparation stops before this boundary. After reviewing the staged source and generated `ACTIVATION.md`, a human may:

1. Run the exact pinned `pi install npm:@llblab/pi-telegram@0.44.0` command.
2. Start an interactive Pi session and run `/telegram-setup` for secure token entry.
3. Run `/telegram-connect` only when polling should begin.
4. Pair through a private bot DM; enable Telegram Threaded Mode separately only if multi-instance threads are desired.

These steps are intentionally not automated here, preserving any existing Pi Telegram package, configuration, owner, connection, and runtime state.

## Verified capabilities and limits

At the pinned release, this is an interactive Telegram companion for a **live Pi session**: inbound prompts, queued turns, replies, files, controls, and explicit outbound delivery. Authorization is one `allowedUserId` per bot profile; other users are ignored. It is not a general content/status filter.

Telegram private-chat Threaded Mode can map visible Pi instances to Telegram `message_thread_id` targets. Without that Telegram capability it remains classic single-owner DM mode. Threads route Pi sessions; there is no arbitrary topic-name filter or hidden agent spawning.

The bridge fences output to its target and avoids known internal double-delivery paths, but upstream explicitly does **not** promise exactly-once remote delivery: an issued request cannot be undone, uncertain acknowledgements are not replayed, and pending publications are not a durable outbox. Running Herdr notifications to the same chat is a separate sender path with no cross-integration deduplication, so similar completion information may appear twice.

Authoritative upstream references inspected at the pin: `package.json`, `README.md`, `index.ts`, `lib/config.ts`, `docs/architecture.md`, `docs/outbound.md`, and `scripts/check-downgrade.mjs`.

## Offline tests

```sh
python3 -m unittest discover -s PiTelegramSetup/tests -v
```

Tests use generated archives and fake `npm`, `node`, and `pi` executables in temporary directories. They make no network or Telegram requests and do not read or modify live Pi state.
