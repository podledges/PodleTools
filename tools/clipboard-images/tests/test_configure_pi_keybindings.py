from __future__ import annotations

import json
import stat
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import configure_pi_keybindings as subject  # noqa: E402


class ConfigurePiKeybindingsTests(unittest.TestCase):
    def test_preserves_unrelated_bindings_and_disables_builtin_paste(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "keybindings.json"
            path.write_text(
                json.dumps({"tui.input.newLine": ["shift+enter", "ctrl+j"]}),
                encoding="utf-8",
            )
            path.chmod(0o640)

            self.assertTrue(subject.configure_keybindings(path))
            self.assertEqual(
                json.loads(path.read_text(encoding="utf-8")),
                {
                    "tui.input.newLine": ["shift+enter", "ctrl+j"],
                    "app.clipboard.pasteImage": [],
                },
            )
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)
            self.assertFalse(subject.configure_keybindings(path))

    def test_creates_supported_config_when_absent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "agent" / "keybindings.json"
            self.assertTrue(subject.configure_keybindings(path))
            self.assertEqual(
                json.loads(path.read_text(encoding="utf-8")),
                {"app.clipboard.pasteImage": []},
            )
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    def test_refuses_to_replace_invalid_config(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "keybindings.json"
            path.write_text("not json\n", encoding="utf-8")
            with self.assertRaises(subject.KeybindingsConfigError):
                subject.configure_keybindings(path)
            self.assertEqual(path.read_text(encoding="utf-8"), "not json\n")

    def test_refuses_to_replace_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "managed.json"
            target.write_text("{}\n", encoding="utf-8")
            path = root / "keybindings.json"
            path.symlink_to(target)
            with self.assertRaises(subject.KeybindingsConfigError):
                subject.configure_keybindings(path)
            self.assertEqual(target.read_text(encoding="utf-8"), "{}\n")


if __name__ == "__main__":
    unittest.main()
