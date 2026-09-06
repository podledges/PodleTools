#!/usr/bin/env python3
"""Clone and inspect pinned Herdr Telegram notify source without installing it."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PINS = ROOT / "pins.json"


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=True, text=True, capture_output=True)


def version_tuple(text: str) -> tuple[int, ...]:
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", text)
    if not match:
        raise ValueError(f"could not parse version from {text!r}")
    return tuple(map(int, match.groups()))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage-dir", type=Path, default=ROOT / ".prepared")
    parser.add_argument("--pins", type=Path, default=DEFAULT_PINS, help=argparse.SUPPRESS)
    args = parser.parse_args()
    pins = json.loads(args.pins.read_text())

    herdr_version = run("herdr", "--version").stdout.strip()
    node_version = run("node", "--version").stdout.strip()
    if version_tuple(herdr_version) < version_tuple(pins["minimum_herdr"]):
        raise SystemExit(f"Herdr {pins['minimum_herdr']}+ required; found {herdr_version}")
    if version_tuple(node_version) < version_tuple(pins["minimum_node"]):
        raise SystemExit(f"Node {pins['minimum_node']}+ required; found {node_version}")
    install_help = run("herdr", "plugin", "install", "--help").stdout
    if "--ref <REF>" not in install_help or "<OWNER/REPO[/SUBDIR]>" not in install_help:
        raise SystemExit("installed Herdr lacks the pinned plugin install syntax")

    stage = args.stage_dir.resolve()
    if stage.exists():
        raise SystemExit(f"stage directory already exists; inspect or remove it first: {stage}")
    source = stage / "source"
    stage.mkdir(parents=True)
    run("git", "clone", "--filter=blob:none", "--no-checkout", pins["repository"], str(source))
    run("git", "-C", str(source), "checkout", "--detach", pins["revision"])
    actual_revision = run("git", "-C", str(source), "rev-parse", "HEAD").stdout.strip()
    if actual_revision != pins["revision"]:
        raise SystemExit("checked-out Herdr plugin revision does not match pin")

    plugin = source / pins["subdirectory"]
    for relative, expected in pins["inspected_files"].items():
        path = plugin / relative
        if not path.is_file():
            raise SystemExit(f"pinned plugin is missing inspected file: {relative}")
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise SystemExit(f"inspected file checksum mismatch: {relative}")

    manifest = (plugin / "herdr-plugin.toml").read_text()
    expected_fields = {
        "id": pins["plugin_id"],
        "version": pins["plugin_version"],
        "min_herdr_version": pins["minimum_herdr"],
    }
    for key, value in expected_fields.items():
        if not re.search(rf'^\s*{re.escape(key)}\s*=\s*"{re.escape(value)}"\s*$', manifest, re.MULTILINE):
            raise SystemExit(f"plugin manifest {key} changed")
    if 'on = "pane.agent_status_changed"' not in manifest or 'command = ["node", "notify.mjs"]' not in manifest:
        raise SystemExit("plugin event hook changed")

    template_dir = stage / "templates"
    template_dir.mkdir()
    shutil.copy2(ROOT / "templates/agent-telegram-notify.env.example", template_dir)
    (stage / "ACTIVATION.md").write_text(
        "# Future activation (not performed)\n\n"
        "The exact revision and every executable/configuration source file passed inspection. "
        "After reviewing `source/agent-telegram-notify`, a human may install exactly:\n\n"
        f"```sh\nherdr plugin install --ref {pins['revision']} {pins['source']}\n```\n\n"
        "Installation registers an enabled global plugin and is therefore an activation step. "
        "Do not run it until outbound notifications are wanted. After installation, use "
        f"`herdr plugin config-dir {pins['plugin_id']}` to locate its config directory, copy "
        "the staged environment template there as `.env`, enter credentials securely, and "
        "explicitly change `HERDR_TELEGRAM_ENABLED=1` only when ready.\n"
    )
    print(f"Prepared and inspected {pins['source']}@{pins['revision']} at {stage}")
    print("No Herdr plugin/configuration/state or Telegram connection was changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
