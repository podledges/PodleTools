#!/usr/bin/env python3
"""Exercise verified v1 -> v2 -> v1 -> npm, including transaction failures."""
import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import install
import prepare

source, agent = (Path(arg).resolve() for arg in sys.argv[1:])
agent.mkdir(parents=True)
settings_path = agent / "settings.json"
original_entry = {"source": "npm:@juicesharp/rpiv-todo@2.9.0", "extensions": ["index.ts"]}
original = {"theme": "neon-afterglow", "keep": 17, "packages": ["/unrelated", original_entry]}
settings_path.write_text(json.dumps(original))
# Session/task bytes are sentinels: installer must never read/write these.
(agent / "sessions").mkdir()
session = agent / "sessions/task-state.jsonl"
session.write_bytes(b'{"metadata":{"keep":true},"blockedBy":[2],"nextId":7}\n')
session_before = session.read_bytes()
git_apply = prepare.git_apply
with patch.object(install, "RELEASE_NAME", install.LEGACY_RELEASE_NAME), patch.object(
    prepare, "git_apply", side_effect=lambda source, check, reverse=False: git_apply(source, check, reverse, install.LEGACY_PATCH)
):
    install.install(source, agent, False)
manifest_path = agent / "todoattention/install-manifest.json"
legacy_manifest = json.loads(manifest_path.read_text())
legacy = Path(legacy_manifest["installedSource"])
legacy_files = {str(p.relative_to(legacy)): p.read_bytes() for p in legacy.rglob("*") if p.is_file()}
v1_settings = settings_path.read_bytes()
v1_manifest = manifest_path.read_bytes()
v2 = legacy.with_name(install.RELEASE_NAME)

install.install(source, agent, True)
assert settings_path.read_bytes() == v1_settings
assert manifest_path.read_bytes() == v1_manifest
assert not v2.exists()

# Refuse drift in the retained release without touching configuration.
legacy_format = legacy / "view/format.ts"
content = legacy_format.read_bytes()
legacy_format.write_bytes(content.replace(b'"captain-input"', b'"drift-input"'))
try:
    print("expecting legacy compatibility refusal for deliberately corrupted source", flush=True)
    try:
        install.install(source, agent, True)
    except subprocess.CalledProcessError:
        pass
    else:
        raise AssertionError("expected legacy patch compatibility rejection")
finally:
    legacy_format.write_bytes(content)
assert settings_path.read_bytes() == v1_settings
assert not v2.exists()

# Fail exactly at manifest publication after staged v2 + settings publication.
atomic_json = install.atomic_json
failed = False
def fail_manifest_once(path, value):
    global failed
    if path == manifest_path and value.get("installedSource") == str(v2) and not failed:
        failed = True
        raise OSError("injected manifest write failure")
    atomic_json(path, value)
with patch.object(install, "atomic_json", side_effect=fail_manifest_once):
    try:
        install.install(source, agent, False)
    except OSError:
        pass
    else:
        raise AssertionError("expected transaction failure")
assert json.loads(settings_path.read_text()) == json.loads(v1_settings)
assert json.loads(manifest_path.read_text()) == legacy_manifest
assert not v2.exists()

install.install(source, agent, False)
install.install(source, agent, True)  # v2 idempotence
settings = json.loads(settings_path.read_text())
assert settings["packages"] == ["/unrelated", {**original_entry, "source": str(v2)}]
settings["addedAfterUpgrade"] = 42
settings_path.write_text(json.dumps(settings))
assert legacy_files == {str(p.relative_to(legacy)): p.read_bytes() for p in legacy.rglob("*") if p.is_file()}
assert json.loads(manifest_path.read_text())["previousManifest"] == legacy_manifest
install.rollback(agent, True)
assert json.loads(settings_path.read_text()) == settings
# If rollback's manifest restoration fails, keep v2, its settings and manifest.
v2_manifest = json.loads(manifest_path.read_text())
failed = False
def fail_rollback_once(path, value):
    global failed
    if path == manifest_path and value.get("installedSource") == str(legacy) and not failed:
        failed = True
        raise OSError("injected rollback manifest failure")
    atomic_json(path, value)
with patch.object(install, "atomic_json", side_effect=fail_rollback_once):
    try:
        install.rollback(agent, False)
    except OSError:
        pass
    else:
        raise AssertionError("expected rollback transaction failure")
assert v2.exists() and legacy.exists()
assert json.loads(settings_path.read_text()) == settings
assert json.loads(manifest_path.read_text()) == v2_manifest
install.rollback(agent, False)
assert not v2.exists() and legacy.exists()
restored = json.loads(settings_path.read_text())
assert restored["packages"] == json.loads(v1_settings)["packages"]
assert restored["addedAfterUpgrade"] == 42
assert json.loads(manifest_path.read_text()) == legacy_manifest
install.rollback(agent, True)
install.rollback(agent, False)
assert not legacy.exists() and not manifest_path.exists()
assert json.loads(settings_path.read_text()) == {**original, "addedAfterUpgrade": 42}
assert session.read_bytes() == session_before
print("isolated v1 upgrade/failure recovery/rollback/task preservation: ok")
