# NixSpec

NixOS/VM-side roles and trigger-loading rules for the Port NixVM crossed duplex. The communication graph is postponed; this folder does not implement routing or Windows diagnostics.

## Roles

- Nix PodleMale is the Nix TX side, publishing toward Windows PodleFemale on `127.0.0.1:42067`.
- Nix PodleFemale is the Nix RX side, receiving from Windows PodleMale on `127.0.0.1:46720`.
- Port NixVM names that outbound localhost publisher port; the working TX/RX hooks live in `../PodleMale/` and `../PodleFemale/`.
- v1 handshake: client `PORT-NIXVM/1 HELLO`, listener `PORT-NIXVM/1 ACK-HELLO`, loopback only.
- v1 does not execute Windows diagnostics on Nix.

The 47123 hello/ack exchange in `../Port NixVM/` is a precursor only and is not the v1 duplex contract.

## Trigger loading

Load this spec only when a sentence is about the Linux/Nix VM. Matching is case-insensitive and ignores trailing spaces and periods. Accepted Nix keywords are `nix`, `nixos`, and `Nix` (the last is covered by case-insensitivity). Do not load for `Mix`, `Next`, or bare `OS`. Sentence context must establish the Linux/Nix VM meaning; a keyword appearing in an unrelated sentence is insufficient.
