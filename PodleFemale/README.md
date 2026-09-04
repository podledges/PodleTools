# PodleFemale

Nix RX hook for the Port NixVM v1 crossed duplex. It listens on loopback for `PORT-NIXVM/1 HELLO` from Windows PodleMale and replies `PORT-NIXVM/1 ACK-HELLO`. It does not execute Windows diagnostics or received payloads.

This tool stays separate from the other PodleTools. The 47123 hello/ack precursor in `../Port NixVM/` is not the v1 duplex contract.

## v1 direction

- Listen on `127.0.0.1:46720` for Windows Male.
- `hello` against that same port is a Nix-only proof so success does not require Windows.
- The crossed outbound path is Nix PodleMale toward Windows Female on `127.0.0.1:42067`.

Hosts are loopback-only; wildcard and LAN binds are rejected.

## Protocol

Client:

```text
PORT-NIXVM/1 HELLO
```

Listener:

```text
PORT-NIXVM/1 ACK-HELLO
```

One UTF-8 newline-terminated line. Invalid, incomplete, and oversized lines are ignored. This is not authentication.

## Run it

```bash
PodleFemale/bin/podlefemale listen --once
PodleFemale/bin/podlefemale hello
```

Both commands use `127.0.0.1:46720` by default. `listen` continues serving until interrupted unless `--once` is supplied. Run `--help` for timeout, host, and port options.

To install the independent command in a virtual environment:

```bash
python3 -m venv .venv
.venv/bin/pip install './PodleFemale'
.venv/bin/podlefemale --help
```

## Strict dependencies

- Python 3.10 or newer.
- A Windows 11/WSL2 localhost path when receiving from Windows Male. Nix-only loopback tests do not need Windows.

There are no third-party Python runtime packages. `requirements.txt` records that explicitly. Building an installable wheel or source distribution uses setuptools as declared in `pyproject.toml`; running `bin/podlefemale` from the checkout uses only the Python standard library.

## Tests

```bash
python3 -m unittest discover -s PodleFemale/tests -v
```
