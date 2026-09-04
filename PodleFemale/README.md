# PodleFemale

Nix RX hook specification placeholder. This tool remains separate from the other PodleTools.

## v1 direction

PodleFemale receives from Windows PodleMale on `127.0.0.1:67420`. This is a hook/interface specification only: no socket receiver, duplex bridge, payload protocol, retry loop, or communication graph is implemented.

The crossed outbound direction is Nix PodleMale to Windows PodleFemale through Port NixVM on `127.0.0.1:42067`; it is outside this RX hook.
