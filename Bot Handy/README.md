# Bot Handy

Bot Handy is a placeholder for a future bounded Windows-side helper. It is a sibling tool, separately packaged and decoupled from every other PodleTools tool.

It may later use `Bot Port-dric/` for a minimal localhost wake-up handshake, but Bot Handy must not require Bot Port-dric merely to exist as its own tool. No Handy settings are created or rewritten by this scaffold.

## Safety boundary

Bot Handy must never be given a free hand over Windows. Any future implementation should expose a small allowlisted set of explicit operations, validate and bound all inputs, run with the least privilege available, and keep consequential or destructive actions behind human approval. A localhost connection is not proof of authorization.

## Current state and dependencies

This folder contains documentation only: there is no executable helper and no package dependency yet. Add package requirements to a tool-level `requirements.txt` when implementation begins, and record strict dependencies on Windows applications or other PodleTools in this README.
