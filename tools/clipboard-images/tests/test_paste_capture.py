from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "bin" / "paste-capture"

import sys

sys.path.insert(0, str(ROOT))

from paste_capture import (  # noqa: E402
    DEFAULT_STAGING_WINDOWS,
    build_command,
    main,
)

# 1x1 transparent PNG.
MIN_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a4944415478da6300000002000100cfc8cd690000000049454e44ae426082"
)
JPEG_MAGIC = b"\xff\xd8\xff\xe0" + b"\x00" * 16


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class FakeRunner:
    def __init__(
        self,
        stdout: bytes = b"",
        stderr: bytes = b"",
        returncode: int = 0,
    ) -> None:
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode
        self.commands: list[list[str]] = []
        self.kwargs: list[dict] = []

    def __call__(self, command: list[str], **kwargs) -> subprocess.CompletedProcess[bytes]:
        self.commands.append(list(command))
        self.kwargs.append(kwargs)
        return subprocess.CompletedProcess(
            command, self.returncode, self.stdout, self.stderr
        )


class PasteCaptureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.base = Path(self.temporary_directory.name)
        self.mount_root = self.base / "mnt"
        self.staging = (
            self.mount_root
            / "c"
            / "Users"
            / "ayden"
            / "AppData"
            / "Local"
            / "PodlePaste"
            / "staging"
        )
        self.staging.mkdir(parents=True)
        self.script = (
            self.mount_root
            / "c"
            / "Users"
            / "ayden"
            / "AppData"
            / "Local"
            / "PodleWindOS"
            / "Capture-CurrentClipboardImage.ps1"
        )
        self.script.parent.mkdir(parents=True)
        self.script.write_text("# mock capture script\n")
        self.powershell = self.base / "powershell.exe"
        self.powershell.write_text("#!/bin/sh\nexit 1\n")
        self.powershell.chmod(0o755)

    def windows_staging_file(self, name: str) -> str:
        return "C:\\Users\\ayden\\AppData\\Local\\PodlePaste\\staging\\" + name

    def write_png(self, name: str, data: bytes = MIN_PNG) -> Path:
        path = self.staging / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def success_stdout(self, name: str, data: bytes = MIN_PNG, **extra) -> bytes:
        payload = {
            "schema": 1,
            "kind": "image",
            "label": "Screenshot Pasted",
            "path": self.windows_staging_file(name),
            "sha256": sha256(data),
        }
        payload.update(extra)
        return (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")

    def run_main(self, runner: FakeRunner, extra_args: list[str] | None = None) -> subprocess.CompletedProcess[str]:
        argv = [
            "--script",
            str(self.script),
            "--staging-dir",
            str(self.staging),
            "--powershell",
            str(self.powershell),
            *(extra_args or []),
        ]
        import io

        captured_out = io.StringIO()
        captured_err = io.StringIO()
        with mock.patch("sys.stdout", captured_out), mock.patch("sys.stderr", captured_err):
            code = main(argv, runner=runner, mount_root=self.mount_root)
        return subprocess.CompletedProcess(argv, code, captured_out.getvalue(), captured_err.getvalue())

    def test_success_maps_unicode_and_spaces_and_keeps_exact_artifact(self) -> None:
        name = "paste 测试 🖼️ unique.png"
        current = self.write_png("current.png", MIN_PNG + b"old")
        decoy = self.write_png("clipboard-latest.png", MIN_PNG + b"late")
        artifact = self.write_png(name)
        runner = FakeRunner(stdout=self.success_stdout(name))

        result = self.run_main(runner)

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["schema"], 1)
        self.assertEqual(payload["kind"], "image")
        self.assertEqual(payload["label"], "Screenshot Pasted")
        self.assertEqual(payload["path"], str(artifact.resolve()))
        self.assertEqual(payload["sha256"], sha256(MIN_PNG))
        self.assertEqual(payload["windows_path"], self.windows_staging_file(name))
        self.assertTrue(result.stdout.endswith("\n"))
        self.assertNotIn(str(current.resolve()), result.stdout)
        self.assertNotIn(str(decoy.resolve()), result.stdout)
        command = runner.commands[0]
        self.assertEqual(command[1:4], ["-NoProfile", "-STA", "-File"])
        self.assertNotIn("latest", command)
        self.assertNotIn("list", command)
        self.assertFalse(runner.kwargs[0].get("shell"))
        self.assertIn("-DestinationDirectory", command)
        dest = command[command.index("-DestinationDirectory") + 1]
        self.assertEqual(dest, r"C:\Users\ayden\AppData\Local\PodlePaste\staging")
        self.assertEqual(dest.count("-DestinationDirectory"), 0)

    def test_hash_match_on_decoy_is_not_substituted(self) -> None:
        matching = self.write_png("current.png")
        actual = self.write_png("unique-paste.png", MIN_PNG + b"x")
        runner = FakeRunner(
            stdout=self.success_stdout("unique-paste.png", MIN_PNG)  # hash of MIN_PNG, file differs
        )
        # Force hash in JSON to matching current.png while path points at unique-paste.png.
        payload = json.loads(self.success_stdout("unique-paste.png").decode())
        payload["sha256"] = sha256(matching.read_bytes())
        runner.stdout = (json.dumps(payload) + "\n").encode()

        result = self.run_main(runner)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("hash does not match", result.stderr)
        self.assertNotIn(str(matching), result.stdout)
        self.assertTrue(actual.exists())

    def test_default_staging_omits_destination_directory(self) -> None:
        artifact = self.write_png("only-this.png")
        runner = FakeRunner(stdout=self.success_stdout("only-this.png"))
        argv = [
            "--script",
            str(self.script),
            "--powershell",
            str(self.powershell),
        ]
        import io

        captured_out = io.StringIO()
        captured_err = io.StringIO()
        with mock.patch("sys.stdout", captured_out), mock.patch("sys.stderr", captured_err):
            code = main(argv, runner=runner, mount_root=self.mount_root)
        self.assertEqual(code, 0, captured_err.getvalue())
        command = runner.commands[0]
        self.assertNotIn("-DestinationDirectory", command)
        payload = json.loads(captured_out.getvalue())
        self.assertEqual(payload["path"], str(artifact.resolve()))
        self.assertEqual(
            command[command.index("-File") + 1],
            r"C:\Users\ayden\AppData\Local\PodleWindOS\Capture-CurrentClipboardImage.ps1",
        )
        self.assertEqual(DEFAULT_STAGING_WINDOWS, r"C:\Users\ayden\AppData\Local\PodlePaste\staging")

    def test_malicious_path_outside_staging_is_rejected(self) -> None:
        outside = self.mount_root / "c" / "Windows" / "Temp" / "evil.png"
        outside.parent.mkdir(parents=True)
        outside.write_bytes(MIN_PNG)
        payload = {
            "schema": 1,
            "kind": "image",
            "label": "Screenshot Pasted",
            "path": r"C:\Windows\Temp\evil.png",
            "sha256": sha256(MIN_PNG),
        }
        runner = FakeRunner(stdout=(json.dumps(payload) + "\n").encode())

        result = self.run_main(runner)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("outside the allowed staging directory", result.stderr)

    def test_parent_directory_escape_is_rejected(self) -> None:
        payload = {
            "schema": 1,
            "kind": "image",
            "label": "Screenshot Pasted",
            "path": r"C:\Users\ayden\AppData\Local\PodlePaste\staging\..\..\secret.png",
            "sha256": sha256(MIN_PNG),
        }
        runner = FakeRunner(stdout=(json.dumps(payload) + "\n").encode())
        result = self.run_main(runner)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("..", result.stderr)

    def test_unc_path_is_rejected(self) -> None:
        payload = {
            "schema": 1,
            "kind": "image",
            "label": "Screenshot Pasted",
            "path": r"\\server\share\file.png",
            "sha256": sha256(MIN_PNG),
        }
        runner = FakeRunner(stdout=(json.dumps(payload) + "\n").encode())
        result = self.run_main(runner)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("UNC", result.stderr)
        self.assertEqual(result.stdout, "")

    def test_relative_windows_path_is_rejected(self) -> None:
        payload = {
            "schema": 1,
            "kind": "image",
            "label": "Screenshot Pasted",
            "path": r"staging\file.png",
            "sha256": sha256(MIN_PNG),
        }
        runner = FakeRunner(stdout=(json.dumps(payload) + "\n").encode())
        result = self.run_main(runner)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")

    def test_invalid_and_multiple_json_are_rejected(self) -> None:
        self.write_png("a.png")
        cases = [
            b"",
            b"not json\n",
            b"{}\n",
            b'{"schema":1,"kind":"image","label":"Screenshot Pasted","path":"C:\\\\x.png","sha256":"'
            + sha256(MIN_PNG).encode()
            + b'"}\n{"schema":1}\n',
            b'[{"schema":1}]\n',
        ]
        for stdout in cases:
            with self.subTest(stdout=stdout[:40]):
                result = self.run_main(FakeRunner(stdout=stdout))
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")

    def test_wrong_schema_kind_label_rejected(self) -> None:
        self.write_png("a.png")
        base = {
            "schema": 1,
            "kind": "image",
            "label": "Screenshot Pasted",
            "path": self.windows_staging_file("a.png"),
            "sha256": sha256(MIN_PNG),
        }
        for key, value in (("schema", 2), ("kind", "file"), ("label", "Image Pasted")):
            payload = dict(base)
            payload[key] = value
            result = self.run_main(FakeRunner(stdout=(json.dumps(payload) + "\n").encode()))
            self.assertNotEqual(result.returncode, 0, key)
            self.assertEqual(result.stdout, "")

    def test_non_png_magic_rejected(self) -> None:
        self.write_png("photo.jpg", JPEG_MAGIC)
        payload = {
            "schema": 1,
            "kind": "image",
            "label": "Screenshot Pasted",
            "path": self.windows_staging_file("photo.jpg"),
            "sha256": sha256(JPEG_MAGIC),
        }
        result = self.run_main(FakeRunner(stdout=(json.dumps(payload) + "\n").encode()))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not a PNG", result.stderr)
        self.assertEqual(result.stdout, "")

    def test_missing_file_rejected(self) -> None:
        runner = FakeRunner(stdout=self.success_stdout("missing.png"))
        result = self.run_main(runner)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("not a file", result.stderr)

    def test_nonzero_capture_prints_stderr_not_json(self) -> None:
        runner = FakeRunner(stdout=b"{}\n", stderr=b"clipboard is not an image\n", returncode=2)
        result = self.run_main(runner)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertIn("clipboard is not an image", result.stderr)
        self.assertNotIn(MIN_PNG.decode("latin1"), result.stderr)

    def test_relative_script_rejected(self) -> None:
        runner = FakeRunner(stdout=self.success_stdout("a.png"))
        import io

        captured_out = io.StringIO()
        captured_err = io.StringIO()
        argv = [
            "--script",
            "Capture-CurrentClipboardImage.ps1",
            "--staging-dir",
            str(self.staging),
            "--powershell",
            str(self.powershell),
        ]
        with mock.patch("sys.stdout", captured_out), mock.patch("sys.stderr", captured_err):
            code = main(argv, runner=runner, mount_root=self.mount_root)
        self.assertNotEqual(code, 0)
        self.assertEqual(captured_out.getvalue(), "")
        self.assertIn("absolute", captured_err.getvalue())
        self.assertEqual(runner.commands, [])

    def test_script_with_shell_metacharacters_stays_one_argv(self) -> None:
        nasty = self.script.parent / "capture; rm -rf . ; echo.ps1"
        nasty.write_text("# mock\n")
        artifact = self.write_png("ok.png")
        runner = FakeRunner(stdout=self.success_stdout("ok.png"))
        import io

        captured_out = io.StringIO()
        captured_err = io.StringIO()
        argv = [
            "--script",
            str(nasty),
            "--staging-dir",
            str(self.staging),
            "--powershell",
            str(self.powershell),
        ]
        with mock.patch("sys.stdout", captured_out), mock.patch("sys.stderr", captured_err):
            code = main(argv, runner=runner, mount_root=self.mount_root)
        self.assertEqual(code, 0, captured_err.getvalue())
        command = runner.commands[0]
        self.assertFalse(any("rm -rf" == part for part in command))
        self.assertTrue(any("rm -rf" in part for part in command))
        self.assertEqual(command[4], runner.commands[0][4])
        self.assertEqual(json.loads(captured_out.getvalue())["path"], str(artifact.resolve()))
        self.assertFalse(runner.kwargs[0].get("shell"))

    def test_symlink_is_rejected(self) -> None:
        target = self.write_png("real.png")
        link = self.staging / "link.png"
        try:
            os.symlink(target, link)
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {error}")
        runner = FakeRunner(stdout=self.success_stdout("link.png"))
        result = self.run_main(runner)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("symlink", result.stderr)

    def test_build_command_uses_argv_not_shell_string(self) -> None:
        command = build_command(
            r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
            r"C:\tools\Capture-CurrentClipboardImage.ps1",
            r"C:\Users\ayden\AppData\Local\PodlePaste\staging",
        )
        self.assertEqual(
            command,
            [
                r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
                "-NoProfile",
                "-STA",
                "-File",
                r"C:\tools\Capture-CurrentClipboardImage.ps1",
                "-DestinationDirectory",
                r"C:\Users\ayden\AppData\Local\PodlePaste\staging",
            ],
        )

    def test_source_does_not_fallback_to_latest_list_or_screenshots2(self) -> None:
        source = (ROOT / "paste_capture.py").read_text()
        self.assertNotIn("clipboard_images", source)
        self.assertNotIn("iterdir", source)
        self.assertNotIn("os.listdir", source)
        self.assertNotIn("shell=True", source)
        self.assertNotIn('["latest"]', source)
        self.assertNotIn("'latest'", source)

    def test_wsl_path_in_windows_json_is_rejected(self) -> None:
        self.write_png("a.png")
        payload = {
            "schema": 1,
            "kind": "image",
            "label": "Screenshot Pasted",
            "path": str(self.staging / "a.png"),
            "sha256": sha256(MIN_PNG),
        }
        result = self.run_main(FakeRunner(stdout=(json.dumps(payload) + "\n").encode()))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")

    def test_sha256_wrong_shape_rejected(self) -> None:
        self.write_png("a.png")
        payload = {
            "schema": 1,
            "kind": "image",
            "label": "Screenshot Pasted",
            "path": self.windows_staging_file("a.png"),
            "sha256": "abc",
        }
        result = self.run_main(FakeRunner(stdout=(json.dumps(payload) + "\n").encode()))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")

    def test_cli_bin_is_executable_wrapper(self) -> None:
        self.assertTrue(CLI.is_file())
        text = CLI.read_text()
        self.assertIn("from paste_capture import main", text)


if __name__ == "__main__":
    unittest.main()
