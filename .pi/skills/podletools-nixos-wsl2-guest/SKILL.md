---
name: podletools-nixos-wsl2-guest
description: Use automatically when Nix, NixOS, nixpkgs, flakes, Nix configuration, or Linux VM advice concerns this PodleTools environment. Establishes the NixOS guest-under-WSL2 boundary and mutation limits before using local official Nix documentation.
---

# PodleTools NixOS WSL2 guest context

Before environment-specific advice, read `/etc/os-release` and run `uname -a` again. Treat those fresh observations as authoritative; do not hard-code a NixOS release or kernel version in guidance.

The established deployment shape is a **NixOS guest running under WSL2**:

- Nix/NixOS package, module, store, daemon, flake, and guest configuration questions concern the NixOS guest.
- Bootloader, disk partitioning, physical firmware, and ordinary bare-metal installation guidance is not applicable unless the user explicitly identifies a separate bare-metal target.
- Windows settings, WSL installation/update/import/export, `.wslconfig`, Hyper-V features, Windows networking/firewall, and host reboot actions concern the Windows/WSL host. This Pi session is not authority over that host.
- Virtualization does not disable normal NixOS or Nix behavior. Diagnose the guest normally, then account for WSL2-specific integration where relevant.
- Do not generalize WSL2 behavior to every VM, container, or hypervisor.

Documentation installation grants no permission to rebuild or activate NixOS, reboot either side, partition storage, use privilege escalation, change guest system configuration, or modify the Windows/WSL host. Start with read-only inspection and documentation. Obtain explicit authorization for mutations.

For documentation questions, follow the installed `nixos-local` skill and use `nixoswiki_search`, then focused `nixoswiki_extract`, before public web sources. Local corpus evidence describes upstream behavior; fresh system evidence describes this guest.
