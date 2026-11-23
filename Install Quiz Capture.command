#!/bin/zsh
package_dir=${0:A:h}
arch=$(/usr/bin/uname -m)
if [[ "$arch" == arm64 || "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null)" == 1 ]]; then
  arch=arm64
elif [[ "$arch" == x86_64 ]]; then
  arch=x64
fi
runtime="$package_dir/Resources/runtime/$arch/node"
if [[ -x "$runtime" ]]; then
  "$runtime" "$package_dir/Resources/Quiz Capture/install.mjs" "$@"
  result=$?
else
  print -u2 "Unzip the macOS release ZIP and run its installer. The bundled runtime is missing or this Mac is unsupported."
  result=1
fi
if (( result != 0 )) && [[ -t 0 && "$1" != --non-interactive ]]; then
  read -r '?Press Return to close this window. '
fi
exit "$result"
