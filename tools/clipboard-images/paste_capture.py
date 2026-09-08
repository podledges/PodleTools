#!/usr/bin/env python3
"""Invoke the Windows current-clipboard image capture script and validate its artifact.

This helper never enumerates screenshot folders, never calls latest/list, and
never captures the clipboard itself. It runs a configured PowerShell script via
argv only, then checks that the returned path is the exact current staging
artifact (readable PNG under the allowed staging root whose SHA-256 matches).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

SCHEMA = 1
KIND_IMAGE = "image"
LABEL_SCREENSHOT = "Screenshot Pasted"
DEFAULT_STAGING_WINDOWS = r"C:\Users\ayden\AppData\Local\PodlePaste\staging"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
MAX_STDOUT_BYTES = 64 * 1024
MAX_IMAGE_BYTES = 32 * 1024 * 1024
CAPTURE_TIMEOUT_SECONDS = 30
SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
WINDOWS_DRIVE_RE = re.compile(r"^([A-Za-z]):[\\/](.*)$")

Runner = Callable[..., subprocess.CompletedProcess[bytes]]


class PasteCaptureError(Exception):
    """An expected error suitable for a concise CLI message."""


def default_mount_root() -> Path:
    return Path("/mnt")


def find_powershell() -> str:
    for name in ("powershell.exe", "powershell"):
        found = shutil.which(name)
        if found:
            return found
    for candidate in (
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
        "/mnt/c/Windows/System32/powershell.exe",
    ):
        if Path(candidate).is_file():
            return candidate
    raise PasteCaptureError("powershell.exe not found on PATH")


def _reject_control_chars(value: str, what: str) -> str:
    if not value or "\x00" in value:
        raise PasteCaptureError(f"invalid {what}")
    if any(ord(char) < 32 and char not in "\t" for char in value):
        raise PasteCaptureError(f"invalid {what}")
    return value


def parse_windows_absolute(path: str) -> tuple[str, tuple[str, ...]]:
    path = _reject_control_chars(path.strip(), "Windows path")
    if path.startswith(("\\\\", "//")):
        raise PasteCaptureError("UNC and device paths are not allowed")
    match = WINDOWS_DRIVE_RE.fullmatch(path)
    if match is None:
        raise PasteCaptureError("Windows path must be an absolute drive path")
    drive = match.group(1).lower()
    remainder = match.group(2).replace("/", "\\")
    if ":" in remainder:
        raise PasteCaptureError("Windows path contains an illegal ':'")
    parts = tuple(part for part in remainder.split("\\") if part not in ("", "."))
    if not parts or any(part == ".." for part in parts):
        raise PasteCaptureError("Windows path must not contain '..' or skip the staging directory")
    if any("*" in part or "?" in part for part in parts):
        raise PasteCaptureError("Windows path contains wildcards")
    return drive, parts


def windows_to_wsl(path: str, mount_root: Path) -> Path:
    drive, parts = parse_windows_absolute(path)
    return mount_root.joinpath(drive, *parts)


def parse_wsl_drive_path(path: Path, mount_root: Path) -> tuple[str, tuple[str, ...]]:
    posix = path.as_posix()
    mount_posix = mount_root.as_posix().rstrip("/")
    prefix = mount_posix + "/"
    if posix == mount_posix or not posix.startswith(prefix):
        raise PasteCaptureError("staging directory must be under the WSL drive mount")
    relative = posix[len(prefix) :]
    match = re.fullmatch(r"([A-Za-z])(?:/(.*))?", relative)
    if match is None:
        raise PasteCaptureError("staging directory must be under a WSL drive mount such as /mnt/c")
    remainder = match.group(2) or ""
    parts = tuple(part for part in remainder.split("/") if part not in ("", "."))
    if any(part == ".." for part in parts):
        raise PasteCaptureError("staging directory must not contain '..'")
    return match.group(1).lower(), parts


def wsl_to_windows(path: Path, mount_root: Path) -> str:
    drive, parts = parse_wsl_drive_path(path, mount_root)
    if not parts:
        raise PasteCaptureError("staging directory must be a directory on a drive")
    return f"{drive.upper()}:\\" + "\\".join(parts)


def is_windows_absolute(value: str) -> bool:
    try:
        parse_windows_absolute(value)
    except PasteCaptureError:
        return False
    return True


def require_absolute_script(value: str) -> str:
    value = _reject_control_chars(value, "script path")
    if is_windows_absolute(value):
        return value
    path = Path(value)
    if path.is_absolute():
        return str(path)
    raise PasteCaptureError("--script must be an absolute path")


def script_for_powershell(script: str, mount_root: Path) -> str:
    if is_windows_absolute(script):
        return normalize_windows_path(script)
    path = Path(script)
    try:
        return wsl_to_windows(path, mount_root)
    except PasteCaptureError:
        return str(path)


def normalize_windows_path(path: str) -> str:
    drive, parts = parse_windows_absolute(path)
    return f"{drive.upper()}:\\" + "\\".join(parts)


def resolve_staging(
    staging_dir: str | None, mount_root: Path
) -> tuple[str | None, Path, str]:
    """Return (destination_directory argv or None, allowed WSL root, windows root)."""
    if staging_dir is None:
        windows_root = DEFAULT_STAGING_WINDOWS
        return None, windows_to_wsl(windows_root, mount_root), windows_root

    staging_dir = _reject_control_chars(staging_dir, "staging directory")
    if is_windows_absolute(staging_dir):
        windows_root = normalize_windows_path(staging_dir)
        return windows_root, windows_to_wsl(windows_root, mount_root), windows_root

    path = Path(staging_dir)
    if not path.is_absolute():
        raise PasteCaptureError("--staging-dir must be an absolute path")
    windows_root = wsl_to_windows(path, mount_root)
    return windows_root, path, windows_root


def build_command(
    powershell: str,
    script: str,
    destination_directory: str | None,
) -> list[str]:
    # -NoLogo keeps the copyright banner off stdout. Windows PowerShell 5.1
    # still exits 0 for a missing -File path; callers must not treat that as JSON.
    command = [powershell, "-NoProfile", "-NoLogo", "-STA", "-File", script]
    if destination_directory is not None:
        command.extend(["-DestinationDirectory", destination_directory])
    return command


def decode_stdout(data: bytes) -> str:
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16")
    if data.startswith(b"\xef\xbb\xbf"):
        return data.decode("utf-8-sig")
    return data.decode("utf-8")


def parse_success_json(stdout: str) -> dict[str, Any]:
    # One metadata JSON object and one newline. Allow CRLF from Windows
    # PowerShell Write-Output; reject banners, extra blank lines, and junk.
    if stdout.endswith("\r\n"):
        body = stdout[:-2]
    elif stdout.endswith("\n"):
        body = stdout[:-1]
    else:
        raise PasteCaptureError("capture stdout must be one JSON object followed by a newline")
    if "\n" in body or "\r" in body:
        raise PasteCaptureError("capture stdout must be one JSON object followed by a newline")
    if not body or body[:1] in " \t":
        raise PasteCaptureError("capture stdout must be one JSON object followed by a newline")
    try:
        decoder = json.JSONDecoder()
        payload, end = decoder.raw_decode(body)
    except json.JSONDecodeError as error:
        raise PasteCaptureError("capture stdout is not valid JSON") from error
    if end != len(body):
        raise PasteCaptureError("capture stdout must contain exactly one JSON object")
    if not isinstance(payload, dict):
        raise PasteCaptureError("capture stdout must be a JSON object")
    return payload


def require_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise PasteCaptureError(f"capture JSON missing string field {key!r}")
    return value


def validate_payload_fields(payload: dict[str, Any]) -> tuple[str, str]:
    if payload.get("schema") != SCHEMA:
        raise PasteCaptureError("capture JSON schema must be 1")
    if payload.get("kind") != KIND_IMAGE:
        raise PasteCaptureError("capture JSON kind must be 'image'")
    if payload.get("label") != LABEL_SCREENSHOT:
        raise PasteCaptureError("capture JSON label must be 'Screenshot Pasted'")
    windows_path = require_string(payload, "path")
    digest = require_string(payload, "sha256")
    if SHA256_RE.fullmatch(digest) is None:
        raise PasteCaptureError("capture JSON sha256 must be 64 hex characters")
    return windows_path, digest.lower()


def is_under_root(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def validate_artifact(
    windows_path: str,
    digest: str,
    allowed_root: Path,
    mount_root: Path,
) -> Path:
    wsl_path = Path(os.path.normpath(windows_to_wsl(windows_path, mount_root)))
    root = Path(os.path.normpath(allowed_root))
    if not is_under_root(wsl_path, root):
        raise PasteCaptureError("staged path is outside the allowed staging directory")
    try:
        if wsl_path.is_symlink():
            raise PasteCaptureError("staged path must be a regular file, not a symlink")
        if not wsl_path.is_file():
            raise PasteCaptureError(f"staged image is not a file: {wsl_path}")
        resolved = wsl_path.resolve(strict=True)
        size = resolved.stat().st_size
    except PasteCaptureError:
        raise
    except OSError as error:
        raise PasteCaptureError(f"staged image is not readable: {wsl_path}") from error
    resolved_root = root.resolve() if root.exists() else root
    if not is_under_root(resolved, resolved_root):
        raise PasteCaptureError("staged path is outside the allowed staging directory")
    if size > MAX_IMAGE_BYTES:
        raise PasteCaptureError("staged image exceeds the supported size limit")
    try:
        data = resolved.read_bytes()
    except OSError as error:
        raise PasteCaptureError(f"staged image is not readable: {resolved}") from error
    if not data.startswith(PNG_MAGIC):
        raise PasteCaptureError("staged artifact is not a PNG image")
    actual = hashlib.sha256(data).hexdigest()
    if actual != digest:
        raise PasteCaptureError("staged image hash does not match capture JSON")
    return resolved


def run_windows_capture(
    command: Sequence[str],
    runner: Runner | None,
) -> subprocess.CompletedProcess[bytes]:
    if runner is None:
        return subprocess.run(
            list(command),
            check=False,
            capture_output=True,
            shell=False,
            timeout=CAPTURE_TIMEOUT_SECONDS,
        )
    return runner(
        list(command),
        check=False,
        capture_output=True,
        shell=False,
        timeout=CAPTURE_TIMEOUT_SECONDS,
    )


def capture_current_image(
    *,
    script: str,
    staging_dir: str | None,
    powershell: str | None = None,
    runner: Runner | None = None,
    mount_root: Path | None = None,
) -> dict[str, Any]:
    mount = mount_root if mount_root is not None else default_mount_root()
    script = require_absolute_script(script)
    destination, allowed_root, _windows_root = resolve_staging(staging_dir, mount)
    powershell_path = powershell if powershell else find_powershell()
    powershell_path = _reject_control_chars(powershell_path, "powershell path")
    command = build_command(
        powershell_path,
        script_for_powershell(script, mount),
        destination,
    )
    try:
        completed = run_windows_capture(command, runner)
    except subprocess.TimeoutExpired as error:
        raise PasteCaptureError("capture timed out") from error
    except OSError as error:
        raise PasteCaptureError(f"failed to run capture script: {error}") from error

    try:
        stderr_text = decode_stdout(completed.stderr or b"").strip()
    except UnicodeDecodeError:
        stderr_text = ""

    if completed.returncode != 0:
        raise PasteCaptureError(stderr_text or "capture failed")

    stdout_bytes = completed.stdout or b""
    if len(stdout_bytes) > MAX_STDOUT_BYTES:
        raise PasteCaptureError("capture stdout is too large")
    try:
        stdout = decode_stdout(stdout_bytes)
    except UnicodeDecodeError as error:
        raise PasteCaptureError("capture stdout is not valid UTF-8 or UTF-16") from error

    try:
        payload = parse_success_json(stdout)
    except PasteCaptureError:
        # Missing -File on Windows PowerShell 5.1 exits 0 and may print a
        # copyright banner on stdout. Surface stderr instead of a JSON-framing error.
        if stderr_text:
            raise PasteCaptureError(stderr_text) from None
        raise
    windows_path, digest = validate_payload_fields(payload)
    resolved = validate_artifact(windows_path, digest, allowed_root, mount)
    return {
        "schema": SCHEMA,
        "kind": KIND_IMAGE,
        "label": LABEL_SCREENSHOT,
        "path": str(resolved),
        "sha256": digest,
        "windows_path": normalize_windows_path(windows_path),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run the Windows current-clipboard PNG capture script and print "
            "validated WSL path JSON. Does not fall back to latest/list."
        )
    )
    parser.add_argument(
        "--script",
        required=True,
        help="absolute path to Capture-CurrentClipboardImage.ps1",
    )
    parser.add_argument(
        "--staging-dir",
        default=None,
        help=(
            "absolute WSL or Windows staging directory passed as "
            "-DestinationDirectory (default: LOCALAPPDATA/PodlePaste/staging)"
        ),
    )
    parser.add_argument(
        "--powershell",
        default=None,
        help="absolute powershell.exe path (default: discover powershell.exe)",
    )
    return parser


def main(
    argv: list[str] | None = None,
    *,
    runner: Runner | None = None,
    mount_root: Path | None = None,
) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.powershell is not None:
            powershell = _reject_control_chars(args.powershell, "powershell path")
            if not Path(powershell).is_absolute() and not is_windows_absolute(powershell):
                raise PasteCaptureError("--powershell must be an absolute path")
        else:
            powershell = None
        result = capture_current_image(
            script=args.script,
            staging_dir=args.staging_dir,
            powershell=powershell,
            runner=runner,
            mount_root=mount_root,
        )
    except PasteCaptureError as error:
        print(f"paste-capture: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
