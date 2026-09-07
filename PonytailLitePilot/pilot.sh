#!/usr/bin/env bash
set -euo pipefail

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PINS="$ROOT/pins.json"
STATE="$ROOT/.pilot"
SPEC='@dietrichgebert/ponytail@4.9.0'

usage() {
  echo "usage: $0 prepare|check|launch|remove" >&2
  exit 2
}

pilot_env() {
  local state=$1
  shift
  env -i \
    PATH="$PATH" \
    HOME="$state/home" \
    XDG_CONFIG_HOME="$state/xdg" \
    PI_CODING_AGENT_DIR="$state/pi-agent" \
    PI_CODING_AGENT_SESSION_DIR="$state/sessions" \
    PI_OFFLINE=1 \
    PONYTAIL_DEFAULT_MODE=lite \
    PONYTAIL_QUIET_STARTUP=1 \
    PONYTAIL_HIDE_STATUS=1 \
    PONYTAIL_FIXTURE_LOG="${PONYTAIL_FIXTURE_LOG:-}" \
    "$@"
}

prepare_at() {
  local state=$1
  [ ! -e "$state" ] || { echo "state already exists: $state" >&2; exit 1; }
  mkdir -p "$state"/{downloads,npm-cache,home,xdg,pi-agent,sessions,source,work}
  printf '{\n  "quietStartup": true\n}\n' > "$state/pi-agent/settings.json"
  cp "$state/pi-agent/settings.json" "$state/settings.before.json"

  npm_config_cache="$state/npm-cache" npm pack "$SPEC" --ignore-scripts --pack-destination "$state/downloads" --silent >/dev/null
  local archive
  archive=$(find "$state/downloads" -maxdepth 1 -name '*.tgz' -print -quit)
  local expected actual
  expected=$(node -e 'process.stdout.write(require(process.argv[1]).tarball_sha256)' "$PINS")
  actual=$(sha256sum "$archive" | cut -d' ' -f1)
  [ "$actual" = "$expected" ] || { echo "tarball checksum mismatch" >&2; exit 1; }

  tar -xzf "$archive" -C "$state/source" --no-same-owner
  node - "$PINS" "$state/source" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const [pinsPath, source] = process.argv.slice(2);
const pins = JSON.parse(fs.readFileSync(pinsPath, 'utf8'));
for (const [relative, expected] of Object.entries(pins.inspected_files)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(`${source}/${relative}`)).digest('hex');
  if (actual !== expected) throw new Error(`inspected file checksum mismatch: ${relative}`);
}
const manifest = JSON.parse(fs.readFileSync(`${source}/package/package.json`, 'utf8'));
if (manifest.name !== pins.package || manifest.version !== pins.version) throw new Error('package identity mismatch');
if (JSON.stringify(manifest.pi) !== JSON.stringify({extensions:['./pi-extension/index.js'],skills:['./skills']})) throw new Error('Pi manifest changed');
for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bin']) {
  if (manifest[key] !== undefined) throw new Error(`unexpected manifest field: ${key}`);
}
NODE

  pilot_env "$state" pi install "$state/source/package" >/dev/null
}

case "${1:-}" in
  prepare)
    prepare_at "$STATE"
    echo "Prepared isolated lite pilot at $STATE"
    ;;
  check)
    CHECK="$ROOT/.pilot-check"
    rm -rf "$CHECK"
    trap 'rm -rf "$CHECK"' EXIT
    prepare_at "$CHECK"
    # Offline provider + event logger: exercises a real turn without credentials or network.
    pilot_env "$CHECK" pi install "$ROOT/test-fixture-extension.js" >/dev/null

    pilot_env "$CHECK" npm test --prefix "$CHECK/source/package/pi-extension" >/dev/null

    # Actual Pi discovery: package extension commands and bundled skills.
    printf '%s\n' '{"type":"get_commands"}' | pilot_env "$CHECK" timeout 20s pi --mode rpc --no-session --no-context-files > "$CHECK/commands.jsonl"
    for command in ponytail ponytail-review ponytail-audit ponytail-debt ponytail-gain ponytail-help skill:ponytail; do
      grep -q "\"name\":\"$command\"" "$CHECK/commands.jsonl" || { echo "missing Pi command: $command" >&2; exit 1; }
    done

    # Drive real model turns. The provider log observes the final chained system prompt.
    PONYTAIL_FIXTURE_LOG="$CHECK/lite.jsonl" pilot_env "$CHECK" sh -c \
      "printf '%s\\n' '{\"type\":\"prompt\",\"message\":\"/ponytail lite\"}' '{\"type\":\"prompt\",\"message\":\"Implement a bounded TTL cache for one pure function.\"}' | timeout 20s pi --mode rpc --no-session --no-context-files --provider ponytail-fixture --model echo > '$CHECK/lite-rpc.jsonl'"
    node - "$CHECK/lite.jsonl" "$CHECK/lite-rpc.jsonl" <<'NODE'
const fs = require('node:fs');
const events = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map(JSON.parse);
const rpc = fs.readFileSync(process.argv[3], 'utf8').trim().split('\n').map(JSON.parse);
if (!events.some((x) => x.event === 'before_agent_start')) throw new Error('before_agent_start did not fire');
if (!events.some((x) => x.event === 'context')) throw new Error('context did not fire');
if (!events.some((x) => x.event === 'provider' && x.mode === 'lite')) throw new Error('final provider prompt was not lite');
if (!rpc.some((x) => x.type === 'agent_settled')) throw new Error('RPC model turn did not settle');
NODE

    PONYTAIL_FIXTURE_LOG="$CHECK/off.jsonl" pilot_env "$CHECK" sh -c \
      "printf '%s\\n' '{\"type\":\"prompt\",\"message\":\"/ponytail off\"}' '{\"type\":\"prompt\",\"message\":\"Implement a bounded TTL cache for one pure function.\"}' | timeout 20s pi --mode rpc --no-session --no-context-files --provider ponytail-fixture --model echo > '$CHECK/off-rpc.jsonl'"
    node -e 'const xs=require("node:fs").readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); if(!xs.some(x=>x.event==="provider"&&x.mode==="off")) throw new Error("final provider prompt was not off")' "$CHECK/off.jsonl"

    pilot_env "$CHECK" pi remove "$ROOT/test-fixture-extension.js" >/dev/null
    pilot_env "$CHECK" pi remove "$CHECK/source/package" >/dev/null
    node -e 'const x=require(process.argv[1]); if(x.quietStartup!==true||!Array.isArray(x.packages)||x.packages.length||Object.keys(x).some(k=>!["quietStartup","packages"].includes(k))) throw new Error(JSON.stringify(x))' "$CHECK/pi-agent/settings.json"
    echo "PASS: pinned archive, upstream tests, actual Pi turn, lite injection, off switch, and settings-preserving removal"
    ;;
  launch)
    [ -f "$STATE/pi-agent/settings.json" ] || { echo "run '$0 prepare' first" >&2; exit 1; }
    shift
    mode=${PONYTAIL_PILOT_MODE:-lite}
    case "$mode" in lite|off) ;; *) echo "PONYTAIL_PILOT_MODE must be lite or off" >&2; exit 2 ;; esac
    cd "$STATE/work"
    HOME="$STATE/home" XDG_CONFIG_HOME="$STATE/xdg" \
      PI_CODING_AGENT_DIR="$STATE/pi-agent" PI_CODING_AGENT_SESSION_DIR="$STATE/sessions" \
      PI_OFFLINE=1 PONYTAIL_DEFAULT_MODE="$mode" PONYTAIL_QUIET_STARTUP=1 PONYTAIL_HIDE_STATUS=1 \
      exec pi --no-context-files "$@"
    ;;
  remove)
    if [ -f "$STATE/pi-agent/settings.json" ]; then
      pilot_env "$STATE" pi remove "$STATE/source/package" >/dev/null || true
    fi
    rm -rf "$STATE"
    echo "Removed isolated pilot state"
    ;;
  *) usage ;;
esac
