#!/usr/bin/env python3
"""Install or roll back the maintained TodoAttention rpiv-todo package."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

import prepare

UPSTREAM_SOURCE = "npm:@juicesharp/rpiv-todo"
RELEASE_NAME = "rpiv-todo-2.9.0-attention-v1"
MANAGED_DIR = "todoattention"
MANIFEST_NAME = "install-manifest.json"
DEPENDENCIES = {
    "@juicesharp/rpiv-config": ("@juicesharp/rpiv-config", "2.9.0"),
    "typebox": ("typebox", "1."),
}


def fail(message: str) -> None:
    raise SystemExit(message)


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        fail(f"missing required file: {path}")
    except json.JSONDecodeError as error:
        fail(f"invalid JSON in {path}: {error}")


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    try:
        temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
        if path.exists():
            temporary.chmod(path.stat().st_mode & 0o777)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def package_source(entry: Any) -> str | None:
    if isinstance(entry, str):
        return entry
    if isinstance(entry, dict) and isinstance(entry.get("source"), str):
        return entry["source"]
    return None


def is_upstream(entry: Any) -> bool:
    source = package_source(entry)
    if source is None or not source.startswith(UPSTREAM_SOURCE):
        return False
    suffix = source[len(UPSTREAM_SOURCE) :]
    return suffix == "" or suffix.startswith("@")


def replace_package(settings: dict[str, Any], old: Any, new: Any) -> dict[str, Any]:
    packages = settings.get("packages")
    if not isinstance(packages, list):
        fail("settings packages must be an array")
    indexes = [index for index, entry in enumerate(packages) if entry == old]
    if len(indexes) != 1:
        fail(f"expected exactly one package entry to replace, found {len(indexes)}")
    updated = json.loads(json.dumps(settings))
    updated["packages"][indexes[0]] = new
    return updated


def find_module_root(source: Path) -> Path:
    for parent in source.parents:
        if parent.name == "node_modules":
            return parent
    fail(f"source is not inside an installed node_modules tree: {source}")


def verify_dependency(path: Path, expected_name: str, version_prefix: str) -> None:
    package = read_json(path / "package.json")
    name, version = package.get("name"), package.get("version")
    if name != expected_name or not isinstance(version, str) or not version.startswith(version_prefix):
        fail(
            f"unsupported dependency {name}@{version}; expected {expected_name} "
            f"version beginning {version_prefix}"
        )


def compatibility(source: Path, settings_path: Path, managed_source: str) -> tuple[dict[str, Any], Any]:
    prepare.verify(source)
    module_root = find_module_root(source)
    for relative, (name, version_prefix) in DEPENDENCIES.items():
        verify_dependency(module_root / relative, name, version_prefix)

    settings = read_json(settings_path)
    if not isinstance(settings, dict):
        fail("settings root must be an object")
    packages = settings.get("packages")
    if not isinstance(packages, list):
        fail("settings packages must be an array")
    candidates = [entry for entry in packages if is_upstream(entry) or package_source(entry) == managed_source]
    if len(candidates) != 1:
        fail(
            "expected exactly one rpiv-todo package entry (upstream or TodoAttention managed); "
            f"found {len(candidates)}"
        )
    return settings, candidates[0]


def copy_package(source: Path, destination: Path) -> None:
    shutil.copytree(source, destination)
    module_root = find_module_root(source)
    for relative in DEPENDENCIES:
        dependency_source = module_root / relative
        dependency_destination = destination / "node_modules" / relative
        dependency_destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(dependency_source, dependency_destination)


def build_stage(source: Path, stage: Path) -> None:
    copy_package(source, stage)
    prepare.verify(stage)
    prepare.git_apply(stage, check=False)
    prepare.git_apply(stage, check=True, reverse=True)


def install(source: Path, agent_dir: Path, dry_run: bool) -> None:
    settings_path = agent_dir / "settings.json"
    managed_root = agent_dir / MANAGED_DIR
    release = managed_root / "releases" / RELEASE_NAME
    managed_source = str(release.resolve())
    settings, current_entry = compatibility(source, settings_path, managed_source)

    if package_source(current_entry) == managed_source:
        if not release.is_dir():
            fail(f"settings references missing managed release: {release}")
        prepare.git_apply(release, check=True, reverse=True)
        print(f"installed and compatible: {managed_source}")
        return
    if not is_upstream(current_entry):
        fail(f"unsupported rpiv-todo package entry: {current_entry!r}")
    if release.exists():
        fail(f"managed release already exists without matching settings entry: {release}")

    if dry_run:
        transaction = Path(tempfile.mkdtemp(prefix=".todoattention-check-", dir=agent_dir))
    else:
        managed_root.mkdir(parents=True, exist_ok=True)
        stage_parent = managed_root / ".staging"
        stage_parent.mkdir(exist_ok=True)
        transaction = Path(tempfile.mkdtemp(prefix="install-", dir=stage_parent))
    stage = transaction / RELEASE_NAME
    try:
        build_stage(source, stage)
        managed_entry = (
            {**current_entry, "source": managed_source} if isinstance(current_entry, dict) else managed_source
        )
        next_settings = replace_package(settings, current_entry, managed_entry)
        if dry_run:
            print(f"compatible dry-run: would replace {package_source(current_entry)} with {managed_source}")
            return

        backups = managed_root / "backups"
        backups.mkdir(exist_ok=True)
        stamp = f"{int(time.time())}-{os.getpid()}"
        backup = backups / f"settings-{stamp}.json"
        shutil.copy2(settings_path, backup)
        manifest = {
            "format": 1,
            "installedSource": managed_source,
            "originalPackageEntry": current_entry,
            "settingsBackup": str(backup.resolve()),
            "settingsBeforeSha256": file_sha256(backup),
        }

        release.parent.mkdir(exist_ok=True)
        os.replace(stage, release)
        try:
            atomic_json(settings_path, next_settings)
            manifest["settingsAfterSha256"] = file_sha256(settings_path)
            atomic_json(managed_root / MANIFEST_NAME, manifest)
        except BaseException:
            atomic_json(settings_path, settings)
            shutil.rmtree(release, ignore_errors=True)
            raise
        print(f"installed: {managed_source}")
        print("Restart Pi separately when activation is coordinated; no running session was reloaded.")
    finally:
        shutil.rmtree(transaction, ignore_errors=True)


def rollback(agent_dir: Path, dry_run: bool) -> None:
    managed_root = agent_dir / MANAGED_DIR
    manifest_path = managed_root / MANIFEST_NAME
    manifest = read_json(manifest_path)
    if not isinstance(manifest, dict) or manifest.get("format") != 1:
        fail(f"unsupported install manifest: {manifest_path}")
    managed_source = manifest.get("installedSource")
    original = manifest.get("originalPackageEntry")
    if not isinstance(managed_source, str) or original is None:
        fail("install manifest is incomplete")
    expected_source = str((managed_root / "releases" / RELEASE_NAME).resolve())
    if managed_source != expected_source:
        fail(f"install manifest references an unexpected release: {managed_source}")
    settings_path = agent_dir / "settings.json"
    settings = read_json(settings_path)
    if not isinstance(settings, dict):
        fail("settings root must be an object")
    packages = settings.get("packages")
    if not isinstance(packages, list):
        fail("settings packages must be an array")
    managed_entries = [entry for entry in packages if package_source(entry) == managed_source]
    upstream_entries = [entry for entry in packages if is_upstream(entry)]
    if len(managed_entries) != 1 or upstream_entries:
        fail(
            "rollback requires exactly one managed TodoAttention entry and no upstream rpiv-todo entry; "
            "settings were not changed"
        )
    restored = replace_package(settings, managed_entries[0], original)
    release = Path(managed_source)
    if not release.is_dir():
        fail(f"managed release is missing: {release}")
    prepare.git_apply(release, check=True, reverse=True)
    if dry_run:
        print(f"compatible dry-run: would restore {package_source(original)} and remove {release}")
        return

    retired = release.with_name(f".{release.name}.rollback-{os.getpid()}")
    os.replace(release, retired)
    try:
        atomic_json(settings_path, restored)
    except BaseException:
        os.replace(retired, release)
        raise
    shutil.rmtree(retired)
    manifest_path.unlink()
    print(f"rolled back: restored {package_source(original)}")
    print("Restart Pi separately when activation is coordinated; no running session was reloaded.")


def main() -> None:
    default_agent_dir = Path(os.environ.get("PI_CODING_AGENT_DIR", "~/.pi/agent")).expanduser()
    default_source = default_agent_dir / "npm/node_modules/@juicesharp/rpiv-todo"
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    install_parser = subparsers.add_parser("install", help="compatibility-check, stage, and configure the patched package")
    install_parser.add_argument("--source", type=Path, default=default_source)
    install_parser.add_argument("--agent-dir", type=Path, default=default_agent_dir)
    install_parser.add_argument("--dry-run", action="store_true")
    check_parser = subparsers.add_parser("check", help="run the complete install preflight without changing configuration")
    check_parser.add_argument("--source", type=Path, default=default_source)
    check_parser.add_argument("--agent-dir", type=Path, default=default_agent_dir)
    rollback_parser = subparsers.add_parser("rollback", help="restore the replaced package entry and remove the managed release")
    rollback_parser.add_argument("--agent-dir", type=Path, default=default_agent_dir)
    rollback_parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.command in {"install", "check"}:
        install(args.source.resolve(), args.agent_dir.resolve(), args.command == "check" or args.dry_run)
    else:
        rollback(args.agent_dir.resolve(), args.dry_run)


if __name__ == "__main__":
    main()
