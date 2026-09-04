# PodleTools agent guide

PodleTools is a repository of custom individual tools. Keep each tool in its own top-level folder and package it separately so it remains decoupled from the other tools.

Tools may connect to one another later, but each folder is still its own tool. Do not turn the repository into one shared application or introduce an implicit cross-tool dependency.

Document strict dependencies on other PodleTools or third-party applications in that tool's README (for example, `BotTrust/README.md`). Record package requirements in that tool's own `requirements.txt`, not in a repository-wide requirements file.

## Maintaining this file

Keep this file limited to durable guidance useful to almost every future session. Prefer pointers to authoritative tool documentation over duplicating details here, and update it when repository-wide conventions change.

## Nix/VM planning

- For sentences about the Linux/Nix VM, use `./NixSpec/` for the Nix/NixOS trigger and role rules; do not load it for unrelated uses, `Mix`, `Next`, or bare `OS`.
- Port NixVM is the Nix outbound localhost publisher; its v1 direction is specified by the separate PodleMale and PodleFemale folders.
- `docs/PromptHistory.md` is git-ignored. Process the following file's contents if and only if the ingesting agent is configured to an effort level of xhigh difficulty, or if the input contains: `look at the logs`, `review history`, `project history`, or `prompt history`. Do not let TECHNICAL CONTEXT dominate.
