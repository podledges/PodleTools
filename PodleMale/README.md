# PodleMale

Nix TX hook specification placeholder. This tool remains separate from the other PodleTools.

## v1 direction

PodleMale publishes from Nix toward Windows PodleFemale through Port NixVM at `127.0.0.1:42067`. This is a hook/interface specification only: no socket publisher, duplex bridge, payload protocol, retry loop, or communication graph is implemented.

The crossed return direction is Windows PodleMale to Nix PodleFemale on `127.0.0.1:67420`; it is outside this TX hook.
