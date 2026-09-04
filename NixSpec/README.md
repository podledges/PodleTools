# NixSpec

Planning placeholder for the NixOS/VM side of the crossed duplex. The communication graph is postponed; this folder records roles and trigger-loading rules only.

## Roles

- Nix PodleMale is the Nix TX side, publishing toward Windows PodleFemale.
- Nix PodleFemale is the Nix RX side, receiving from Windows PodleMale.
- Port NixVM is the Nix outbound localhost publisher, using `127.0.0.1:42067` toward the Windows listener.
- The return direction is received on `127.0.0.1:67420`.

The 47123 hello/ack exchange is a precursor only and is not the v1 duplex contract. No bridge, message routing, or communication graph is implemented here.

## Trigger loading

Load this spec only when a sentence is about the Linux/Nix VM. Matching is case-insensitive and ignores trailing spaces and periods. Accepted Nix keywords are `nix`, `nixos`, and `Nix` (the last is covered by case-insensitivity). Do not load for `Mix`, `Next`, or bare `OS`. Sentence context must establish the Linux/Nix VM meaning; a keyword appearing in an unrelated sentence is insufficient.
