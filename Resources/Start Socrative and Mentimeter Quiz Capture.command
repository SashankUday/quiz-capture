#!/bin/zsh

app_dir="$HOME/Library/Application Support/Socrative and Mentimeter Quiz Capture/1.0.0"
node_bin="$app_dir/runtime/bin/node"

start_capture() {
  if [[ ! -x "$node_bin" ]]; then
    print -u2 "The Node.js runtime is unavailable. Install Node.js 20 or newer if it was removed."
    return 1
  fi
  cd -- "$app_dir/Quiz Capture" || return 1
  "$node_bin" capture.mjs "$@"
}

start_capture "$@"
capture_exit_code=$?
if (( capture_exit_code != 0 )) && [[ -t 0 ]]; then
  read -r '?Press Return to close this window. '
fi
exit "$capture_exit_code"
