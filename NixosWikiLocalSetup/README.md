# Project-local NixOS/Nix documentation integration

PodleTools pins [`@firstpick/pi-extension-nixos-wiki-local`](https://github.com/Firstp1ck/pi-coding-agent-forge/tree/main/pi-extension-nixos-wiki-local) as a project-local Pi package. It supplies local official-documentation search/read/extract tools and the `nixos-local` skill. The project-owned `podletools-nixos-wsl2-guest` skill adds the deployment boundary that the upstream package intentionally cannot infer.

## Installed scope

[`.pi/settings.json`](../.pi/settings.json) contains the exact npm package version. Pi installs it beneath `.pi/npm/` after this project is trusted; `.pi/npm/node_modules/` and its lockfile are generated and ignored. This does not install the package globally or change `~/.pi/agent/settings.json`.

The documentation corpus uses the package's supported default locations:

- `~/.nixoswiki/` — sparse, shallow official source checkouts
- `~/.cache/pi/nixos-wiki-local/` — generated local search cache

The corpus is machine-local and is not committed. Its official sources are:

- `NixOS/nixpkgs`: `doc/` and `nixos/doc/`
- `NixOS/nix.dev`: `source/`
- `NixOS/nix`: `doc/`

Other projects do not gain the Pi package or its tools. A corpus already present in the default location can be reused only by another Pi session that separately loads the package.

## Install or repair

From the PodleTools repository root:

```sh
pi install -l --approve npm:@firstpick/pi-extension-nixos-wiki-local@0.1.7
```

The command uses Pi's supported project package installer and preserves unrelated project settings. Restart Pi, or use `/reload` in a session that already loaded project resources. Then run the package's supported setup command:

```text
/nixoswiki-local-setup
```

Use `/nixoswiki-status` to inspect corpus availability, indexed page count, repository revisions, and cache timestamp. Use `/nixoswiki-smoke-test` after setup or corpus updates.

## Environment boundary

This project is currently operated in a NixOS guest under WSL2, not on ordinary Ubuntu and not directly on the Windows host. The project skill requires fresh `/etc/os-release` and `uname -a` checks rather than recording transient release or kernel versions. It separates guest Nix/NixOS advice from bare-metal boot/partition/firmware steps and from Windows/WSL host administration.

Installing documentation grants no authorization for system rebuilds or activation, reboot, partitioning, privileged changes, guest system-configuration changes, or Windows host modification. WSL2 still has normal NixOS/Nix behavior, and its integration details must not be generalized to every VM.

## Rollback

Back up `.pi/settings.json`, then run from the project root:

```sh
pi remove -l --approve npm:@firstpick/pi-extension-nixos-wiki-local
```

Remove `.pi/skills/podletools-nixos-wsl2-guest/` only if the project-specific boundary should also be removed. Restart Pi or use `/reload`. Corpus/cache deletion is separate, optional, and potentially destructive; inspect `~/.nixoswiki/` and `~/.cache/pi/nixos-wiki-local/` and obtain explicit authorization before removing either.

## Pin evidence

[`pins.json`](pins.json) records the exact npm version, registry integrity/shasum, tarball SHA-256, and hashes of the reviewed manifest, setup implementation, README, safety policy, and non-NixOS policy. Upstream `README.md`, `TECHNICAL.md`, and `DEVELOPMENT.md` were also reviewed before installation.

## Prerequisites and limits

Required locally: Pi, Node/npm, Git, and network access to npm plus the three official GitHub repositories. `bun` is optional for upstream's mock test command and may be absent; package behavior can instead be verified in a no-model Pi RPC session with representative tool calls.
