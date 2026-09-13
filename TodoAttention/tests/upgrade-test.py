#!/usr/bin/env python3
"""Exercise verified v1 -> v2 -> v3 -> v4 and stepwise rollback."""
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


legacy = []
previous_manifest = None
for name in [
    "rpiv-todo-2.9.0-attention-v1",
    "rpiv-todo-2.9.0-attention-v2",
    "rpiv-todo-2.9.0-attention-v3",
]:
    install_old(name, install.LEGACY_RELEASES[name])
    manifest = json.loads(manifest_path.read_text())
    release = Path(manifest["installedSource"])
    if previous_manifest is not None:
        assert manifest["previousManifest"] == previous_manifest
    legacy.append((release, manifest))
    previous_manifest = manifest

v3, v3_manifest = legacy[-1]
v3_files = {str(p.relative_to(v3)): p.read_bytes() for p in v3.rglob("*") if p.is_file()}
v3_settings = settings_path.read_bytes()
v3_manifest_bytes = manifest_path.read_bytes()
v4 = v3.with_name(install.RELEASE_NAME)

install.install(source, agent, True)
assert settings_path.read_bytes() == v3_settings
assert manifest_path.read_bytes() == v3_manifest_bytes
assert not v4.exists()

# Refuse drift in the currently installed older release without touching config.
v3_format = v3 / "view/format.ts"
content = v3_format.read_bytes()
v3_format.write_bytes(content.replace(b'"captain-input"', b'"drift-input"'))
try:
    print("expecting v3 compatibility refusal for deliberately corrupted source", flush=True)
    try:
        install.install(source, agent, True)
    except subprocess.CalledProcessError:
        pass
    else:
        raise AssertionError("expected v3 compatibility rejection")
finally:
    v3_format.write_bytes(content)
assert settings_path.read_bytes() == v3_settings and not v4.exists()

# Fail exactly at v4 manifest publication after settings publication.
atomic_json = install.atomic_json
failed = False
def fail_manifest_once(path, value):
    global failed
    if path == manifest_path and value.get("installedSource") == str(v4) and not failed:
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
assert json.loads(settings_path.read_text()) == json.loads(v3_settings)
assert json.loads(manifest_path.read_text()) == v3_manifest
assert not v4.exists()

install.install(source, agent, False)
install.install(source, agent, True)
settings = json.loads(settings_path.read_text())
assert settings["packages"] == ["/unrelated", {**original_entry, "source": str(v4)}]
settings["addedAfterUpgrade"] = 42
settings_path.write_text(json.dumps(settings))
assert v3_files == {str(p.relative_to(v3)): p.read_bytes() for p in v3.rglob("*") if p.is_file()}
assert json.loads(manifest_path.read_text())["previousManifest"] == v3_manifest

# Every rollback preserves unrelated post-upgrade settings and restores one level.
rollback_chain = [(v4, legacy[-1][0], legacy[-1][1])]
rollback_chain.extend(
    (legacy[index][0], legacy[index - 1][0], legacy[index - 1][1])
    for index in range(len(legacy) - 1, 0, -1)
)
for expected_removed, expected_source, expected_manifest in rollback_chain:
    install.rollback(agent, True)
    assert expected_removed.exists()
    install.rollback(agent, False)
    assert not expected_removed.exists() and expected_source.exists()
    restored = json.loads(settings_path.read_text())
    assert restored["packages"] == ["/unrelated", {**original_entry, "source": str(expected_source)}]
    assert restored["addedAfterUpgrade"] == 42
    assert json.loads(manifest_path.read_text()) == expected_manifest

v1 = legacy[0][0]
install.rollback(agent, True)
install.rollback(agent, False)
assert not v1.exists() and not manifest_path.exists()
assert json.loads(settings_path.read_text()) == {**original, "addedAfterUpgrade": 42}
assert session.read_bytes() == session_before
print("isolated v1/v2/v3 upgrade/rollback/task preservation: ok")
