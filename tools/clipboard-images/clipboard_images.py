#!/usr/bin/env python3
"""Locate PNG files produced by the Windows clipboard-image helper."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

DEFAULT_FOLDER = Path("/mnt/c/Users/ayden/Pictures/Screenshots2")
DEFAULT_LIMIT = 10


class ClipboardImagesError(Exception):
    """An expected error suitable for a concise CLI message."""


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return parsed


def recent_pngs(folder: Path) -> list[Path]:
    """Return PNG files newest first, breaking modification-time ties by name."""
    folder = folder.expanduser().resolve()
    if not folder.exists():
        raise ClipboardImagesError(f"folder does not exist: {folder}")
    if not folder.is_dir():
        raise ClipboardImagesError(f"not a folder: {folder}")

    try:
        candidates = [
            (entry.stat().st_mtime_ns, entry.name, entry.resolve())
            for entry in folder.iterdir()
            if entry.is_file() and entry.suffix.lower() == ".png"
        ]
    except OSError as error:
        raise ClipboardImagesError(f"cannot read folder {folder}: {error}") from error

    candidates.sort(key=lambda item: (-item[0], item[1]))
    if not candidates:
        raise ClipboardImagesError(f"no PNG images found in folder: {folder}")
    return [path for _, _, path in candidates]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Print absolute paths to clipboard images without reading or changing them."
    )
    parser.add_argument(
        "--folder",
        type=Path,
        default=DEFAULT_FOLDER,
        help=f"image folder (default: {DEFAULT_FOLDER})",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("latest", help="print the newest PNG path")
    list_parser = subparsers.add_parser("list", help="print recent PNG paths, newest first")
    list_parser.add_argument(
        "--limit",
        type=positive_int,
        default=DEFAULT_LIMIT,
        help=f"maximum paths to print (default: {DEFAULT_LIMIT})",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        images = recent_pngs(args.folder)
    except ClipboardImagesError as error:
        print(f"clipboard-images: {error}", file=sys.stderr)
        return 1

    selected = images[: args.limit] if args.command == "list" else images[:1]
    for path in selected:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
