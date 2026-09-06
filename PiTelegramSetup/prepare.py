#!/usr/bin/env python3
"""Download and inspect pinned pi-telegram without installing or activating it."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PINS = ROOT / "pins.json"


def version_tuple(text: str) -> tuple[int, ...]:
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", text)
    if not match:
        raise ValueError(f"could not parse version from {text!r}")
    return tuple(map(int, match.groups()))


def output(*args: str) -> str:
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout.strip()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage-dir", type=Path, default=ROOT / ".prepared")
    parser.add_argument("--pins", type=Path, default=DEFAULT_PINS, help=argparse.SUPPRESS)
    args = parser.parse_args()

    pins = json.loads(args.pins.read_text())
    node_version = output("node", "--version")
    pi_version = output("pi", "--version")
    if version_tuple(node_version) < version_tuple(pins["minimum_node"]):
        raise SystemExit(f"Node {pins['minimum_node']}+ required; found {node_version}")
    if version_tuple(pi_version) < version_tuple(pins["minimum_pi"]):
        raise SystemExit(f"Pi {pins['minimum_pi']}+ required; found {pi_version}")

    stage = args.stage_dir.resolve()
    if stage.exists():
        raise SystemExit(f"stage directory already exists; inspect or remove it first: {stage}")
    downloads = stage / "downloads"
    downloads.mkdir(parents=True)

    package_arg = f"{pins['package']}@{pins['version']}"
    subprocess.run(
        ["npm", "pack", package_arg, "--pack-destination", str(downloads), "--silent"],
        check=True,
    )
    archives = list(downloads.glob("*.tgz"))
    if len(archives) != 1:
        raise SystemExit(f"expected one npm archive, found {len(archives)}")
    archive = archives[0]
    archive_bytes = archive.read_bytes()
    if sha256(archive_bytes) != pins["tarball_sha256"]:
        raise SystemExit("pinned npm archive checksum mismatch")

    with tarfile.open(archive, "r:gz") as package:
        members = {member.name: member for member in package.getmembers() if member.isfile()}
        for name, expected in pins["inspected_files"].items():
            if name not in members:
                raise SystemExit(f"pinned package is missing inspected file: {name}")
            handle = package.extractfile(members[name])
            assert handle is not None
            if sha256(handle.read()) != expected:
                raise SystemExit(f"inspected file checksum mismatch: {name}")
        manifest_handle = package.extractfile(members["package/package.json"])
        assert manifest_handle is not None
        manifest = json.load(manifest_handle)

    expected_extension = "./index.ts"
    if manifest.get("name") != pins["package"] or manifest.get("version") != pins["version"]:
        raise SystemExit("package identity does not match pins")
    if expected_extension not in manifest.get("pi", {}).get("extensions", []):
        raise SystemExit("package manifest does not register the expected Pi extension")
    if manifest.get("engines", {}).get("node") != f">={pins['minimum_node']}":
        raise SystemExit("package Node requirement changed")
    peer = manifest.get("peerDependencies", {}).get("@earendil-works/pi-coding-agent")
    if peer != f">={pins['minimum_pi']}":
        raise SystemExit("package Pi peer requirement changed")

    template_dir = stage / "templates"
    template_dir.mkdir()
    shutil.copy2(ROOT / "templates/telegram.nonsecret.json.example", template_dir)
    (stage / "ACTIVATION.md").write_text(
        "# Future activation (not performed)\n\n"
        "The pinned archive and its manifest/entrypoint/safety script passed inspection. "
        "After reviewing the staged archive, a human may install exactly:\n\n"
        f"```sh\npi install {pins['npm_spec']}\n```\n\n"
        "Then, in an interactive Pi session, run `/telegram-setup` to enter the token "
        "through Pi's prompt and `/telegram-connect` only when ready to activate polling. "
        "Do not copy the non-secret template over an existing `telegram.json`; merge chosen "
        "settings while preserving profiles and credentials.\n"
    )
    print(f"Prepared and inspected {pins['npm_spec']} at {stage}")
    print("No Pi settings, packages, credentials, or Telegram connections were changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
