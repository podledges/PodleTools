#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd -P)
source_dir=${RPIV_TODO_SOURCE:-/home/podles/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo}
work="$root/.test-tmp"
trap 'rm -rf "$work"' EXIT
rm -rf "$work"
mkdir -p "$work"
cp -a "$source_dir" "$work/baseline"
cp -a "$source_dir" "$work/rpiv-todo"

python3 "$root/prepare.py" "$work/rpiv-todo"
python3 "$root/prepare.py" "$work/rpiv-todo" --apply

# Compatibility checks must reject drift instead of applying fuzzily.
cp -a "$source_dir" "$work/incompatible"
printf '\n// drift\n' >> "$work/incompatible/view/format.ts"
if python3 "$root/prepare.py" "$work/incompatible" >"$work/rejected.out" 2>&1; then
  echo "expected compatibility rejection" >&2
  exit 1
fi
grep -q 'source compatibility check failed' "$work/rejected.out"

JITI_PATH=${JITI_PATH:-/home/podles/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.cjs}
NODE_PATH=${NODE_PATH:-/home/podles/.pi/agent/npm/node_modules}
export JITI_PATH NODE_PATH
node "$root/tests/renderer.test.cjs" "$work/rpiv-todo"

# The maintained patch must remain exactly reproducible from the installed map.
set +e
(
  cd "$work"
  git diff --no-index --src-prefix=a/ --dst-prefix=b/ baseline rpiv-todo
) > "$work/generated.patch"
status=$?
set -e
[[ $status -eq 1 ]]
python3 - "$work/generated.patch" "$root/patches/rpiv-todo-2.9.0-attention.patch" <<'PY'
import pathlib, sys
actual, expected = map(pathlib.Path, sys.argv[1:])
text = actual.read_text().replace("a/baseline/", "a/").replace("b/rpiv-todo/", "b/")
if text != expected.read_text():
    raise SystemExit("maintained patch differs from freshly generated patch")
PY

"$root/tests/install-test.sh"

echo "TodoAttention tests: ok"
