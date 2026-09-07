#!/usr/bin/env python3
"""Compatibility-check and apply the PodleTools rpiv-todo renderer patch."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path

EXPECTED_NAME = "@juicesharp/rpiv-todo"
EXPECTED_VERSION = "2.9.0"
EXPECTED_HASHES = {
    "README.md": "6cf80812ff9ae1b9fb1bf6e39d86102e47e8b1a34b71969b0349f075c9069351",
    "docs/overlay.md": "ca6c7c63a21597339d6ba3ba8669546cf0ae67f8708ddf7e567110bb4e06e78e",
    "docs/tool-schema.md": "2988883b86b657729b2ee9604c045d1de61f64bb6335ca3dbe725458cd1cb10f",
    "state/replay.ts": "222eacd01e0ce983e2d7dd5597f31111c6344ef290908ba09f0fe9f556f8a5c0",
    "state/selectors.ts": "9548b044bea7cdceeaceb3664e779a966fe901f7f1485c6cc2bc22281e76ded6",
    "state/state-reducer.ts": "cd7d03b0f167920b76a72069f5b5f40ecc524bf4c4f6dd8909469f711d273dd0",
    "todo.ts": "44b06d99f4c7a82419447f1388e644e1e571efc6e64d0482f3d7bfb9f0c5b886",
    "tool/sanitize.ts": "eea928b89bc7b1768e75f3123acb881e984fe1604435e6e2cd7b576a6006616c",
    "view/format.ts": "444cf33f80cb03c54ab57a78fc7d47d5c1632ffd53cade92c511eca6006ae2b6",
}
PATCH = Path(__file__).with_name("patches") / "rpiv-todo-2.9.0-attention.patch"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(source: Path) -> None:
    package = json.loads((source / "package.json").read_text())
    identity = (package.get("name"), package.get("version"))
    if identity != (EXPECTED_NAME, EXPECTED_VERSION):
        raise SystemExit(
            f"unsupported source {identity[0]}@{identity[1]}; expected {EXPECTED_NAME}@{EXPECTED_VERSION}"
        )
    mismatches = []
    for relative, expected in EXPECTED_HASHES.items():
        path = source / relative
        actual = sha256(path) if path.is_file() else "missing"
        if actual != expected:
            mismatches.append(f"{relative}: expected {expected}, got {actual}")
    if mismatches:
        raise SystemExit("source compatibility check failed:\n" + "\n".join(mismatches))


def git_apply(source: Path, check: bool) -> None:
    command = ["git", "apply"]
    if check:
        command.append("--check")
    command.append(str(PATCH.resolve()))
    env = {**os.environ, "GIT_CEILING_DIRECTORIES": str(source.parent)}
    subprocess.run(command, cwd=source, env=env, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="clean @juicesharp/rpiv-todo 2.9.0 source directory")
    parser.add_argument("--apply", action="store_true", help="apply after compatibility checks")
    args = parser.parse_args()
    source = args.source.resolve()
    if "node_modules" in source.parts:
        raise SystemExit("refusing to patch node_modules in place; use a clean upstream source checkout")
    verify(source)
    git_apply(source, check=not args.apply)
    print(("applied to " if args.apply else "compatible: ") + str(source))


if __name__ == "__main__":
    main()
