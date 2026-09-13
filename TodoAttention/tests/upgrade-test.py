#!/usr/bin/env python3
"""Exercise verified v1 -> v2 -> v3 -> v2 -> v1 -> npm."""
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
(agent / "sessions").mkdir()
session = agent / "sessions/task-state.jsonl"
session.write_bytes(b'{"metadata":{"keep":true},"blockedBy":[2],"nextId":7}\n')
session_before = session.read_bytes()
manifest_path = agent / "todoattention/install-manifest.json"


git_apply = prepare.git_apply

def install_old(name, patch_path):
    def apply_selected(source_path, check, reverse=False, patch=patch_path):
        return git_apply(source_path, check, reverse, patch)
    with patch.object(install, "RELEASE_NAME", name), patch.object(prepare, "git_apply", side_effect=apply_selected):
        install.install(source, agent, False)


v1_name = "rpiv-todo-2.9.0-attention-v1"
v2_name = "rpiv-todo-2.9.0-attention-v2"
v1_patch = install.LEGACY_RELEASES[v1_name]
v2_patch = install.LEGACY_RELEASES[v2_name]
install_old(v1_name, v1_patch)
v1_manifest = json.loads(manifest_path.read_text())
v1 = Path(v1_manifest["installedSource"])
install_old(v2_name, v2_patch)
v2_manifest = json.loads(manifest_path.read_text())
v2 = Path(v2_manifest["installedSource"])
assert v2_manifest["previousManifest"] == v1_manifest
v2_files = {str(p.relative_to(v2)): p.read_bytes() for p in v2.rglob("*") if p.is_file()}
v2_settings = settings_path.read_bytes()
v2_manifest_bytes = manifest_path.read_bytes()
v3 = v2.with_name(install.RELEASE_NAME)

install.install(source, agent, True)
assert settings_path.read_bytes() == v2_settings
assert manifest_path.read_bytes() == v2_manifest_bytes
assert not v3.exists()

# Refuse drift in the currently installed older release without touching config.
v2_format = v2 / "view/format.ts"
content = v2_format.read_bytes()
v2_format.write_bytes(content.replace(b'"captain-input"', b'"drift-input"'))
try:
    print("expecting v2 compatibility refusal for deliberately corrupted source", flush=True)
    try:
        install.install(source, agent, True)
    except subprocess.CalledProcessError:
        pass
    else:
        raise AssertionError("expected v2 compatibility rejection")
finally:
    v2_format.write_bytes(content)
assert settings_path.read_bytes() == v2_settings and not v3.exists()

# Fail exactly at v3 manifest publication after settings publication.
atomic_json = install.atomic_json
failed = False
def fail_manifest_once(path, value):
    global failed
    if path == manifest_path and value.get("installedSource") == str(v3) and not failed:
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
assert json.loads(settings_path.read_text()) == json.loads(v2_settings)
assert json.loads(manifest_path.read_text()) == v2_manifest
assert not v3.exists()

install.install(source, agent, False)
install.install(source, agent, True)
settings = json.loads(settings_path.read_text())
assert settings["packages"] == ["/unrelated", {**original_entry, "source": str(v3)}]
settings["addedAfterUpgrade"] = 42
settings_path.write_text(json.dumps(settings))
assert v2_files == {str(p.relative_to(v2)): p.read_bytes() for p in v2.rglob("*") if p.is_file()}
assert json.loads(manifest_path.read_text())["previousManifest"] == v2_manifest

# Every rollback preserves unrelated post-upgrade settings and restores one level.
for expected_removed, expected_source, expected_manifest in [
    (v3, v2, v2_manifest),
    (v2, v1, v1_manifest),
]:
    install.rollback(agent, True)
    assert expected_removed.exists()
    install.rollback(agent, False)
    assert not expected_removed.exists() and expected_source.exists()
    restored = json.loads(settings_path.read_text())
    assert restored["packages"] == ["/unrelated", {**original_entry, "source": str(expected_source)}]
    assert restored["addedAfterUpgrade"] == 42
    assert json.loads(manifest_path.read_text()) == expected_manifest

install.rollback(agent, True)
install.rollback(agent, False)
assert not v1.exists() and not manifest_path.exists()
assert json.loads(settings_path.read_text()) == {**original, "addedAfterUpgrade": 42}
assert session.read_bytes() == session_before
print("isolated v1/v2 upgrade/rollback/task preservation: ok")
