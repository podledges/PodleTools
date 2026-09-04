from __future__ import annotations

import argparse
import socket
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from podlefemale.cli import (
    ACK_HELLO,
    DEFAULT_PORT,
    HELLO,
    HandshakeError,
    _loopback_address,
    _receive_line,
    listen,
    require_loopback,
)


class ProtocolTests(unittest.TestCase):
    def test_protocol_tokens_are_versioned_ack_hello(self) -> None:
        self.assertEqual(HELLO, b"PORT-NIXVM/1 HELLO\n")
        self.assertEqual(ACK_HELLO, b"PORT-NIXVM/1 ACK-HELLO\n")
        self.assertEqual(DEFAULT_PORT, 46720)
        self.assertNotEqual(ACK_HELLO, b"BOT-PORTDRIC/1 ACK\n")

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
        with self.assertRaises(ValueError):
            require_loopback("192.168.1.1")
        with self.assertRaises(ValueError):
            listen("0.0.0.0", 0, 1.0, True)
        self.assertEqual(_loopback_address("127.0.0.1"), "127.0.0.1")

    def test_cli_completes_ack_hello(self) -> None:
        command = [
            str(ROOT / "bin" / "podlefemale"),
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
            [str(ROOT / "bin" / "podlefemale"), "hello", "--port", port],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
        stdout, stderr = server.communicate(timeout=5)

        self.assertEqual(client.returncode, 0, client.stderr)
        self.assertEqual(client.stdout, "PORT-NIXVM/1 ACK-HELLO\n")
        self.assertEqual(server.returncode, 0, stderr)
        self.assertEqual(stdout, "hello\n")

    def test_locked_rx_port_round_trip(self) -> None:
        command = [
            str(ROOT / "bin" / "podlefemale"),
            "listen",
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
        self.assertEqual(listening, "listening on 127.0.0.1:46720")

        client = subprocess.run(
            [str(ROOT / "bin" / "podlefemale"), "hello"],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
        stdout, stderr = server.communicate(timeout=5)

        self.assertEqual(client.returncode, 0, client.stderr)
        self.assertEqual(client.stdout, "PORT-NIXVM/1 ACK-HELLO\n")
        self.assertEqual(server.returncode, 0, stderr)
        self.assertEqual(stdout, "hello\n")


if __name__ == "__main__":
    unittest.main()
