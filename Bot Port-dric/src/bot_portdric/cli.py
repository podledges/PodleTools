"""Command-line interface for the Bot Port-dric hello/ack handshake."""

from __future__ import annotations

import argparse
import ipaddress
import socket
import sys
from collections.abc import Sequence

HELLO = b"BOT-PORTDRIC/1 HELLO\n"
ACK = b"BOT-PORTDRIC/1 ACK\n"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 47123
MAX_MESSAGE_BYTES = 64


class HandshakeError(Exception):
    """The peer did not complete the expected handshake."""


def _loopback_address(value: str) -> str:
    """Reject names and addresses that could expose the listener to a network."""
    if value == "localhost":
        return DEFAULT_HOST
    try:
        address = ipaddress.ip_address(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "host must be localhost or a numeric loopback address"
        ) from exc
    if not address.is_loopback:
        raise argparse.ArgumentTypeError("host must be a loopback address")
    return value


def _receive_line(connection: socket.socket) -> bytes:
    data = bytearray()
    while len(data) <= MAX_MESSAGE_BYTES:
        chunk = connection.recv(1)
        if not chunk:
            break
        data.extend(chunk)
        if chunk == b"\n":
            return bytes(data)
    raise HandshakeError("peer sent an incomplete or oversized message")


def send_hello(host: str, port: int, timeout: float) -> None:
    with socket.create_connection((host, port), timeout=timeout) as connection:
        connection.settimeout(timeout)
        connection.sendall(HELLO)
        if _receive_line(connection) != ACK:
            raise HandshakeError("peer did not return the Bot Port-dric acknowledgement")


def listen(host: str, port: int, timeout: float, once: bool) -> None:
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    with socket.socket(family, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind((host, port))
        listener.listen(4)
        actual_port = listener.getsockname()[1]
        print(f"listening on {host}:{actual_port}", flush=True)

        while True:
            connection, _ = listener.accept()
            with connection:
                connection.settimeout(timeout)
                try:
                    message = _receive_line(connection)
                except (HandshakeError, TimeoutError):
                    continue
                if message != HELLO:
                    continue
                connection.sendall(ACK)
                print("hello", flush=True)
            if once:
                return


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bot-portdric",
        description="Exchange a minimal hello/ack over a loopback TCP socket.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    listen_parser = subparsers.add_parser("listen", help="listen for hello messages")
    listen_parser.add_argument("--host", type=_loopback_address, default=DEFAULT_HOST)
    listen_parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    listen_parser.add_argument("--timeout", type=float, default=2.0)
    listen_parser.add_argument(
        "--once", action="store_true", help="exit after the first valid handshake"
    )

    hello_parser = subparsers.add_parser("hello", help="send hello and require an ack")
    hello_parser.add_argument("--host", type=_loopback_address, default=DEFAULT_HOST)
    hello_parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    hello_parser.add_argument("--timeout", type=float, default=2.0)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "listen":
            listen(args.host, args.port, args.timeout, args.once)
            return 0
        send_hello(args.host, args.port, args.timeout)
        print("ack")
        return 0
    except (HandshakeError, OSError, ValueError) as exc:
        print(f"bot-portdric: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
