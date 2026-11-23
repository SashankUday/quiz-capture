#!/bin/zsh

setopt pipe_fail
umask 022
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

package_dir=${0:A:h}
support_dir="$HOME/Library/Application Support/Socrative and Mentimeter Quiz Capture"
app_dir="$support_dir/1.0.0"
desktop_launcher="$HOME/Desktop/Start Socrative and Mentimeter Quiz Capture.command"
launcher_source="$package_dir/Resources/Start Socrative and Mentimeter Quiz Capture.command"
stage_dir=""

cleanup() {
  if [[ -n "$stage_dir" ]]; then
    /bin/rm -rf -- "$stage_dir"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

install_runtime() {
  local runtime_dir="$1"
  local existing_node machine arch version archive_name checksum archive_path
  /bin/mkdir -p "$runtime_dir/bin" || return 1
  for existing_node in "${(@f)$(whence -pa node)}"; do
    if [[ -n "$existing_node" ]] &&
      "$existing_node" -e 'process.exit(Number(process.versions.node.split(".")[0]) < 20 ? 1 : 0)' 2>/dev/null; then
      /bin/ln -s "${existing_node:a}" "$runtime_dir/bin/node"
      return $?
    fi
  done

  version=v24.22.3
  machine=$(/usr/bin/uname -m)
  if [[ "$machine" == arm64 || "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null)" == 1 ]]; then
    arch=arm64
    checksum=1d64136c8a43d648d1b3bad10797a4c995b1ca032d2bde8799de43b37f058fe5
  elif [[ "$machine" == x86_64 ]]; then
    arch=x64
    checksum=4daeec962855c1a6e66cda398a25037319dc1bbd4a0939188b3547afbbfb6490
  else
    print -u2 "Unsupported Mac architecture: $machine"
    return 1
  fi
  archive_name="node-$version-darwin-$arch"
  archive_path="$stage_dir/$archive_name.tar.xz"
  print "Downloading Node.js for this app…"
  /usr/bin/curl --proto '=https' --proto-redir '=https' --fail --location \
    --retry 2 --silent --show-error --output "$archive_path" \
    "https://nodejs.org/dist/$version/$archive_name.tar.xz" || return 1
  if ! print -r -- "$checksum  $archive_path" | /usr/bin/shasum -a 256 --check --status; then
    print -u2 "The Node.js download failed its checksum. Try the installer again."
    return 1
  fi
  /usr/bin/tar -xf "$archive_path" -C "$runtime_dir" --strip-components 1 \
    "$archive_name/bin/node" "$archive_name/LICENSE" || return 1
  "$runtime_dir/bin/node" --version
}

install_quiz_capture() {
  if [[ "$(/usr/bin/uname -s)" != Darwin ]]; then
    print -u2 "Quiz Capture requires macOS."
    return 1
  fi
  if [[ ! -f "$launcher_source" || ! -f "$package_dir/Resources/Quiz Capture/capture.mjs" ]]; then
    print -u2 "Unzip the complete package and run the installer from the unzipped folder."
    return 1
  fi
  if [[ -e "$desktop_launcher" || -L "$desktop_launcher" ]]; then
    if [[ -L "$desktop_launcher" ]] || ! /usr/bin/cmp -s "$desktop_launcher" "$launcher_source"; then
      print -u2 "A different file already exists at $desktop_launcher. Move it aside and retry."
      return 1
    fi
  fi

  /bin/mkdir -p "$support_dir" "$HOME/Desktop" || return 1
  if [[ ! -d "$app_dir" ]]; then
    stage_dir=$(/usr/bin/mktemp -d "$support_dir/.install.XXXXXXXX") || return 1
    /bin/mkdir "$stage_dir/app" || return 1
    /bin/cp -R "$package_dir/Resources/Quiz Capture" "$stage_dir/app/" || return 1
    install_runtime "$stage_dir/app/runtime" || return 1

    local staged_node="$stage_dir/app/runtime/bin/node"
    local payload="$stage_dir/app/Quiz Capture"
    (
      cd -- "$payload" || exit 1
      "$staged_node" -e 'require("playwright")' || exit 1
      if [[ ! -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]] &&
        ! "$staged_node" -e 'require("node:fs").accessSync(require("playwright").chromium.executablePath())' >/dev/null 2>&1; then
        print "Downloading Chromium for Quiz Capture…"
        "$staged_node" node_modules/playwright/cli.js install chromium --no-shell --no-remove || exit 1
      fi
    ) || return 1

    "$staged_node" -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' \
      "$stage_dir/app" "$app_dir" || return 1
  fi

  if [[ ! -x "$app_dir/runtime/bin/node" || ! -f "$app_dir/Quiz Capture/capture.mjs" ]]; then
    print -u2 "The existing Quiz Capture installation is incomplete at $app_dir."
    return 1
  fi
  if [[ ! -f "$desktop_launcher" ]]; then
    (setopt noclobber; /bin/cat "$launcher_source" > "$desktop_launcher") || return 1
  fi
  /bin/chmod 755 "$desktop_launcher" || return 1
  print -r -- "Installed. Double-click Start Socrative and Mentimeter Quiz Capture.command on your Desktop."
}

install_quiz_capture
install_exit_code=$?
if (( install_exit_code != 0 )); then
  print -u2 "Installation stopped. See the message above."
  if [[ -t 0 ]]; then
    read -r '?Press Return to close this window. '
  fi
fi
exit "$install_exit_code"
