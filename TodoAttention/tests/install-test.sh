#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd -P)
source_dir=${RPIV_TODO_SOURCE:-/home/podles/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo}
theme=${NEON_AFTERGLOW_THEME:-/home/podles/.pi/agent/themes/neon-afterglow.json}
scratch="$root/.install-tmp"
trap 'rm -rf "$scratch"' EXIT
rm -rf "$scratch"
mkdir -p "$scratch/agent"
cat > "$scratch/agent/settings.json" <<'JSON'
{
  "theme": "unchanged-theme-setting",
  "customSentinel": {"keep": true},
  "packages": ["npm:@juicesharp/rpiv-todo"]
}
JSON
cp "$scratch/agent/settings.json" "$scratch/original-settings.json"
source_hash=$(sha256sum "$source_dir/view/format.ts")

# Check/dry-run performs compatibility and patch checks without changing
# settings or leaving a managed release behind.
python3 "$root/install.py" check --source "$source_dir" --agent-dir "$scratch/agent"
cmp "$scratch/original-settings.json" "$scratch/agent/settings.json"
[[ ! -e "$scratch/agent/todoattention" ]]

# Ambiguous configuration fails before creating a release or changing settings.
mkdir -p "$scratch/rejected-agent"
printf '{"sentinel":true,"packages":["npm:@juicesharp/rpiv-todo","npm:@juicesharp/rpiv-todo@2.9.0"]}\n' > "$scratch/rejected-agent/settings.json"
cp "$scratch/rejected-agent/settings.json" "$scratch/rejected-before.json"
if python3 "$root/install.py" install --source "$source_dir" --agent-dir "$scratch/rejected-agent" >"$scratch/rejected.out" 2>&1; then
  echo "expected duplicate-package rejection" >&2
  exit 1
fi
grep -q 'found 2' "$scratch/rejected.out"
cmp "$scratch/rejected-before.json" "$scratch/rejected-agent/settings.json"
[[ ! -e "$scratch/rejected-agent/todoattention/releases/rpiv-todo-2.9.0-attention-v2" ]]

python3 "$root/install.py" install --source "$source_dir" --agent-dir "$scratch/agent"
release="$scratch/agent/todoattention/releases/rpiv-todo-2.9.0-attention-v2"
[[ -f "$release/index.ts" ]]
[[ -f "$release/node_modules/@juicesharp/rpiv-config/package.json" ]]
[[ -f "$release/node_modules/typebox/package.json" ]]
[[ "$source_hash" == "$(sha256sum "$source_dir/view/format.ts")" ]]
python3 - "$scratch/agent/settings.json" "$release" <<'PY'
import json, pathlib, sys
settings = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert settings["theme"] == "unchanged-theme-setting"
assert settings["customSentinel"] == {"keep": True}
assert settings["packages"] == [str(pathlib.Path(sys.argv[2]).resolve())]
PY
PI_CODING_AGENT_DIR="$scratch/agent" PI_OFFLINE=1 pi list > "$scratch/list.out"
grep -Fq "$release" "$scratch/list.out"
[[ $(grep -Fxc "  $release" "$scratch/list.out") -eq 1 ]]
if grep -Fq "npm:@juicesharp/rpiv-todo" "$scratch/list.out"; then
  echo "upstream package still configured alongside managed release" >&2
  exit 1
fi

# Exercise the configured package through actual Pi discovery, not an explicit
# index.ts path. The helper only observes cadence and shuts Pi down; the actual
# owner replays synthetic session data and is the sole widget registrar.
mkdir -p "$release/tests"
cp "$root/tests/smoke-extension.ts" "$release/tests/"
printf '{"defaultProjectTrust":"always","packages":["%s"]}\n' "$release" > "$scratch/agent/settings.json"
mkdir -p "$scratch/home" "$scratch/config"
python3 "$root/tests/seed-session.py" "$scratch/session.jsonl"
HOME="$scratch/home" XDG_CONFIG_HOME="$scratch/config" \
PI_CODING_AGENT_DIR="$scratch/agent" \
PI_CODING_AGENT_SESSION_DIR="$scratch/sessions" \
PI_TUI_WRITE_LOG="$scratch/tui.log" \
TODOATTENTION_CADENCE_FILE="$scratch/cadence.json" \
PI_OFFLINE=1 \
timeout 15 script -qefc \
  "pi --session '$scratch/session.jsonl' --no-tools -e '$release/tests/smoke-extension.ts' --no-skills --no-prompt-templates --no-context-files --no-themes --theme '$theme' --use-theme neon-afterglow --offline" \
  "$scratch/typescript" >/dev/null
python3 "$root/tests/assert-tui.py" "$scratch/tui.log" "$scratch/cadence.json"

# Restore the install-generated settings, then prove rollback preserves an
# unrelated setting added after installation while restoring the one todo source.
python3 - "$scratch/agent/settings.json" "$release" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
value = json.loads(path.read_text())
value["theme"] = "unchanged-theme-setting"
value["customSentinel"] = {"keep": True}
value["addedAfterInstall"] = 42
value["packages"] = [str(pathlib.Path(sys.argv[2]).resolve())]
path.write_text(json.dumps(value, indent=2) + "\n")
PY
cp "$scratch/agent/settings.json" "$scratch/before-rollback.json"
python3 "$root/install.py" rollback --agent-dir "$scratch/agent" --dry-run
cmp "$scratch/before-rollback.json" "$scratch/agent/settings.json"
python3 "$root/install.py" rollback --agent-dir "$scratch/agent"
[[ ! -e "$release" ]]
python3 - "$scratch/agent/settings.json" <<'PY'
import json, pathlib, sys
settings = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert settings["theme"] == "unchanged-theme-setting"
assert settings["customSentinel"] == {"keep": True}
assert settings["addedAfterInstall"] == 42
assert settings["packages"] == ["npm:@juicesharp/rpiv-todo"]
PY
[[ "$source_hash" == "$(sha256sum "$source_dir/view/format.ts")" ]]

echo "TodoAttention install/rollback: ok"
