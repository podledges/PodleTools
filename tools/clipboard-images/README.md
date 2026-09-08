# Clipboard images (NixOS/Pi side)

This folder holds NixOS/Pi helpers that talk about Windows clipboard images **after** they are already files, plus the Pi-owned Alt+V screenshot extension. Nothing here reads the live clipboard itself, writes the clipboard, scans `Screenshots2`, starts a listener, or restores WezTerm keybindings.

## `paste-capture`

`paste_capture.py` is the WSL wrapper for the independently implemented Windows script [`PodleWindOS/tools/clipboard-images/Capture-CurrentClipboardImage.ps1`](https://github.com/podledges/PodleWindOS/tree/main/tools/clipboard-images). The Pi extension invokes the deployed `/init`-safe wrapper at `/home/podles/.local/share/paste-linker/bin/paste-capture` with argv; it does not reimplement capture.

On success it prints **one** JSON object and a newline:

```json
{"schema":1,"kind":"image","label":"Screenshot Pasted","path":"/mnt/c/Users/ayden/AppData/Local/PodlePaste/staging/<unique>.png","sha256":"<64 hex>","windows_path":"C:\\Users\\ayden\\AppData\\Local\\PodlePaste\\staging\\<unique>.png"}
```

`path` is the absolute WSL path of **that** unique staged PNG. The wrapper never substitutes `current.png`, never lists the staging directory, and never falls back to `latest`/`list`.

### Run (source checkout only)

```bash
tools/clipboard-images/bin/paste-capture \
  --script '/mnt/c/Users/ayden/AppData/Local/PodleWindOS/tools/clipboard-images/Capture-CurrentClipboardImage.ps1' \
  --staging-dir '/mnt/c/Users/ayden/AppData/Local/PodlePaste/staging'
```

- `--script` (required): absolute path to the Windows capture script (WSL `/mnt/<drive>/...` or `C:\...`). Relative paths are rejected.
- `--staging-dir` (optional): absolute WSL or Windows directory mapped to PowerShell `-DestinationDirectory`. Default is `LOCALAPPDATA/PodlePaste/staging`.
- `--powershell` (optional): absolute `powershell.exe`. Default is PATH / the WSL Windows PowerShell path.

The wrapper always execs `powershell.exe -NoProfile -STA -File <script> [-DestinationDirectory <staging>]` as an argv list (`shell=False`). Failures print a short message on stderr and exit nonzero, with **no** success JSON and **no** clipboard bytes.

Live hosts should keep the `/init`-safe wrapper in `/home/podles/.local/share/paste-linker/bin/paste-capture`. Do not replace that wrapper with this source `bin/paste-capture` helper.

### Validation

The Windows stdout must be exactly one JSON object `{schema:1,kind:"image",label:"Screenshot Pasted",path,sha256}` plus a newline. The wrapper then:

1. Maps the Windows drive path to WSL (`C:\...` → `/mnt/c/...`).
2. Rejects UNC, relative, wildcard, `..`, and out-of-root paths.
3. Requires a regular (non-symlink) readable file under the staging root.
4. Requires PNG magic bytes and a SHA-256 match for **that** file only.

### Explicit `latest` / `list` (unmerged PR 15 — not used here)

[`PodleTools#15`](https://github.com/podledges/PodleTools/pull/15) adds read-only `clipboard-images latest` and `list`. **Paste must not call them.**

## Pi extension (`pi-extension/`)

Pi 0.85.1 binds `app.clipboard.pasteImage` to Alt+V on Windows/WSL. That binding is **not** in Pi's reserved-conflict list, so `pi.registerShortcut("alt+v")` is consumed first and native `pasteImage` does not also run.

On explicit Alt+V:

1. Invoke `/home/podles/.local/share/paste-linker/bin/paste-capture --script <Capture-CurrentClipboardImage.ps1> --staging-dir <staging>`.
2. Re-validate the returned staged PNG (path inside staging root, hash, PNG magic, size).
3. Insert the comment-safe `#«pl1:...` marker into the editor. Widget: **staged, not sent**.
4. On user submit, the `input` transform attaches `ImageContent` bytes only when hash/magic/root match. Non-vision models stay link-only. No auto-send.

Ordinary text paste is unchanged. Typed filesystem paths are not attached. WezTerm is not involved.

Marker / staging / transform modules were copied from PodleDoubleO `origin/main` (`23bac691…`, `home/podles/pi/extensions/paste-linker/`) via `git archive`. See `pi-extension/PROVENANCE`.

### Test

Python tests mock the Windows process. Node tests use synthetic fixtures and an isolated Pi key-dispatch harness. They never open the live clipboard or mutate the user terminal.

```bash
python3 -m unittest discover -s tools/clipboard-images/tests -v
node --experimental-strip-types --test-concurrency=1 --test tools/clipboard-images/pi-extension/tests/*.test.ts
```

### Live install

`install-pi-extension.sh` copies the extension to `~/.local/share/podle-tools/clipboard-images/pi-extension` and atomically replaces only `~/.pi/agent/extensions/paste-linker` after verifying that symlink is user-owned. It does not `/reload` Pi, does not overwrite the paste-capture wrapper, and does not touch rpiv-todo or unrelated extensions.

## Counterpart ownership

| Layer | Owner | Role |
| --- | --- | --- |
| Windows current-clipboard PNG + JSON | PodleWindOS `Capture-CurrentClipboardImage.ps1` | STA capture, unique staging file, schema `1` |
| This wrapper | PodleTools `paste_capture.py` | argv invoke, WSL map, validate path/hash/PNG |
| Alt+V / draft insert / submit attach | PodleTools `pi-extension/` | consume Alt+V in Pi; call paste-capture |
| Listener autosave | PodleWindOS / live PodleShell | unchanged; paste does not use `Screenshots2` |

DoubleO docs/HM pointers are a later firstmate follow-up. Do not restore WezTerm Alt+V integration.
