# Chromium setup notes for agent workflows

## What `--no-first-run` means

Chromium often shows first-launch setup surfaces for a fresh profile, such as welcome pages, default-browser checks, sign-in prompts, or onboarding tabs.

The launcher uses:

```bash
--no-first-run
--no-default-browser-check
```

These flags reduce setup interruptions so the browser opens directly into the requested page or `about:blank`.
They do not make the browser unsafe, and they do not automatically log into anything.
You still choose which accounts to sign into manually.

## Repository files vs real profile data

Keep this repository as the source for scripts, docs, and safe configuration.
Keep real Chromium profile data outside Git.

The real profile folders live at:

```text
$HOME/.agent-browser/chromium-profiles/<profile-name>
```

That directory can contain cookies, session tokens, browser history, cache, extension state, and account data.
A faithful copy in Git would risk storing private logged-in browser state and would quickly become noisy and machine-specific.

## Why not link the whole profile into the repo?

A symlink from the repo to the real profile is technically possible, but it is usually not the right model.
It can make the repo look like it owns private browser state, and a future copy, backup, or commit command could accidentally capture sensitive data.

Prefer this split:

- Git repo: launcher, documentation, safe templates, and notes.
- Local machine state: actual Chromium user-data directories.

## Useful setup ideas

Common useful patterns for agent browser setups are:

- Dedicated profile per risk level or task type.
- No personal Google sync in the agent profile unless intentionally enabled.
- Separate accounts for agents where possible.
- Read-only accounts for billing, finance, dashboards, and reporting.
- A disposable testing profile for local apps and staging environments.
- A clear launcher command that always uses the intended profile directory.
- Remote debugging enabled only when a tool needs it, rather than all the time.
- Periodic cleanup of disposable profiles.
- Minimal extensions, with only tools you intentionally want agents to use.

## Remote debugging

Browser automation tools often connect through Chromium's DevTools protocol.
When a tool needs that connection, launch with a debugging port:

```bash
agent-chromium testing --debug-port 9222 http://localhost:3000
```

Only enable the port when needed.
A DevTools connection can inspect and control pages in that browser session.

## Account safety

Good candidates for agent browser access:

- Test accounts.
- Read-only dashboards.
- Low-risk research sites.
- Separate shopping or receipt accounts with limited payment exposure.

Avoid by default:

- Primary email.
- Password managers.
- Banking.
- Production admin consoles.
- Accounts where an accidental click can make an irreversible change.
