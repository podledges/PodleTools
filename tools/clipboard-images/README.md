# Clipboard images (NixOS/Pi side)

This folder holds NixOS/Pi helpers that talk about Windows clipboard images **after** they are already files. Nothing here reads the live clipboard, writes the clipboard, scans `Screenshots2`, starts a listener, or deploys globally.

## `paste-capture` (this PR — Stage 1 screenshot paste)

`paste_capture.py` is the WSL wrapper for the independently implemented Windows script [`PodleWindOS/tools/clipboard-images/Capture-CurrentClipboardImage.ps1`](https://github.com/podledges/PodleWindOS/tree/main/tools/clipboard-images). DoubleO should invoke this CLI with safe argv through `wsl.exe`; it should not reimplement capture or path mapping in Lua.

On success it prints **one** JSON object and a newline:

```json
{"schema":1,"kind":"image","label":"Screenshot Pasted","path":"/mnt/c/Users/ayden/AppData/Local/PodlePaste/staging/<unique>.png","sha256":"<64 hex>","windows_path":"C:\\Users\\ayden\\AppData\\Local\\PodlePaste\\staging\\<unique>.png"}
```

`path` is the absolute WSL path of **that** unique staged PNG. The wrapper never substitutes `current.png`, never lists the staging directory, and never falls back to `latest`/`list`.

### Run (source checkout only)

No package install, no PATH deploy, no live WezTerm/Pi/Windows settings change.

```bash
tools/clipboard-images/bin/paste-capture \
  --script '/mnt/c/Users/ayden/AppData/Local/PodleWindOS/tools/clipboard-images/Capture-CurrentClipboardImage.ps1' \
  --staging-dir '/mnt/c/Users/ayden/AppData/Local/PodlePaste/staging'
```

- `--script` (required): absolute path to the Windows capture script (WSL `/mnt/<drive>/...` or `C:\...`). Relative paths are rejected.
- `--staging-dir` (optional): absolute WSL or Windows directory mapped to PowerShell `-DestinationDirectory`. Default is the Windows script default `LOCALAPPDATA/PodlePaste/staging` (`C:\Users\ayden\AppData\Local\PodlePaste\staging` in this setup). This is the only allowed artifact root.
- `--powershell` (optional): absolute `powershell.exe`. Default is PATH / the WSL Windows PowerShell path.

The wrapper always execs:

```text
powershell.exe -NoProfile -STA -File <script> [-DestinationDirectory <staging>]
```

as an argv list (`shell=False`). Failures print a short message on stderr and exit nonzero, with **no** success JSON and **no** clipboard bytes.

### Validation

The Windows stdout must be exactly one JSON object `{schema:1,kind:"image",label:"Screenshot Pasted",path,sha256}` plus a newline. The wrapper then:

1. Maps the Windows drive path to WSL (`C:\...` → `/mnt/c/...`).
2. Rejects UNC, relative, wildcard, `..`, and out-of-root paths.
3. Requires a regular (non-symlink) readable file under the staging root.
4. Requires PNG magic bytes and a SHA-256 match for **that** file only.

A hash that belongs to a different file in the same directory is still a failure.

### Staging retention

Capture publishes immutable uniquely named PNGs. This wrapper does not delete, overwrite, or age them. Review and remove staged files manually when you no longer need a draft.

### Explicit `latest` / `list` (unmerged PR 15 — not used here)

[`PodleTools#15`](https://github.com/podledges/PodleTools/pull/15) adds read-only `clipboard-images latest` and `list` for an **explicit** “read the latest screenshot” request against `Screenshots2`. Those utilities stay on that unmerged PR. **Paste must not call them** and this wrapper does not copy, import, or merge that PR.

## Counterpart ownership

| Layer | Owner | Role |
| --- | --- | --- |
| Windows current-clipboard PNG + JSON | PodleWindOS `Capture-CurrentClipboardImage.ps1` | STA capture, unique staging file, schema `1` |
| This wrapper | PodleTools `paste_capture.py` | argv invoke, WSL map, validate path/hash/PNG |
| Alt+V / draft insert / submit attach | PodleDoubleO | consumes this CLI; no capture reimplementation |
| Listener autosave | PodleWindOS PR 8 / live PodleShell | unchanged; paste does not use `Screenshots2` |

There is no Python/package dependency between repositories. Configure `--script` to wherever the Windows script actually lives. Do not add a circular checkout dependency.

Windows listener cutover, WezTerm live config, and Pi extension install are **separate** deployment steps. This directory is source plus tests only.

## Test

Tests mock the Windows process. They never open the clipboard, never touch `Screenshots2`, and never call a real `Capture-CurrentClipboardImage.ps1`.

```bash
python3 -m unittest discover -s tools/clipboard-images/tests -v
```
