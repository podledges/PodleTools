---
name: bot-trust
description: Use Bot Trust for explicit probability requests and randomized choices.
user-invocable: false
metadata:
  internal: true
---

# Bot Trust

For natural-language intake, use the installed `bot-trust-filter` entry point when the user explicitly asks for a probability-shaped randomized choice. The filter recognizes a bare exact numeric percentage or one exact numeric percentage in explicit probability or random-choice phrasing with an explicit randomized-decision request. A casual percentage mention, ambiguous request, or multiple percentages is not a match.

Invoke `bot-trust` directly when the user explicitly provides an exact probability such as `70 %` or asks for a weighted randomized decision. Do not invoke either layer merely because probability is mentioned casually, or when implementing probability logic for an application unless implementation guidance is requested.

For a direct explicit randomized decision, use the helper's stable result as requested: binary mode returns `0` or `1`, while `select` and `tree` return the selected outcome.

Bot Trust never replaces safety checks, spending or purchase approval, merge authority, destructive-action approval, security-sensitive choices, credentials, or other user-owned decisions. Use a natural-language filter result only to vary the current wording or idea surfaced, and never to authorize an action.

Use a direct helper result only for the current requested decision. Do not add frequency tracking or lasting behavior, and do not connect Bot Trust to Hermes, MCP, or another integration without an explicitly accepted instruction change.

The helper is stateless and uses operating-system-backed secure randomness, not hardware quantum randomness. Its default standalone entry points are `BotTrust/bin/bot-trust` and `BotTrust/bin/bot-trust-filter`; use the equivalent installed paths when `BotTrust/bin` is on `PATH`.
