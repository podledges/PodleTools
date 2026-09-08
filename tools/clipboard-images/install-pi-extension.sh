#!/usr/bin/env bash
# Deploy the Tools-owned Pi screenshot extension for the current user.
# Does not overwrite the /init-safe paste-capture wrapper, Windows config,
# unrelated Pi extensions, or rpiv-todo. Does not /reload Pi.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="${ROOT}/pi-extension"
LIVE_ROOT="${PODLE_TOOLS_LIVE_ROOT:-/home/podles/.local/share/podle-tools/clipboard-images}"
LIVE_EXT="${LIVE_ROOT}/pi-extension"
SYMLINK="${PI_EXTENSIONS_DIR:-/home/podles/.pi/agent/extensions}/paste-linker"
BACKUP_ROOT="${BACKUP_ROOT:-/home/podles/backups/pi-owned-screenshot-extension}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="${BACKUP_ROOT}/${STAMP}"
WRAPPER="/home/podles/.local/share/paste-linker/bin/paste-capture"
WRAPPER_SHA_EXPECTED="d591a4cf3654635baf92487cbea729c19aaae241be23d9506028028b6fa93935"
LIVE_CAPTURE_PY="/home/podles/.local/share/paste-linker/tools/paste_capture.py"
SRC_CAPTURE_PY="${ROOT}/paste_capture.py"

if [[ ! -f "${SRC}/index.ts" || ! -f "${SRC}/capture.ts" ]]; then
  echo "install-pi-extension: missing source at ${SRC}" >&2
  exit 1
fi

if [[ ! -e "${SYMLINK}" ]]; then
  echo "install-pi-extension: expected existing ${SYMLINK}" >&2
  exit 1
fi
if [[ ! -L "${SYMLINK}" ]]; then
  echo "install-pi-extension: ${SYMLINK} is not a symlink; refusing" >&2
  exit 1
fi

owner="$(stat -c '%U' "${SYMLINK}")"
if [[ "${owner}" != "$(id -un)" ]]; then
  echo "install-pi-extension: ${SYMLINK} owner ${owner} is not current user" >&2
  exit 1
fi

current_target="$(readlink "${SYMLINK}")"
resolved_target="$(readlink -f "${SYMLINK}")"
case "${resolved_target}" in
  /home/podles/.local/share/paste-linker/pi-extension|/home/podles/.local/share/paste-linker/pi-extension/*|/home/podles/.local/share/podle-tools/clipboard-images/pi-extension|/home/podles/.local/share/podle-tools/clipboard-images/pi-extension/*)
    ;;
  *)
    echo "install-pi-extension: refusing unexpected symlink target ${resolved_target}" >&2
    exit 1
    ;;
esac

if [[ -f "${WRAPPER}" ]]; then
  wrapper_sha="$(sha256sum "${WRAPPER}" | awk '{print $1}')"
  if [[ "${wrapper_sha}" != "${WRAPPER_SHA_EXPECTED}" ]]; then
    echo "install-pi-extension: note: paste-capture wrapper sha ${wrapper_sha} (expected ${WRAPPER_SHA_EXPECTED}); leaving wrapper untouched" >&2
  fi
fi

mkdir -p "${BACKUP}/originals" "${BACKUP}/live" "${LIVE_EXT}"
cp -a "${SYMLINK}" "${BACKUP}/originals/paste-linker.symlink"
printf '%s\n' "${current_target}" > "${BACKUP}/originals/paste-linker.symlink-target"
if [[ -e "${resolved_target}" ]]; then
  cp -a "${resolved_target}" "${BACKUP}/originals/pi-extension"
fi
if [[ -f "${WRAPPER}" ]]; then
  mkdir -p "${BACKUP}/originals/paste-linker-bin"
  cp -a "${WRAPPER}" "${BACKUP}/originals/paste-linker-bin/paste-capture"
  if [[ -f /home/podles/.local/share/paste-linker/bin/windows-powershell ]]; then
    cp -a /home/podles/.local/share/paste-linker/bin/windows-powershell "${BACKUP}/originals/paste-linker-bin/"
  fi
fi
if [[ -f "${LIVE_CAPTURE_PY}" ]]; then
  mkdir -p "${BACKUP}/originals/paste-linker-tools"
  cp -a "${LIVE_CAPTURE_PY}" "${BACKUP}/originals/paste-linker-tools/paste_capture.py"
fi
cp -a /home/podles/.pi/agent/settings.json "${BACKUP}/originals/settings.json" 2>/dev/null || true
cp -a /home/podles/.pi/agent/keybindings.json "${BACKUP}/originals/keybindings.json" 2>/dev/null || true
ls -la /home/podles/.pi/agent/extensions > "${BACKUP}/originals/extensions-listing.txt"

# Copy extension source into the live Tools-owned directory.
rsync -a --delete \
  --exclude tests \
  --exclude '*.test.ts' \
  "${SRC}/" "${LIVE_EXT}/"

# Update Tools paste_capture.py only. Never replace the /init wrapper.
if [[ -f "${SRC_CAPTURE_PY}" && -f "${LIVE_CAPTURE_PY}" ]]; then
  cp -a "${SRC_CAPTURE_PY}" "${LIVE_CAPTURE_PY}"
fi

# Atomically replace only the paste-linker symlink.
tmp_link="$(mktemp -p "$(dirname "${SYMLINK}")" .paste-linker.XXXXXX)"
ln -sfn "${LIVE_EXT}" "${tmp_link}"
mv -Tf "${tmp_link}" "${SYMLINK}"

{
  echo "timestamp=${STAMP}"
  echo "backup=${BACKUP}"
  echo "live_extension=${LIVE_EXT}"
  echo "symlink=${SYMLINK}"
  echo "previous_target=${current_target}"
  echo "wrapper_preserved=${WRAPPER}"
  echo "wrapper_sha256=$(sha256sum "${WRAPPER}" 2>/dev/null | awk '{print $1}')"
  echo "index_sha256=$(sha256sum "${LIVE_EXT}/index.ts" | awk '{print $1}')"
  echo "capture_ts_sha256=$(sha256sum "${LIVE_EXT}/capture.ts" | awk '{print $1}')"
  echo "paste_capture_py_sha256=$(sha256sum "${LIVE_CAPTURE_PY}" 2>/dev/null | awk '{print $1}')"
  echo "reload=not performed; ready for coordinated user /reload"
} | tee "${BACKUP}/manifest.txt"

cat > "${BACKUP}/rollback.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
# Restore the paste-linker symlink and paste_capture.py. Does not /reload Pi.
# Does not replace the /init wrapper.
ln -sfn $(printf '%q' "${current_target}") $(printf '%q' "${SYMLINK}")
if [[ -f $(printf '%q' "${BACKUP}/originals/paste-linker-tools/paste_capture.py") ]]; then
  cp -a $(printf '%q' "${BACKUP}/originals/paste-linker-tools/paste_capture.py") $(printf '%q' "${LIVE_CAPTURE_PY}")
fi
echo "restored ${SYMLINK} -> ${current_target}"
EOF
chmod +x "${BACKUP}/rollback.sh"

echo "installed ${SYMLINK} -> ${LIVE_EXT}"
echo "backup ${BACKUP}"
echo "paste-capture wrapper not modified"
echo "do not /reload from this installer"
