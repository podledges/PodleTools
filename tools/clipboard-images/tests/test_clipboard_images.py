from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "bin" / "clipboard-images"


class ClipboardImagesCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.folder = Path(self.temporary_directory.name) / "images with spaces"
        self.folder.mkdir()

    def run_cli(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(CLI), "--folder", str(self.folder), *arguments],
            check=False,
            capture_output=True,
            text=True,
        )

    def make_file(self, name: str, mtime_ns: int, content: bytes = b"synthetic") -> Path:
        path = self.folder / name
        path.write_bytes(content)
        os.utime(path, ns=(mtime_ns, mtime_ns))
        return path

    def test_latest_prints_absolute_path_with_filename_whitespace(self) -> None:
        older = self.make_file("clipboard-older image.png", 1_000_000_000)
        latest = self.make_file("clipboard-latest image.png", 2_000_000_000)

        result = self.run_cli("latest")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, f"{latest.resolve()}\n")
        self.assertNotIn(str(older), result.stdout)

    def test_list_sorts_by_mtime_then_filename_and_honors_limit(self) -> None:
        tie_b = self.make_file("clipboard-b.png", 3_000_000_000)
        newest = self.make_file("clipboard-newest.PNG", 4_000_000_000)
        tie_a = self.make_file("clipboard-a.png", 3_000_000_000)
        self.make_file("not-an-image.txt", 5_000_000_000)
        self.make_file("clipboard-old.png", 2_000_000_000)

        result = self.run_cli("list", "--limit", "3")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout.splitlines(),
            [str(newest.resolve()), str(tie_a.resolve()), str(tie_b.resolve())],
        )

    def test_missing_folder_fails_with_clear_message(self) -> None:
        self.folder.rmdir()

        result = self.run_cli("latest")

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("folder does not exist", result.stderr)
        self.assertIn(str(self.folder.resolve()), result.stderr)

    def test_empty_folder_fails_with_clear_message(self) -> None:
        result = self.run_cli("list")

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("no PNG images found", result.stderr)

    def test_commands_do_not_change_fixture_files_or_directory(self) -> None:
        first = self.make_file("clipboard-one.png", 1_000_000_000, b"first image")
        second = self.make_file("clipboard-two.png", 2_000_000_000, b"second image")
        before = {
            path.name: (path.read_bytes(), path.stat().st_mode, path.stat().st_mtime_ns)
            for path in self.folder.iterdir()
        }

        latest_result = self.run_cli("latest")
        list_result = self.run_cli("list")

        self.assertEqual(latest_result.returncode, 0, latest_result.stderr)
        self.assertEqual(list_result.returncode, 0, list_result.stderr)
        after = {
            path.name: (path.read_bytes(), path.stat().st_mode, path.stat().st_mtime_ns)
            for path in self.folder.iterdir()
        }
        self.assertEqual(after, before)
        self.assertEqual(set(after), {first.name, second.name})


if __name__ == "__main__":
    unittest.main()
