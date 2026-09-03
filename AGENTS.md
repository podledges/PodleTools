# PodleTools agent guide

PodleTools is a repository of custom individual tools. Keep each tool in its own top-level folder and package it separately so it remains decoupled from the other tools.

Tools may connect to one another later, but each folder is still its own tool. Do not turn the repository into one shared application or introduce an implicit cross-tool dependency.

Document strict dependencies on other PodleTools or third-party applications in that tool's README (for example, `BotTrust/README.md`). Record package requirements in that tool's own `requirements.txt`, not in a repository-wide requirements file.

## Maintaining this file

Keep this file limited to durable guidance useful to almost every future session. Prefer pointers to authoritative tool documentation over duplicating details here, and update it when repository-wide conventions change.
