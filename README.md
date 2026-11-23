# Quiz Capture

Quiz Capture watches the Socrative or Mentimeter participant window and saves a PNG when the question changes. It runs locally and uses your own quiz code or participation link.

## Download and install

| Platform | Download | Open after extracting |
| --- | --- | --- |
| macOS | [Quiz-Capture-macOS.zip](https://github.com/SashankUday/quiz-capture/releases/latest/download/Quiz-Capture-macOS.zip) | Double-click **Install Quiz Capture.command**. Start it from the **Start Socrative and Mentimeter Quiz Capture** Desktop launcher. |
| Windows | [Quiz-Capture-Windows.zip](https://github.com/SashankUday/quiz-capture/releases/latest/download/Quiz-Capture-Windows.zip) | Choose **Extract All**, then double-click **Install Quiz Capture.cmd**. Open **Start Quiz Capture** on your Desktop. |
| Linux | [Quiz-Capture-Linux.tar.gz](https://github.com/SashankUday/quiz-capture/releases/latest/download/Quiz-Capture-Linux.tar.gz) | Extract the archive, then right-click **Install Quiz Capture.sh** and choose **Run as a Program** if your file manager offers it. Open **Quiz Capture** from your applications menu. |

The packages target 64-bit Intel/AMD and ARM. Use macOS 14 or newer, Windows 11, or a graphical Linux desktop on Ubuntu 22.04/24.04 or Debian 12/13. On Windows 10, try it with current Google Chrome installed. Windows 10 is outside Playwright’s published desktop support and compatibility has not been verified. [Playwright system requirements](https://playwright.dev/docs/intro#system-requirements) · [Chrome system requirements](https://support.google.com/chrome/a/answer/7100626)

Install under your regular user account. Node.js and Playwright are included. The installer checks for Google Chrome first and downloads managed Chromium if needed. Internet access may be needed for that download and is required to join quizzes.

## Capture a quiz

Choose **Socrative** or **Mentimeter** in the launcher, then enter an optional quiz folder name. Enter your join code or paste your participation link into the browser that opens. Close the browser window to stop.

Look in **Desktop → Quiz Screenshots**. Each run has its own timestamped folder, nested under the quiz name if you entered one. Quiz Capture uses the redirected Desktop on Windows and the XDG Desktop on Linux. If the Desktop is unavailable, look in **Quiz Screenshots** in your home folder. Set the absolute `QUIZ_CAPTURE_SCREENSHOTS` environment variable to choose another output location.

## Install from a terminal or with an AI agent

Give the agent this repository URL and have it run the commands for your OS as your regular user. A GitHub account and a Git clone are unnecessary. Stop if a command returns a nonzero exit code. The verification command opens Chromium or Chrome headlessly and checks that it can take a screenshot.

### macOS or Linux

```sh
(
  set -eu
  quiz_tmp="$(mktemp -d "${TMPDIR:-/tmp}/quiz-capture.XXXXXXXX")"
  base=https://github.com/SashankUday/quiz-capture/releases/latest/download
  case "$(uname -s)" in
    Darwin)
      curl -fL "$base/Quiz-Capture-macOS.zip" -o "$quiz_tmp/quiz.zip"
      unzip -q "$quiz_tmp/quiz.zip" -d "$quiz_tmp"
      installer="Install Quiz Capture.command"
      launcher="$HOME/Desktop/Start Socrative and Mentimeter Quiz Capture.command"
      ;;
    Linux)
      curl -fL "$base/Quiz-Capture-Linux.tar.gz" -o "$quiz_tmp/quiz.tar.gz"
      tar -xzf "$quiz_tmp/quiz.tar.gz" -C "$quiz_tmp"
      installer="Install Quiz Capture.sh"
      launcher="${XDG_DATA_HOME:-$HOME/.local/share}/quiz-capture/quiz-capture"
      ;;
    *) exit 1 ;;
  esac
  "$quiz_tmp/Socrative and Mentimeter Quiz Capture/$installer" --non-interactive </dev/null
  "$launcher" --verify
)
```

Run the launcher again without `--verify` to start capture. On Linux with a file manager that only opens scripts as text, open a terminal in the extracted folder and run `./"Install Quiz Capture.sh"`.

### Windows PowerShell

```powershell
$ErrorActionPreference = 'Stop'
$quizTmp = Join-Path ([IO.Path]::GetTempPath()) ('quiz-capture-' + [guid]::NewGuid())
New-Item -ItemType Directory $quizTmp | Out-Null
$zip = Join-Path $quizTmp 'Quiz-Capture-Windows.zip'
$uri = 'https://github.com/SashankUday/quiz-capture/releases/latest/download/Quiz-Capture-Windows.zip'
curl.exe -fL -o $zip $uri
if ($LASTEXITCODE -ne 0) { throw 'Quiz Capture download failed.' }
Expand-Archive -LiteralPath $zip -DestinationPath $quizTmp
& (Join-Path $quizTmp 'Socrative and Mentimeter Quiz Capture\Install Quiz Capture.cmd') --non-interactive
if ($LASTEXITCODE -ne 0) { throw 'Quiz Capture installation failed.' }
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
& (Join-Path $desktop 'Start Quiz Capture.cmd') --verify
if ($LASTEXITCODE -ne 0) { throw 'Quiz Capture browser verification failed.' }
```

To capture, open the Desktop launcher without `--verify`.

## Troubleshooting

- **macOS blocks the installer.** If you trust the download, try opening it in Finder, then use **System Settings → Privacy & Security → Open Anyway**. [Apple’s instructions](https://support.apple.com/en-us/102445)
- **Windows blocks the installer.** Use the official release ZIP, extract it completely, and check with your administrator if a managed device blocks it. The batch installer uses the bundled runtime without changing PowerShell execution policy.
- **Linux reports missing libraries.** On Ubuntu/Debian, run `./"Install Quiz Capture.sh" --install-system-deps` from the extracted folder. Playwright may ask for administrator authorization to install system packages. Run the script as your own user.
- **Linux reports a browser sandbox error.** Try your distro’s supported Chrome setup. On Ubuntu 24.04 and later, your administrator may need a browser-specific AppArmor profile for downloaded Chromium. Quiz Capture keeps the Chromium sandbox enabled. [Ubuntu’s AppArmor guidance](https://documentation.ubuntu.com/release-notes/24.04/#unprivileged-user-namespace-restrictions)
- **Linux reports a missing display.** Launch from your graphical desktop session. A headless server can run `--verify` but cannot show the quiz browser.
- **Installer reports a different launcher already exists.** Move that item aside and rerun the installer. If a previous installation was interrupted and no installer is running, remove the empty `.install-lock` directory under the app data folder and retry.

## Update or uninstall

To update, close Quiz Capture and run the installer from the latest release. It validates the new version before selecting it, retains the previous app version, and reuses the same launcher. Existing macOS v1.0.0/v1.0.1 release launchers are recognised.

To uninstall, close Quiz Capture and remove its launcher and application folder. Screenshots are stored separately.

| Platform | App folder | Launcher |
| --- | --- | --- |
| macOS | `~/Library/Application Support/Socrative and Mentimeter Quiz Capture` | **Start Socrative and Mentimeter Quiz Capture.command** on the Desktop |
| Windows | `%LOCALAPPDATA%\Quiz Capture` | **Start Quiz Capture.cmd** on the Desktop |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/quiz-capture` | `quiz-capture.desktop` under the `applications` directory in the same data home |

To reinstall damaged app files, move the app folder aside and run the installer again. Browser downloads live in the shared Playwright cache.

## Run from source or build a package

From a Git clone, use Node.js 22 or 24 in **Resources/Quiz Capture**.

```sh
npm ci --omit=optional --ignore-scripts
npm test
npx playwright install chromium --no-shell  # if Chrome is unavailable
npm start
```

Run `npm start -- --verify` for a browser check. On Linux, use `npx playwright install-deps chromium` if you need system libraries. To build the archive for your OS, run `python scripts/package.py` from the repository root after `npm ci`. The packaging script verifies the official Node.js runtime downloads against pinned checksums.

GitHub Actions builds and smoke-tests each platform archive and uploads it as a workflow artifact. Publishing requires an explicit workflow dispatch on `main` with the release tag matching the app version. Bump the version in both package manifests when changing the installed files.
