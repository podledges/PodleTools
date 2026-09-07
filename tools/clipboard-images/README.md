# Clipboard images (NixOS/Pi side)

This small, read-only CLI prints absolute paths to PNG files saved by a Windows-side image producer. It does not access the clipboard, inspect image contents, start a listener, upload anything, or send images to a model.

The paired Windows listener belongs in [`PodleWindOS/tools/clipboard-images`](https://github.com/podledges/PodleWindOS/tree/main/tools/clipboard-images). The dependency direction is Windows producer → shared folder → this NixOS/Pi path selector. There is no code dependency between the repositories: any PNG producer can populate the configured folder, and no dependency-manager framework is required.

The default shared folder is:

- Windows: `C:\Users\ayden\Pictures\Screenshots2`
- NixOS/WSL: `/mnt/c/Users/ayden/Pictures/Screenshots2`

The current Windows filename convention is `clipboard-yyyyMMdd-HHmmss-fff.png`, with `-001`, `-002`, and so on added on timestamp collisions. Selection uses file modification time rather than parsing that name. Newest modification time wins; ties are ordered by filename so results are deterministic.

## Usage

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

## Agent handoff

1. Copy a screenshot or image on Windows so the Windows listener saves a PNG.
2. Tell the agent: **“read latest screenshot.”**
3. The agent runs:

   ```bash
   tools/clipboard-images/bin/clipboard-images latest
   ```

4. The agent passes the single returned absolute path to its image read tool.

Plain clipboard paste is not fixed by autosaving. Saving only creates a file handoff; neither this helper nor the Windows producer automatically uploads or ingests that file into a model.

## Test

Tests use only synthetic temporary files and never access the default screenshot folder or clipboard:

```bash
python3 -m unittest discover -s tools/clipboard-images/tests -v
```

The original PodleShell source remains temporarily during the split. It should be cleaned up separately only after the PodleWindOS counterpart lands.
