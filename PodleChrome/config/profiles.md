# Agent Chromium profiles

Local profile root:

```text
$HOME/.agent-browser/chromium-profiles
```

Configured profiles:

| Profile | Intended use | Account guidance |
| --- | --- | --- |
| `research` | General web research and low-risk logged-in sites | Use separate or low-risk accounts where possible. |
| `shopping` | Retail sites, order lookups, receipts, and price checks | Avoid saved payment methods unless intentionally allowed. |
| `finance-readonly` | Financial dashboards and invoice portals | Prefer read-only access. Do not use banking or irreversible admin access by default. |
| `testing` | Local web apps, staging sites, and disposable login flows | Safe place for temporary accounts and experiments. |

The actual browser data for these profiles is not stored in Git.
That data can include cookies, local storage, saved sessions, cache, extension data, browsing history, and other private state.

Use the tracked launcher instead:

```bash
PodleChrome/bin/agent-chromium research
PodleChrome/bin/agent-chromium testing http://localhost:3000
PodleChrome/bin/agent-chromium testing --debug-port 9222 http://localhost:3000
```

If the launcher is installed on your PATH, use:

```bash
agent-chromium research
```
