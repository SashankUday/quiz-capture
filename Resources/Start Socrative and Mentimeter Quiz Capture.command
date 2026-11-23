#!/bin/zsh
support_dir="${QUIZ_CAPTURE_INSTALL_ROOT:-$HOME/Library/Application Support/Socrative and Mentimeter Quiz Capture}"
version=$(<"$support_dir/current")
if [[ "$version" != <->.<->.<-> ]]; then
  print -u2 "Quiz Capture installation is incomplete. Run the installer again."
  exit 1
fi
app_dir="$support_dir/$version"
"$app_dir/node" "$app_dir/Quiz Capture/capture.mjs" "$@"
result=$?
if (( result != 0 )) && [[ -t 0 && "$1" != --verify ]]; then
  read -r '?Press Return to close this window. '
fi
exit "$result"
