#!/bin/sh
support_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
if ! version=$(cat "$support_dir/current") || ! printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Quiz Capture installation is incomplete. Run the installer again." >&2
  exit 1
fi
app_dir="$support_dir/$version"
"$app_dir/node" "$app_dir/Quiz Capture/capture.mjs" "$@"
result=$?
if [ "$result" -ne 0 ] && [ -t 0 ] && [ "${1:-}" != --verify ]; then
  printf 'Press Return to close this window. '
  read -r ignored || :
fi
exit "$result"
