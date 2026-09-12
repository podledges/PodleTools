# PodleTools

Personal tools that complement an agentic setup.

## Purpose

This repository is for small utilities, scripts, notes, and experiments that support local agent workflows.

The project is intentionally personal and internal-only.
Some tools may later serve as a guide for setup on another laptop, but convenience for cross-machine portability is not the primary goal.

## Suggested structure

Add each tool in its own directory with a short README that explains:

- what the tool does
- how to run it
- any setup it needs
- whether it is safe for agents to use directly

Avoid storing secrets, tokens, private keys, or production credentials in this repository.

## Tools

- [`PiFooter/`](PiFooter/) — supported installable package for the custom two-row Pi footer, with guarded legacy-owner migration.
- [`TodoAttention/`](TodoAttention/) — compatibility-gated coloured attention renderers for the existing rpiv-todo store.
- [`tools/clipboard-images/`](tools/clipboard-images/) — explicit screenshot path selection, isolated capture, and Pi-owned screenshot paste.
- [`PiTelegramSetup/`](PiTelegramSetup/) — prepare and inspect a pinned Pi Telegram package without installing or connecting it.
- [`HerdrTelegramNotifySetup/`](HerdrTelegramNotifySetup/) — prepare and inspect a pinned Herdr outbound Telegram notification plugin without activating it.
- [`PonytailLitePilot/`](PonytailLitePilot/) — inspect, validate, and optionally run a pinned Ponytail lite package in isolated Pi state.
