# PodleMale

Nix TX hook for the Port NixVM v1 crossed duplex. It publishes a loopback `PORT-NIXVM/1 HELLO` toward Windows PodleFemale and requires `PORT-NIXVM/1 ACK-HELLO`. It does not execute Windows diagnostics.

This tool stays separate from the other PodleTools. The 47123 hello/ack precursor in `../Port NixVM/` is not the v1 duplex contract.

## v1 direction

- Publish toward Windows Female on `127.0.0.1:42067`.
- `listen` on that same port is a Nix-only stand-in so a local round-trip can succeed when Windows is not up.
- The crossed return path is Nix PodleFemale on `127.0.0.1:46720`.

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
PodleMale/bin/podlemale listen --once
PodleMale/bin/podlemale hello
```

Both commands use `127.0.0.1:42067` by default. `listen` continues serving until interrupted unless `--once` is supplied. Run `--help` for timeout, host, and port options.

To install the independent command in a virtual environment:

```bash
python3 -m venv .venv
.venv/bin/pip install './PodleMale'
.venv/bin/podlemale --help
```

## Strict dependencies

- Python 3.10 or newer.
- A Windows 11/WSL2 localhost path when crossing to Windows Female. Nix-only loopback tests do not need Windows.

There are no third-party Python runtime packages. `requirements.txt` records that explicitly. Building an installable wheel or source distribution uses setuptools as declared in `pyproject.toml`; running `bin/podlemale` from the checkout uses only the Python standard library.

## Tests

```bash
python3 -m unittest discover -s PodleMale/tests -v
```
