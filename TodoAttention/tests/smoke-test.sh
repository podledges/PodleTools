#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd -P)
source_dir=${RPIV_TODO_SOURCE:-/home/podles/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo}
pi_core=${PI_CORE_PACKAGE:-/home/podles/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent}
theme=${NEON_AFTERGLOW_THEME:-/home/podles/.pi/agent/themes/neon-afterglow.json}
scratch="$root/.smoke-tmp"
trap 'rm -rf "$scratch"' EXIT
rm -rf "$scratch"
mkdir -p "$scratch/agent" "$scratch/home" "$scratch/config/rpiv-todo" "$scratch/package/tests" "$scratch/package/node_modules/@juicesharp" "$scratch/package/node_modules/@earendil-works"
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

for mode in animated static; do
  reduced=false
  [[ $mode != static ]] || reduced=true
  printf '{"reducedMotion":%s}\n' "$reduced" > "$scratch/config/rpiv-todo/config.json"
  python3 "$root/tests/seed-session.py" "$scratch/session.jsonl"
  HOME="$scratch/home" XDG_CONFIG_HOME="$scratch/config" \
  PI_CODING_AGENT_DIR="$scratch/agent" \
  PI_CODING_AGENT_SESSION_DIR="$scratch/sessions" \
  PI_TUI_WRITE_LOG="$scratch/$mode-tui.log" \
  TODOATTENTION_CADENCE_FILE="$scratch/$mode-cadence.json" \
  PI_OFFLINE=1 \
  timeout 15 script -qefc \
    "pi --session '$scratch/session.jsonl' --no-tools --no-extensions -e '$scratch/package/tests/smoke-extension.ts' -e '$scratch/package/index.ts' --no-skills --no-prompt-templates --no-context-files --no-themes --theme '$theme' --use-theme neon-afterglow --offline" \
    "$scratch/$mode-typescript" >/dev/null
  python3 "$root/tests/assert-tui.py" "$scratch/$mode-tui.log" "$scratch/$mode-cadence.json" "$mode"
done
echo 'isolated Pi TUI smoke: ok'
