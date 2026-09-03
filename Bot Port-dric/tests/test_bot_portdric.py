from __future__ import annotations

import argparse
import socket
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from bot_portdric.cli import ACK, HELLO, HandshakeError, _loopback_address, _receive_line


class ProtocolTests(unittest.TestCase):
    def test_protocol_tokens_are_small_and_versioned(self) -> None:
        self.assertEqual(HELLO, b"BOT-PORTDRIC/1 HELLO\n")
        self.assertEqual(ACK, b"BOT-PORTDRIC/1 ACK\n")

    def test_receive_line_rejects_oversized_input(self) -> None:
        sender, receiver = socket.socketpair()
        self.addCleanup(sender.close)
        self.addCleanup(receiver.close)
        sender.sendall(b"x" * 65)
        with self.assertRaises(HandshakeError):
            _receive_line(receiver)

    def test_non_loopback_bind_is_rejected(self) -> None:
        with self.assertRaises(argparse.ArgumentTypeError):
            _loopback_address("0.0.0.0")
        self.assertEqual(_loopback_address("127.0.0.1"), "127.0.0.1")

    def test_cli_completes_hello_ack(self) -> None:
        command = [
            str(ROOT / "bin" / "bot-portdric"),
            "listen",
            "--port",
            "0",
            "--once",
        ]
        server = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self.addCleanup(lambda: server.poll() is None and server.kill())
        assert server.stdout is not None
        listening = server.stdout.readline().strip()
        port = listening.rsplit(":", 1)[1]

        client = subprocess.run(
            [str(ROOT / "bin" / "bot-portdric"), "hello", "--port", port],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
        stdout, stderr = server.communicate(timeout=5)

        self.assertEqual(client.returncode, 0, client.stderr)
        self.assertEqual(client.stdout, "ack\n")
        self.assertEqual(server.returncode, 0, stderr)
        self.assertEqual(stdout, "hello\n")


if __name__ == "__main__":
    unittest.main()
