import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVISION = "1" * 40


def executable(path: Path, content: str) -> None:
    path.write_text(content)
    path.chmod(0o755)


class PrepareTests(unittest.TestCase):
    def make_fixture(self, base: Path, *, bad_hash: bool = False):
        repo = base / "mock-repo"
        plugin = repo / "agent-telegram-notify"
        plugin.mkdir(parents=True)
        files = {
            "herdr-plugin.toml": (
                'id = "examples.agent-telegram-notify"\n'
                'version = "0.1.0"\n'
                'min_herdr_version = "0.7.0"\n'
                '[[events]]\non = "pane.agent_status_changed"\ncommand = ["node", "notify.mjs"]\n'
            ),
            "notify.mjs": "// mock outbound handler; never executed\n",
            "lib.mjs": "// mock helper\n",
            "toggle.mjs": "// mock toggle; never executed\n",
            "README.md": "mock fixture\n",
            ".env.example": "TELEGRAM_BOT_TOKEN=\n",
        }
        for name, content in files.items():
            (plugin / name).write_text(content)
        hashes = {name: hashlib.sha256(content.encode()).hexdigest() for name, content in files.items()}
        if bad_hash:
            hashes["notify.mjs"] = "0" * 64
        pins = {
            "repository": "https://example.invalid/mock.git",
            "source": "example/mock/agent-telegram-notify",
            "subdirectory": "agent-telegram-notify",
            "revision": REVISION,
            "plugin_id": "examples.agent-telegram-notify",
            "plugin_version": "0.1.0",
            "minimum_herdr": "0.7.0",
            "minimum_node": "18.0.0",
            "inspected_files": hashes,
        }
        pins_path = base / "pins.json"
        pins_path.write_text(json.dumps(pins))
        return repo, pins_path

    def run_prepare(self, bad_hash=False):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        base = Path(temp.name)
        repo, pins = self.make_fixture(base, bad_hash=bad_hash)
        bin_dir = base / "bin"
        bin_dir.mkdir()
        executable(bin_dir / "node", "#!/bin/sh\necho v20.0.0\n")
        executable(
            bin_dir / "herdr",
            "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'herdr 0.8.2'; exit; fi\nprintf 'Usage: herdr plugin install [OPTIONS] <OWNER/REPO[/SUBDIR]>\\n      --ref <REF>\\n'\n",
        )
        executable(
            bin_dir / "git",
            "#!/bin/sh\nset -eu\nif [ \"$1\" = clone ]; then for dest do :; done; cp -R \"$MOCK_REPO\" \"$dest\"; exit; fi\nif [ \"$1\" = -C ] && [ \"$3\" = checkout ]; then exit; fi\nif [ \"$1\" = -C ] && [ \"$3\" = rev-parse ]; then echo \"$MOCK_REVISION\"; exit; fi\nexit 2\n",
        )
        env = os.environ.copy()
        env["PATH"] = f"{bin_dir}:{env['PATH']}"
        env["MOCK_REPO"] = str(repo)
        env["MOCK_REVISION"] = REVISION
        stage = base / "stage"
        result = subprocess.run(
            ["python3", str(ROOT / "prepare.py"), "--pins", str(pins), "--stage-dir", str(stage)],
            text=True,
            capture_output=True,
            env=env,
        )
        return result, stage

    def test_prepares_verified_checkout_without_plugin_install(self):
        result, stage = self.run_prepare()
        self.assertEqual(result.returncode, 0, result.stderr)
        plan = (stage / "ACTIVATION.md").read_text()
        self.assertIn(f"herdr plugin install --ref {REVISION}", plan)
        self.assertTrue((stage / "templates/agent-telegram-notify.env.example").is_file())

    def test_rejects_changed_script_before_writing_plan(self):
        result, stage = self.run_prepare(bad_hash=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("inspected file checksum mismatch", result.stderr)
        self.assertFalse((stage / "ACTIVATION.md").exists())


if __name__ == "__main__":
    unittest.main()
