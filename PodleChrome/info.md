# PodleChrome

PodleChrome is the home for notes, scripts, and setup material related to an agent-friendly Chromium browser setup.

## Purpose

This folder documents how to set up, maintain, and use dedicated browser profiles for Pi and agent workflows.

The goal is to keep agent browser access separate from personal browsing, while still allowing useful logged-in research and testing sessions when intentionally configured.

## What is included

- `bin/agent-chromium` - launcher for dedicated Chromium profiles.
- `config/profiles.md` - profile names, intended use, and account guidance.
- `docs/chromium-setup-notes.md` - setup notes, safety guidance, and repository-vs-local-state explanation.

## Local profile storage

The real browser profile data lives outside this repository at:

```text
$HOME/.agent-browser/chromium-profiles
```

Configured profiles:

- `research`
- `shopping`
- `finance-readonly`
- `testing`

## Launch examples

From this repository:

```bash
PodleChrome/bin/agent-chromium research
PodleChrome/bin/agent-chromium testing http://localhost:3000
PodleChrome/bin/agent-chromium testing --debug-port 9222 http://localhost:3000
```

If installed on your PATH:

```bash
agent-chromium research
```

## What should not go here

Do not store secrets, passwords, session cookies, private keys, recovery codes, or production credentials in this repository.

If a browser profile contains logged-in accounts, keep the actual profile data outside the repository and treat it as private local machine state.

## Best practices

- Use dedicated browser profiles for agents instead of a personal browser profile.
- Log in only to accounts you are comfortable letting agents access.
- Prefer read-only, test, staging, or low-risk accounts.
- Avoid banking, primary email, password managers, production admin consoles, and other sensitive accounts.
- Keep multi-factor authentication enabled and approve prompts manually when needed.
- Avoid enabling personal Google sync unless that is intentional.
- Keep actual profile data out of Git.
