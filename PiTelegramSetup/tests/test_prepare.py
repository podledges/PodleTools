import hashlib
import io
import json
import os
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def executable(path: Path, content: str) -> None:
    path.write_text(content)
    path.chmod(0o755)


class PrepareTests(unittest.TestCase):
    def make_fixture(self, base: Path, *, bad_archive_hash: bool = False):
        files = {
            "package/package.json": json.dumps({
                "name": "@example/pi-telegram",
                "version": "1.2.3",
                "engines": {"node": ">=22.19.0"},
                "peerDependencies": {"@earendil-works/pi-coding-agent": ">=0.84.4"},
                "pi": {"extensions": ["./index.ts"]},
            }).encode(),
            "package/index.ts": b"export default function () {}\n",
            "package/scripts/check-downgrade.mjs": b"process.exit(0);\n",
        }
        archive = base / "fixture.tgz"
        with tarfile.open(archive, "w:gz") as tar:
            for name, data in files.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
        pins = {
            "package": "@example/pi-telegram",
            "version": "1.2.3",
            "npm_spec": "npm:@example/pi-telegram@1.2.3",
            "tarball_sha256": "0" * 64 if bad_archive_hash else hashlib.sha256(archive.read_bytes()).hexdigest(),
            "npm_integrity": "test-only",
            "git_revision": "a" * 40,
            "minimum_node": "22.19.0",
            "minimum_pi": "0.84.4",
            "inspected_files": {name: hashlib.sha256(data).hexdigest() for name, data in files.items()},
        }
        pins_path = base / "pins.json"
        pins_path.write_text(json.dumps(pins))
        return archive, pins_path

    def run_prepare(self, bad_archive_hash=False):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        base = Path(temp.name)
        archive, pins = self.make_fixture(base, bad_archive_hash=bad_archive_hash)
        bin_dir = base / "bin"
        bin_dir.mkdir()
        executable(bin_dir / "node", "#!/bin/sh\necho v24.0.0\n")
        executable(bin_dir / "pi", "#!/bin/sh\necho 0.85.1\n")
        executable(bin_dir / "npm", "#!/bin/sh\nset -eu\nwhile [ \"$1\" != \"--pack-destination\" ]; do shift; done\ncp \"$MOCK_ARCHIVE\" \"$2/mock.tgz\"\necho mock.tgz\n")
        env = os.environ.copy()
        env["PATH"] = f"{bin_dir}:{env['PATH']}"
        env["MOCK_ARCHIVE"] = str(archive)
        stage = base / "stage"
        result = subprocess.run(
            ["python3", str(ROOT / "prepare.py"), "--pins", str(pins), "--stage-dir", str(stage)],
            text=True,
            capture_output=True,
            env=env,
        )
        return result, stage

    def test_prepares_verified_archive_without_installing(self):
        result, stage = self.run_prepare()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((stage / "ACTIVATION.md").is_file())
        self.assertIn("pi install npm:@example/pi-telegram@1.2.3", (stage / "ACTIVATION.md").read_text())
        self.assertTrue((stage / "templates/telegram.nonsecret.json.example").is_file())

    def test_rejects_archive_checksum_mismatch(self):
        result, stage = self.run_prepare(bad_archive_hash=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("archive checksum mismatch", result.stderr)
        self.assertFalse((stage / "ACTIVATION.md").exists())


if __name__ == "__main__":
    unittest.main()
