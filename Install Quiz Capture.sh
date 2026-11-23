#!/bin/sh
set -eu
package_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo "Quiz Capture supports 64-bit Intel/AMD and ARM Linux." >&2; exit 1 ;;
esac
runtime="$package_dir/Resources/runtime/$arch/node"
if [ ! -x "$runtime" ]; then
  echo "Extract the complete Linux release archive. The bundled runtime is missing or not executable." >&2
  exit 1
fi
if [ "$#" -eq 0 ] && [ ! -t 0 ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  # Some file managers start scripts without a terminal.
  if command -v gnome-terminal >/dev/null 2>&1; then
    exec gnome-terminal --wait -- "$0" --from-terminal
  elif command -v konsole >/dev/null 2>&1; then
    exec konsole -e "$0" --from-terminal
  elif command -v xfce4-terminal >/dev/null 2>&1; then
    exec xfce4-terminal -x "$0" --from-terminal
  elif command -v x-terminal-emulator >/dev/null 2>&1; then
    exec x-terminal-emulator -e "$0" --from-terminal
  fi
  echo "Open the installer from a terminal to see its progress." >&2
  exit 1
fi
if [ "${1:-}" = --from-terminal ]; then
  result=0
  "$runtime" "$package_dir/Resources/Quiz Capture/install.mjs" || result=$?
  printf 'Press Return to close this window. '
  read -r ignored || :
  exit "$result"
fi
exec "$runtime" "$package_dir/Resources/Quiz Capture/install.mjs" "$@"
