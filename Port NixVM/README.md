# Port NixVM

Port NixVM is a small, separately packaged localhost communication tool. It currently provides only the precursor versioned `hello`/`ack` TCP handshake, enough for one local process to signal that it is awake. It is deliberately not an RPC framework and carries no commands or arbitrary payloads.

The v1 crossed-duplex contract is specified separately in `../NixSpec/`, `../PodleMale/`, and `../PodleFemale/`; this package does not implement that duplex bridge.

A future bounded Windows helper, such as `Bot Handy/`, may use this handshake. Neither tool depends on the other.

## Protocol

The client sends one bounded line:

```text
BOT-PORTDRIC/1 HELLO
```

The listener replies:

```text
BOT-PORTDRIC/1 ACK
```

The listener writes `hello` to standard output for each successful handshake. Invalid, incomplete, and oversized messages are ignored. This is a wake-up signal, not authentication or authorization; do not use receipt of a handshake to grant capabilities.

## Run it

Directly from this repository (quote the path because the folder name contains a space):

```bash
'Port NixVM/bin/port-nixvm' listen --once
'Port NixVM/bin/port-nixvm' hello
```

Both commands use `127.0.0.1:47123` by default. `listen` continues serving until interrupted unless `--once` is supplied. Run `--help` to see timeout, host, and port options. Hosts are restricted to loopback addresses; wildcard and LAN binds are rejected.

To install the independent command in a virtual environment:

```bash
python3 -m venv .venv
.venv/bin/pip install './Port NixVM'
.venv/bin/port-nixvm --help
```

## Windows 11 and WSL2 localhost

Windows 11 and its WSL2 environment are two execution environments on the **same machine**, not two independent computers. With WSL mirrored networking, Windows and WSL can connect through localhost in either direction. Windows-to-WSL localhost forwarding can also expose a listener running in WSL to Windows when that WSL setting is enabled.

For the intended WSL-to-Windows wake-up direction, run the eventual helper's listener on Windows and run `port-nixvm hello` in WSL. This requires a Windows/WSL networking configuration in which that Windows loopback listener is reachable from WSL, such as mirrored networking. Do not work around an unavailable localhost path by exposing this unauthenticated protocol on a LAN interface.

## Strict dependencies

- Python 3.10 or newer.
- A Windows 11/WSL2 localhost configuration appropriate to the direction being used when crossing the Windows/WSL boundary.

There are no third-party Python runtime packages. `requirements.txt` records that explicitly. Building an installable wheel or source distribution uses setuptools as declared in `pyproject.toml`; running `bin/port-nixvm` from the checkout uses only the Python standard library.

## Tests

```bash
python3 -m unittest discover -s 'Port NixVM/tests' -v
```
