#!/usr/bin/env python3
"""Give paste-linker sole ownership of Alt+V through Pi's keybinding config."""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
import tempfile
from pathlib import Path
from typing import Any

PASTE_IMAGE_ACTION = "app.clipboard.pasteImage"


class KeybindingsConfigError(Exception):
    """A configuration error suitable for a concise CLI message."""


def read_config(path: Path) -> dict[str, Any]:
    if path.is_symlink():
        raise KeybindingsConfigError(f"{path} must be a regular user-owned file, not a symlink")
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise KeybindingsConfigError(f"cannot read valid JSON from {path}: {error}") from error
    if not isinstance(value, dict):
        raise KeybindingsConfigError(f"{path} must contain a JSON object")
    try:
        if path.stat().st_uid != os.getuid():
            raise KeybindingsConfigError(f"{path} is not owned by the current user")
    except OSError as error:
        raise KeybindingsConfigError(f"cannot inspect {path}: {error}") from error
    return value


def configure_keybindings(path: Path) -> bool:
    """Disable Pi's built-in paste action and preserve every unrelated binding."""
    config = read_config(path)
    if config.get(PASTE_IMAGE_ACTION) == []:
        return False

    config[PASTE_IMAGE_ACTION] = []
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o600
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            delete=False,
        ) as stream:
            temporary = Path(stream.name)
            json.dump(config, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(mode)
        os.replace(temporary, path)
    except OSError as error:
        raise KeybindingsConfigError(f"cannot update {path}: {error}") from error
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return True


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Disable Pi's built-in app.clipboard.pasteImage binding so the "
            "paste-linker extension solely owns Alt+V."
        )
    )
    parser.add_argument("path", type=Path, help="Pi keybindings.json path")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        changed = configure_keybindings(args.path)
    except KeybindingsConfigError as error:
        print(f"configure-pi-keybindings: {error}", file=sys.stderr)
        return 1
    print(f"{'updated' if changed else 'unchanged'} {args.path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
