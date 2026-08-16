# PodleChrome

PodleChrome is the home for notes and setup material related to an agent-friendly Chromium browser profile.

## Purpose

This folder is for documenting how to set up, maintain, and use a dedicated browser profile for Pi and agent workflows.

The goal is to keep agent browser access separate from personal browsing, while still allowing useful logged-in research and testing sessions when intentionally configured.

## What belongs here

- Setup notes for the dedicated Chromium profile.
- Launch commands or helper scripts for opening the agent browser.
- Notes about which accounts are safe to use in the agent browser.
- Exported configuration that is safe to keep in this repository.
- Documentation for browser-related agent workflows.

## What should not go here

Do not store secrets, passwords, session cookies, private keys, recovery codes, or production credentials in this repository.

If a browser profile contains logged-in accounts, keep the actual profile data outside the repository and treat it as private local machine state.

## Recommended local profile location

A reasonable local profile path is:

```bash
$HOME/.agent-browser/chromium-profile
```

A basic launch command is:

```bash
mkdir -p "$HOME/.agent-browser/chromium-profile"
chromium --user-data-dir="$HOME/.agent-browser/chromium-profile" --no-first-run
```

This creates a separate Chromium identity with its own cookies, history, extensions, and logged-in sessions.

## Best practices

- Use a dedicated browser profile for agents instead of a personal browser profile.
- Log in only to accounts you are comfortable letting agents access.
- Prefer read-only, test, staging, or low-risk accounts.
- Avoid banking, primary email, password managers, production admin consoles, and other sensitive accounts.
- Keep multi-factor authentication enabled and approve prompts manually when needed.
- Avoid enabling personal Google sync unless that is intentional.
- Keep actual profile data out of Git.
