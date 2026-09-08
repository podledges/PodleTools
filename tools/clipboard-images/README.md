# Clipboard images (NixOS/Pi side)

This folder contains separate, opt-in NixOS/Pi workflows for Windows clipboard images:

- `clipboard-images latest` / `list` selects paths from an autosave folder only when a user or agent explicitly asks.
- `paste-capture` invokes and validates one current-clipboard capture in an isolated staging folder.
- `pi-extension/` consumes Alt+V in Pi, stages that capture, and attaches image bytes only on user submit to a vision model.

Nothing starts a listener, writes the clipboard, restores WezTerm keybindings, or automatically sends an image. Installation is a separate current-user step. `paste-capture` and the Pi extension never scan `Screenshots2` or fall back to `latest` or `list`.

## Explicit `latest` / `list`

The dependency-free `clipboard-images` CLI prints absolute paths to PNG files saved by a Windows-side producer. It does not access the clipboard or inspect image contents. Any PNG producer can populate the configured folder; there is no mandatory dependency-manager framework or code dependency between repositories.

The default shared folder is:

- Windows: `C:\Users\ayden\Pictures\Screenshots2`
- NixOS/WSL: `/mnt/c/Users/ayden/Pictures/Screenshots2`

The Windows listener counterpart belongs in [`PodleWindOS/tools/clipboard-images`](https://github.com/podledges/PodleWindOS/tree/main/tools/clipboard-images). The current filename convention is `clipboard-yyyyMMdd-HHmmss-fff.png`, with `-001`, `-002`, and so on added on timestamp collisions. Selection uses file modification time rather than parsing that name. Newest modification time wins; ties are ordered by filename so results are deterministic.

### Usage

From the PodleTools repository:

```bash
# Print the newest PNG path.
tools/clipboard-images/bin/clipboard-images latest

# Print up to 10 PNG paths, newest first.
tools/clipboard-images/bin/clipboard-images list

# Select from another producer/folder and change the list size.
tools/clipboard-images/bin/clipboard-images \
  --folder '/path/with spaces/screenshots' list --limit 5
```

Output paths are absolute and suitable for an agent's image read tool. Paths containing spaces are preserved. A missing folder, a non-folder path, or a folder without PNG files produces a clear error on stderr and exits nonzero.

No installation or third-party package is needed; the CLI uses Python 3's standard library and can run directly from this checkout.

### Agent handoff

1. Copy a screenshot or image on Windows so the autosave listener saves a PNG.
2. Tell the agent: **“read latest screenshot.”**
3. The agent explicitly runs `tools/clipboard-images/bin/clipboard-images latest`.
4. The agent passes the single returned absolute path to its image read tool.

Plain clipboard paste is not fixed by autosaving. Saving only creates a file handoff; no automatic model ingestion occurs.

## `paste-capture`

`paste_capture.py` is the WSL wrapper for the independently implemented Windows script [`PodleWindOS/tools/clipboard-images/Capture-CurrentClipboardImage.ps1`](https://github.com/podledges/PodleWindOS/tree/main/tools/clipboard-images). The Pi extension invokes the deployed `/init`-safe wrapper at `/home/podles/.local/share/paste-linker/bin/paste-capture` with argv; it does not reimplement capture.

On success it prints **one** JSON object and a newline:

```json
{"schema":1,"kind":"image","label":"Screenshot Pasted","path":"/mnt/c/Users/ayden/AppData/Local/PodlePaste/staging/<unique>.png","sha256":"<64 hex>","windows_path":"C:\\Users\\ayden\\AppData\\Local\\PodlePaste\\staging\\<unique>.png"}
```

`path` is the absolute WSL path of **that** unique staged PNG. The wrapper never substitutes `current.png`, never lists the staging directory, and never imports or calls `clipboard_images.py`.

### Run (source checkout only)

Running this source helper does not install a package, deploy to PATH, or change live WezTerm/Pi/Windows settings or listeners.

```bash
tools/clipboard-images/bin/paste-capture \
  --script '/mnt/c/Users/ayden/AppData/Local/PodlePaste/deploy/Capture-CurrentClipboardImage.ps1' \
  --staging-dir '/mnt/c/Users/ayden/AppData/Local/PodlePaste/staging'
```

- `--script` (required): absolute path to the Windows capture script (WSL `/mnt/<drive>/...` or `C:\...`). Relative paths are rejected.
- `--staging-dir` (optional): absolute WSL or Windows directory mapped to PowerShell `-DestinationDirectory`. Default is `LOCALAPPDATA/PodlePaste/staging`.
- `--powershell` (optional): absolute `powershell.exe`. Default is PATH / the WSL Windows PowerShell path.

The wrapper always execs `powershell.exe -NoProfile -NoLogo -STA -File <script> [-DestinationDirectory <staging>]` as an argv list (`shell=False`). Failures print a short message on stderr and exit nonzero, with **no** success JSON and **no** clipboard bytes. PowerShell metadata JSON may use CRLF; the parser still requires exactly one JSON object and one newline (LF or CRLF). Copyright banners and extra lines are rejected. The Pi extension default `--script` is the live `PodlePaste/deploy` copy, not the missing `PodleWindOS` tree.

Live hosts should keep the `/init`-safe wrapper in `/home/podles/.local/share/paste-linker/bin/paste-capture`. Do not replace that wrapper with this source `bin/paste-capture` helper.

### Validation

The Windows stdout must be exactly one JSON object `{schema:1,kind:"image",label:"Screenshot Pasted",path,sha256}` plus a newline. The wrapper then:

1. Maps the Windows drive path to WSL (`C:\...` → `/mnt/c/...`).
2. Rejects UNC, relative, wildcard, `..`, and out-of-root paths.
3. Requires a regular (non-symlink) readable file under the staging root.
4. Requires PNG magic bytes and a SHA-256 match for **that** file only.

A hash that belongs to a different file in the same directory is still a failure.

### Staging retention

Capture publishes immutable uniquely named PNGs. This wrapper does not delete, overwrite, or age them. Review and remove staged files manually when you no longer need a draft.

## Pi extension (`pi-extension/`)

Pi 0.85.1 binds `app.clipboard.pasteImage` to Alt+V on Windows/WSL. That binding is **not** in Pi's reserved-conflict list, so `pi.registerShortcut("alt+v")` is consumed first and native `pasteImage` does not also run. `ctrl+alt+v` is registered as the same handler.

On explicit Alt+V (or Ctrl+Alt+V):

1. Invoke `/home/podles/.local/share/paste-linker/bin/paste-capture --script <Capture-CurrentClipboardImage.ps1> --staging-dir <staging>`.
2. Re-validate the returned staged PNG (path inside staging root, hash, PNG magic, size).
3. Insert the comment-safe `#«pl1:...` marker into the editor. Widget: **staged, not sent**.
4. On user submit, the `input` transform attaches `ImageContent` bytes only when hash/magic/root match. Non-vision models stay link-only. No auto-send.

Ordinary text paste is unchanged. Typed filesystem paths are not attached. WezTerm is not involved.

Marker / staging / transform modules were copied from PodleDoubleO `origin/main` (`23bac691…`, `home/podles/pi/extensions/paste-linker/`) via `git archive`. See `pi-extension/PROVENANCE`.

### Live install

`install-pi-extension.sh` copies the extension to `~/.local/share/podle-tools/clipboard-images/pi-extension` and atomically replaces only `~/.pi/agent/extensions/paste-linker` after verifying that symlink is user-owned. It does not `/reload` Pi, does not overwrite the paste-capture wrapper, and does not touch rpiv-todo or unrelated extensions.

## Counterpart ownership

| Layer | Owner | Role |
| --- | --- | --- |
| Windows current-clipboard PNG + JSON | PodleWindOS `Capture-CurrentClipboardImage.ps1` | STA capture, unique staging file, schema `1` |
| This paste wrapper | PodleTools `paste_capture.py` | argv invoke, WSL map, validate path/hash/PNG |
| Explicit autosave path lookup | PodleTools `clipboard_images.py` | user-requested `Screenshots2` latest/list only |
| Alt+V / draft insert / submit attach | PodleTools `pi-extension/` | consume Alt+V in Pi; call paste-capture |
| Listener autosave | PodleWindOS / temporarily live PodleShell | unchanged; paste does not use `Screenshots2` |

There is no Python/package dependency between repositories. Configure `--script` to wherever the Windows script actually lives. Do not add a circular checkout dependency.

Windows listener cutover, Pi extension install, and old PodleShell source cleanup are separate deployment steps. DoubleO docs/HM pointers are a later firstmate follow-up. Do not restore WezTerm Alt+V integration.

## Test

Python tests use synthetic temporary files and mocked Windows process output. Node tests use synthetic fixtures and an isolated Pi key-dispatch harness. They never open the live clipboard, touch the real `Screenshots2`, invoke a real `Capture-CurrentClipboardImage.ps1`, or mutate the user terminal.

```bash
python3 -m unittest discover -s tools/clipboard-images/tests -v
node --experimental-strip-types --test-concurrency=1 --test tools/clipboard-images/pi-extension/tests/*.test.ts
```
