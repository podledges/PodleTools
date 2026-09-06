# Herdr Telegram notify prepare-only setup

This tool stages and inspects the upstream `agent-telegram-notify` example. It does **not** install, link, enable, or invoke the plugin; edit Herdr configuration; drive Herdr lifecycle behavior; read credentials; or contact Telegram.

## Pin and prerequisites

- source: `ogulcancelik/herdr-plugin-examples/agent-telegram-notify`
- revision: `18709cdc851dd63ed0543eb8388343a5446fd8d8`
- plugin version: `0.1.0`
- Herdr: `>=0.7.0` from the plugin manifest
- Node.js: `>=18` from the upstream README

Exact hashes for the manifest, scripts, README, and upstream example environment file are in [`pins.json`](pins.json). The example repository says it is provided as-is and not actively maintained; this setup therefore pins and audits it rather than tracking its default branch.

Installed Herdr `0.8.2` was checked while authoring this tool. It exposes `plugin install`, `config-dir`, and `plugin install --ref`; older Herdr builds may lack stable plugin config directories. The preparation script checks capabilities rather than assuming the command exists.

## Prepare

```sh
python3 HerdrTelegramNotifySetup/prepare.py
```

The script checks local Herdr/Node versions and the exact install syntax, clones the upstream repository into ignored `HerdrTelegramNotifySetup/.prepared/`, detaches at the pinned revision, verifies every relevant source file, inspects manifest identity and event hook, and only then writes a future activation plan. It runs no Herdr plugin lifecycle command.

Review before any later installation:

```sh
find HerdrTelegramNotifySetup/.prepared/source/agent-telegram-notify -maxdepth 1 -type f -print
# Inspect herdr-plugin.toml, notify.mjs, lib.mjs, and toggle.mjs.
```

## Configuration and credentials

[`templates/agent-telegram-notify.env.example`](templates/agent-telegram-notify.env.example) contains empty credential fields and defaults notifications/title changes off. The real `.env`, token, chat id, and toggle state belong only in Herdr-managed config/state directories; local `.env`, state, and preparation output are ignored here.

For future setup, obtain the plugin config directory after installation and copy the template there as `.env`. Enter `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` locally with a private editor or secret-provisioning mechanism; do not paste them into version control, command-line arguments, logs, or this template. Keep `HERDR_TELEGRAM_ENABLED=0` until outbound delivery is intentionally activated.

## Future activation (separate and explicit)

Preparation stops before this boundary. The generated `ACTIVATION.md` contains the exact revision-pinned `herdr plugin install --ref ...` command only after inspection succeeds. Installation registers the plugin globally and enabled, so it is itself an activation step and must remain a deliberate human action. Configuring credentials and changing `HERDR_TELEGRAM_ENABLED=1` are additional explicit actions.

No Herdr start, stop, restart, session, agent, pane, server, action-invoke, or other lifecycle command belongs in this scaffold.

## Verified behavior and limits

The manifest listens to `pane.agent_status_changed`. `notify.mjs` sends one outbound Bot API `sendMessage` request when the reported status is `done` **or** `blocked`; other statuses are ignored. The message contains an agent label plus workspace and, when nonnumeric, tab label. This preserves cross-agent outbound completion/blockage notifications and does not provide interactive chat.

There is no configuration for filtering by agent, workspace, tab, event source, or arbitrary status. There is also no Telegram `message_thread_id`, topic selector, parse mode, retry queue, or recipient allowlist; `TELEGRAM_CHAT_ID` is one destination. Telegram forum/topic routing is therefore unsupported by this pinned plugin.

The script does not persist an event id or last status. Herdr's status-change event reduces ordinary repeats, but repeated `done`/`blocked` events, transitions back into those states, plugin retries, or uncertain network outcomes can produce duplicates or errors. It has no deduplication or exactly-once guarantee. If Pi Telegram also projects similar information to the same chat, the two independent integrations do not coordinate or deduplicate.

Authoritative upstream references inspected at the pin: `README.md`, `.env.example`, `herdr-plugin.toml`, `lib.mjs`, `notify.mjs`, and `toggle.mjs`. Current Herdr `0.8.2` plugin documentation was also checked for trust, global enabled-state, config/state directories, and `--ref` semantics.

## Offline tests

```sh
python3 -m unittest discover -s HerdrTelegramNotifySetup/tests -v
```

Tests use generated mock plugin repositories and fake `git`, `herdr`, and `node` executables in temporary directories. They make no network or Telegram requests and do not read or modify live Herdr state.
