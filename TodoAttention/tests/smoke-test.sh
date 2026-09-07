#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd -P)
source_dir=${RPIV_TODO_SOURCE:-/home/podles/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo}
pi_core=${PI_CORE_PACKAGE:-/home/podles/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent}
theme=${NEON_AFTERGLOW_THEME:-/home/podles/.pi/agent/themes/neon-afterglow.json}
scratch="$root/.smoke-tmp"
trap 'rm -rf "$scratch"' EXIT
rm -rf "$scratch"
mkdir -p "$scratch/agent" "$scratch/package/tests" "$scratch/package/node_modules/@juicesharp" "$scratch/package/node_modules/@earendil-works"
cp -a "$source_dir/." "$scratch/package/"
python3 "$root/prepare.py" "$scratch/package" --apply
cp "$root/tests/smoke-extension.ts" "$scratch/package/tests/"

# Recreate a complete package boundary without writing to the live installation.
ln -s "$(dirname "$source_dir")/rpiv-config" "$scratch/package/node_modules/@juicesharp/rpiv-config"
if [[ -e $(dirname "$source_dir")/rpiv-i18n ]]; then
  ln -s "$(dirname "$source_dir")/rpiv-i18n" "$scratch/package/node_modules/@juicesharp/rpiv-i18n"
fi
ln -s "$(dirname "$(dirname "$source_dir")")/typebox" "$scratch/package/node_modules/typebox"
ln -s "$pi_core" "$scratch/package/node_modules/@earendil-works/pi-coding-agent"
ln -s "$pi_core/node_modules/@earendil-works/pi-ai" "$scratch/package/node_modules/@earendil-works/pi-ai"
ln -s "$pi_core/node_modules/@earendil-works/pi-tui" "$scratch/package/node_modules/@earendil-works/pi-tui"
printf '{"defaultProjectTrust":"always"}\n' > "$scratch/agent/settings.json"

PI_CODING_AGENT_DIR="$scratch/agent" \
PI_CODING_AGENT_SESSION_DIR="$scratch/sessions" \
PI_TUI_WRITE_LOG="$scratch/tui.log" \
PI_OFFLINE=1 \
timeout 10 script -qefc \
  "pi --no-session --no-tools --no-extensions -e '$scratch/package/tests/smoke-extension.ts' -e '$scratch/package/index.ts' --no-skills --no-prompt-templates --no-context-files --no-themes --theme '$theme' --use-theme neon-afterglow --offline" \
  "$scratch/typescript" >/dev/null

python3 - "$scratch/tui.log" <<'PY'
import re, sys
from pathlib import Path
raw = Path(sys.argv[1]).read_bytes()
blue = b"\x1b[38;2;0;102;255m\xe2\x97\x8f\x1b[39m"
pink = b"\x1b[38;2;255;0;204m\xe2\x97\x8f\x1b[39m"
yellow = b"\x1b[38;2;255;255;0m\xe2\x97\x8f\x1b[39m"
for task_id, color in [(b"#1", yellow), (b"#2", blue), (b"#3", pink), (b"#4", yellow)]:
    if task_id + b"\x1b[39m " + color not in raw:
        raise SystemExit(f"missing colored indicator beside {task_id.decode()}")
text = re.sub(rb"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))", b"", raw)
for row in [
    b"\xe2\x97\x8f Todos (1/5)",
    b"#1 \xe2\x97\x8f Yellow waiting",
    b"#2 \xe2\x97\x8f Verified active",
    b"#3 \xe2\x97\x8f Captain decision",
    b"#4 \xe2\x97\x8f Blocked is yellow",
    b"#5 Completed keeps completion style",
]:
    if row not in text:
        raise SystemExit(f"missing TUI row: {row!r}")
if b"#5 \xe2\x97\x8f Completed keeps completion style" in text:
    raise SystemExit("completed row unexpectedly has an attention indicator")
print("isolated Pi TUI smoke: ok")
PY
